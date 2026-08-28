import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";
import { imageSize } from "image-size";

const photosDirectory = join(process.cwd(), "public", "photos");
const manifestPath = join(process.cwd(), "src", "generated", "photos.ts");
const supportedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);

await mkdir(photosDirectory, { recursive: true });
await mkdir(join(process.cwd(), "src", "generated"), { recursive: true });

const entries = await readdir(photosDirectory, { withFileTypes: true });
const photoFiles = entries
  .filter((entry) => entry.isFile() && supportedExtensions.has(extname(entry.name).toLowerCase()))
  .map((entry) => entry.name)
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));

const photoEntries = [];

for (const fileName of photoFiles) {
  const filePath = join(photosDirectory, fileName);
  const { width, height } = imageSize(await readFile(filePath));

  if (!width || !height) {
    console.warn(`Skipping ${fileName}: image dimensions could not be read.`);
    continue;
  }

  const urlPath = relative(photosDirectory, filePath).split(sep).join("/");
  const encodedPath = urlPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  photoEntries.push(`  { src: \`${"${import.meta.env.BASE_URL}"}photos/${encodedPath}\`, width: ${width}, height: ${height} }`);
}

const manifest = `export type GalleryPhoto = {\n  src: string;\n  width: number;\n  height: number;\n};\n\nexport const photos: GalleryPhoto[] = [\n${photoEntries.join(",\n")}\n];\n`;

await writeFile(manifestPath, manifest, "utf8");
console.log(`Generated photo manifest with ${photoEntries.length} photo${photoEntries.length === 1 ? "" : "s"}.`);
