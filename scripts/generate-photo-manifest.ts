import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";
import { exiftool } from "exiftool-vendored";
import { imageSize } from "image-size";
import sharp from "sharp";
import { discoverAlbums } from "./albums";
import { formatManifest, type ManifestAlbum, type PhotoManifestEntry } from "./manifest";
import { removeStaleFiles } from "./stale-files";

const projectRoot = process.cwd();
const sourcePhotosDirectory = join(projectRoot, "photos");
const publicDirectory = join(projectRoot, "public");
const derivativesDirectory = join(publicDirectory, "photos", "derivatives");
const fullImagesDirectory = join(publicDirectory, "photos", "full");
const generatedDirectory = join(projectRoot, "src", "generated");
const manifestPath = join(generatedDirectory, "photos.ts");
const thumbnailWidth = 640;
const panoramaAspectRatio = 2;
const panoramaThumbnailHeight = 960;
const maxPanoramaThumbnailWidth = 6144;

await mkdir(sourcePhotosDirectory, { recursive: true });
await mkdir(derivativesDirectory, { recursive: true });
await mkdir(fullImagesDirectory, { recursive: true });
await mkdir(generatedDirectory, { recursive: true });

const { albums: albumSources, warnings } = await discoverAlbums(sourcePhotosDirectory);
for (const warning of warnings) {
  console.warn(warning);
}

function urlFor(filePath: string) {
  const encodedPath = relative(publicDirectory, filePath)
    .split(sep)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `\${import.meta.env.BASE_URL}${encodedPath}`;
}

async function writeFullImageWithoutMetadata(sourcePath: string, destinationPath: string) {
  await copyFile(sourcePath, destinationPath);
  // Strips EXIF/GPS/IPTC/XMP in place by editing the container's metadata boxes directly,
  // so the pixel data is untouched (no quality loss, no encoder dimension limits).
  await exiftool.write(destinationPath, {}, { writeArgs: ["-all=", "-overwrite_original"] });
}

async function derivativeIsCurrent(sourcePath: string, derivativePath: string) {
  try {
    const [source, derivative] = await Promise.all([stat(sourcePath), stat(derivativePath)]);
    return derivative.mtimeMs >= source.mtimeMs;
  } catch {
    return false;
  }
}

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

const manifestAlbums: ManifestAlbum[] = [];
const expectedDerivativeFiles = new Set<string>();
const expectedFullImageFiles = new Set<string>();

for (const album of albumSources) {
  // The loose album has slug "", so its files stay in the top-level output directories.
  const albumDerivativesDirectory = join(derivativesDirectory, album.slug);
  const albumFullImagesDirectory = join(fullImagesDirectory, album.slug);
  const expectedPathPrefix = album.slug ? `${album.slug}/` : "";
  await mkdir(albumDerivativesDirectory, { recursive: true });
  await mkdir(albumFullImagesDirectory, { recursive: true });

  const photoEntries: PhotoManifestEntry[] = [];

  for (const fileName of album.fileNames) {
    const filePath = join(album.directory, fileName);
    const { width, height } = imageSize(await readFile(filePath));

    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      console.warn(`Skipping ${relative(sourcePhotosDirectory, filePath)}: image dimensions could not be read.`);
      continue;
    }

    const aspectRatio = width / height;
    const thumbnailPixelWidth = Math.min(
      width,
      aspectRatio >= panoramaAspectRatio
        ? Math.min(maxPanoramaThumbnailWidth, Math.round(aspectRatio * panoramaThumbnailHeight))
        : thumbnailWidth,
    );
    const baseName = fileName.slice(0, -extname(fileName).length);
    const derivativeName = `${baseName}-${thumbnailPixelWidth}w.webp`;
    const derivativePath = join(albumDerivativesDirectory, derivativeName);
    const fullImagePath = join(albumFullImagesDirectory, fileName);
    expectedDerivativeFiles.add(`${expectedPathPrefix}${derivativeName}`);
    expectedFullImageFiles.add(`${expectedPathPrefix}${fileName}`);

    if (!(await derivativeIsCurrent(filePath, derivativePath))) {
      await sharp(filePath)
        .resize({ width: thumbnailPixelWidth, withoutEnlargement: true })
        .webp({ quality: 76 })
        .toFile(derivativePath);
    }

    if (!(await derivativeIsCurrent(filePath, fullImagePath))) {
      await writeFullImageWithoutMetadata(filePath, fullImagePath);
    }

    photoEntries.push({
      src: urlFor(fullImagePath),
      width,
      height,
      thumbnail: {
        src: urlFor(derivativePath),
        width: thumbnailPixelWidth,
        height: Math.round((height * thumbnailPixelWidth) / width),
      },
    });
  }

  if (photoEntries.length > 0) {
    manifestAlbums.push({ slug: album.slug, title: album.title, photos: photoEntries });
  }
}

await Promise.all([
  removeStaleFiles(derivativesDirectory, expectedDerivativeFiles),
  removeStaleFiles(fullImagesDirectory, expectedFullImageFiles),
]);

await writeFile(manifestPath, formatManifest(manifestAlbums), "utf8");
const photoCount = manifestAlbums.reduce((total, album) => total + album.photos.length, 0);
console.log(`Generated photo manifest with ${plural(photoCount, "photo")} in ${plural(manifestAlbums.length, "album")}.`);

await exiftool.end();
