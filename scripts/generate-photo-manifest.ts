import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";
import { imageSize } from "image-size";

type PhotoManifestEntry = {
  src: string;
  width: number;
  height: number;
};

const projectRoot = process.cwd();
const photosDirectory = join(projectRoot, "public", "photos");
const generatedDirectory = join(projectRoot, "src", "generated");
const manifestPath = join(generatedDirectory, "photos.ts");
const supportedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);

await mkdir(photosDirectory, { recursive: true });
await mkdir(generatedDirectory, { recursive: true });

const entries = await readdir(photosDirectory, { withFileTypes: true });
const photoFiles = entries
  .filter(
    (entry) =>
      entry.isFile() && supportedExtensions.has(extname(entry.name).toLowerCase()),
  )
  .map((entry) => entry.name)
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));

const photoEntries: PhotoManifestEntry[] = [];

for (const fileName of photoFiles) {
  const filePath = join(photosDirectory, fileName);
  const { width, height } = imageSize(await readFile(filePath));

  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    console.warn(`Skipping ${fileName}: image dimensions could not be read.`);
    continue;
  }

  const urlPath = relative(photosDirectory, filePath).split(sep).join("/");
  const encodedPath = urlPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  photoEntries.push({
    src: `\${import.meta.env.BASE_URL}photos/${encodedPath}`,
    width,
    height,
  });
}

const formattedPhotoEntries = photoEntries.map(
  ({ src, width, height }) =>
    `  { src: \`${src}\`, width: ${width}, height: ${height} }`,
);

const manifest = `export type GalleryPhoto = {
  src: string;
  width: number;
  height: number;
};

export const photos: GalleryPhoto[] = [
${formattedPhotoEntries.join(",\n")}
];
`;

await writeFile(manifestPath, manifest, "utf8");
console.log(
  `Generated photo manifest with ${photoEntries.length} photo${photoEntries.length === 1 ? "" : "s"}.`,
);
