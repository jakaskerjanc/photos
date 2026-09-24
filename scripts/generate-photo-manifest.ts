import { mkdir, writeFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { basename, join, posix, relative, sep } from "node:path";
import { exiftool } from "exiftool-vendored";
import type { GalleryAlbum } from "../src/gallery";
import { discoverAlbums } from "./albums";
import { mapWithConcurrency } from "./concurrency";
import { formatManifest } from "./manifest";
import { type PhotoOutputDirectories, processPhoto } from "./photos";
import { removeStaleFiles } from "./stale-files";

const projectRoot = process.cwd();
const sourcePhotosDirectory = join(projectRoot, "photos");
const publicDirectory = join(projectRoot, "public");
const derivativesDirectory = join(publicDirectory, "photos", "derivatives");
const fullImagesDirectory = join(publicDirectory, "photos", "full");
const generatedDirectory = join(projectRoot, "src", "generated");
const manifestPath = join(generatedDirectory, "photos.ts");

type PhotoJob = { albumIndex: number; slug: string; sourcePath: string; directories: PhotoOutputDirectories };

function urlFor(filePath: string) {
  const encodedPath = relative(publicDirectory, filePath)
    .split(sep)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `\${import.meta.env.BASE_URL}${encodedPath}`;
}

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

async function generateManifest() {
  await mkdir(sourcePhotosDirectory, { recursive: true });
  await mkdir(generatedDirectory, { recursive: true });

  const { albums: albumSources, warnings } = await discoverAlbums(sourcePhotosDirectory);
  for (const warning of warnings) {
    console.warn(warning);
  }

  const jobs: PhotoJob[] = [];
  for (const [albumIndex, album] of albumSources.entries()) {
    // The loose album has slug "", so joining it keeps its files in the top-level output directories.
    const directories = {
      derivatives: join(derivativesDirectory, album.slug),
      fullImages: join(fullImagesDirectory, album.slug),
    };
    await mkdir(directories.derivatives, { recursive: true });
    await mkdir(directories.fullImages, { recursive: true });

    for (const fileName of album.fileNames) {
      jobs.push({ albumIndex, slug: album.slug, sourcePath: join(album.directory, fileName), directories });
    }
  }

  const results = await mapWithConcurrency(jobs, availableParallelism(), (job) =>
    processPhoto(job.sourcePath, job.directories),
  );

  const manifestAlbums: GalleryAlbum[] = albumSources.map(({ slug, title }) => ({ slug, title, photos: [] }));
  const expectedDerivativeFiles = new Set<string>();
  const expectedFullImageFiles = new Set<string>();

  results.forEach((result, index) => {
    const { albumIndex, slug, sourcePath } = jobs[index];
    if ("skipped" in result) {
      console.warn(`Skipping ${relative(sourcePhotosDirectory, sourcePath)}: ${result.skipped}.`);
      return;
    }

    expectedDerivativeFiles.add(posix.join(slug, basename(result.thumbnail.path)));
    expectedFullImageFiles.add(posix.join(slug, basename(result.fullImagePath)));
    manifestAlbums[albumIndex].photos.push({
      src: urlFor(result.fullImagePath),
      width: result.width,
      height: result.height,
      thumbnail: { src: urlFor(result.thumbnail.path), width: result.thumbnail.width, height: result.thumbnail.height },
    });
  });

  const nonEmptyAlbums = manifestAlbums.filter((album) => album.photos.length > 0);

  await Promise.all([
    removeStaleFiles(derivativesDirectory, expectedDerivativeFiles),
    removeStaleFiles(fullImagesDirectory, expectedFullImageFiles),
  ]);

  await writeFile(manifestPath, formatManifest(nonEmptyAlbums), "utf8");
  const photoCount = nonEmptyAlbums.reduce((total, album) => total + album.photos.length, 0);
  console.log(`Generated photo manifest with ${plural(photoCount, "photo")} in ${plural(nonEmptyAlbums.length, "album")}.`);
}

try {
  await generateManifest();
} finally {
  await exiftool.end();
}
