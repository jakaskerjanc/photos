import { copyFile, mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";
import { imageSize } from "image-size";
import sharp from "sharp";

type ImageSource = { src: string; width: number; height: number };
type PhotoManifestEntry = ImageSource & { thumbnail: ImageSource };

const projectRoot = process.cwd();
const sourcePhotosDirectory = join(projectRoot, "photos");
const publicDirectory = join(projectRoot, "public");
const derivativesDirectory = join(publicDirectory, "photos", "derivatives");
const fullImagesDirectory = join(publicDirectory, "photos", "full");
const generatedDirectory = join(projectRoot, "src", "generated");
const manifestPath = join(generatedDirectory, "photos.ts");
const supportedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);
const thumbnailWidth = 640;
const panoramaAspectRatio = 2;
const panoramaThumbnailHeight = 960;
const maxPanoramaThumbnailWidth = 6144;

await mkdir(sourcePhotosDirectory, { recursive: true });
await mkdir(derivativesDirectory, { recursive: true });
await mkdir(fullImagesDirectory, { recursive: true });
await mkdir(generatedDirectory, { recursive: true });

const entries = await readdir(sourcePhotosDirectory, { withFileTypes: true });
const photoFiles = entries
  .filter((entry) => entry.isFile() && supportedExtensions.has(extname(entry.name).toLowerCase()))
  .map((entry) => entry.name)
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));

function urlFor(filePath: string) {
  const encodedPath = relative(publicDirectory, filePath)
    .split(sep)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `\${import.meta.env.BASE_URL}${encodedPath}`;
}

async function derivativeIsCurrent(sourcePath: string, derivativePath: string) {
  try {
    const [source, derivative] = await Promise.all([stat(sourcePath), stat(derivativePath)]);
    return derivative.mtimeMs >= source.mtimeMs;
  } catch {
    return false;
  }
}

const photoEntries: PhotoManifestEntry[] = [];
const expectedDerivativeFiles = new Set<string>();
const expectedFullImageFiles = new Set(photoFiles);

for (const fileName of photoFiles) {
  const filePath = join(sourcePhotosDirectory, fileName);
  const { width, height } = imageSize(await readFile(filePath));

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    console.warn(`Skipping ${fileName}: image dimensions could not be read.`);
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
  const derivativePath = join(derivativesDirectory, derivativeName);
  const fullImagePath = join(fullImagesDirectory, fileName);
  expectedDerivativeFiles.add(derivativeName);

  if (!(await derivativeIsCurrent(filePath, derivativePath))) {
    await sharp(filePath)
      .resize({ width: thumbnailPixelWidth, withoutEnlargement: true })
      .webp({ quality: 76 })
      .toFile(derivativePath);
  }

  if (!(await derivativeIsCurrent(filePath, fullImagePath))) {
    await copyFile(filePath, fullImagePath);
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

async function removeStaleFiles(directory: string, expectedFiles: Set<string>) {
  const directoryEntries = await readdir(directory, { withFileTypes: true });
  await Promise.all(
    directoryEntries
      .filter((entry) => entry.isFile() && !expectedFiles.has(entry.name))
      .map((entry) => unlink(join(directory, entry.name))),
  );
}

await Promise.all([
  removeStaleFiles(derivativesDirectory, expectedDerivativeFiles),
  removeStaleFiles(fullImagesDirectory, expectedFullImageFiles),
]);

const formattedPhotoEntries = photoEntries.map(
  ({ src, width, height, thumbnail }) =>
    `  { src: \`${src}\`, width: ${width}, height: ${height}, thumbnail: { src: \`${thumbnail.src}\`, width: ${thumbnail.width}, height: ${thumbnail.height} } }`,
);

const manifest = `export type GalleryPhoto = {
  src: string;
  width: number;
  height: number;
  thumbnail: { src: string; width: number; height: number };
};

export const photos: GalleryPhoto[] = [
${formattedPhotoEntries.join(",\n")}
];
`;

await writeFile(manifestPath, manifest, "utf8");
console.log(`Generated photo manifest with ${photoEntries.length} photo${photoEntries.length === 1 ? "" : "s"}.`);
