import type { Stats } from "node:fs";
import { copyFile, rename, rm, stat, utimes } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { exiftool } from "exiftool-vendored";
import sharp from "sharp";

// 640px covers a grid photo on a normal screen; 960px keeps landscape photos sharp on 2x screens.
const thumbnailWidths = [640, 960];
const panoramaAspectRatio = 2;
const panoramaThumbnailHeight = 960;
const maxPanoramaThumbnailWidth = 6144;
const thumbnailQuality = 76;
// A source file this small for its resolution is already heavily compressed. Its thumbnail is encoded at a
// higher quality so the second round of compression doesn't smear the detail that is left.
const compressedSourceBitsPerPixel = 0.3;
const compressedSourceThumbnailQuality = 90;
// A few hundred bytes each, so every photo's preview can be inlined in the manifest.
const placeholderSize = 12;
const placeholderQuality = 40;

export type PhotoOutputDirectories = { derivatives: string; fullImages: string };

export type ProcessedThumbnail = { path: string; width: number; height: number };

export type ProcessedPhoto = {
  width: number;
  height: number;
  fullImagePath: string;
  placeholder: string;
  thumbnails: ProcessedThumbnail[]; // smallest first
};

// Panoramas get a single thumbnail that is already large enough for any screen.
// Small photos are never enlarged, so they may end up with only one size.
export function thumbnailSizes(width: number, height: number) {
  const aspectRatio = width / height;
  const targetWidths =
    aspectRatio >= panoramaAspectRatio
      ? [Math.min(maxPanoramaThumbnailWidth, Math.round(aspectRatio * panoramaThumbnailHeight))]
      : thumbnailWidths;
  const pixelWidths = [...new Set(targetWidths.map((targetWidth) => Math.min(width, targetWidth)))];
  return pixelWidths.map((pixelWidth) => ({ width: pixelWidth, height: Math.round((height * pixelWidth) / width) }));
}

export function thumbnailQualityFor(fileBytes: number, width: number, height: number) {
  const bitsPerPixel = (fileBytes * 8) / (width * height);
  return bitsPerPixel < compressedSourceBitsPerPixel ? compressedSourceThumbnailQuality : thumbnailQuality;
}

// Outputs carry their source's modification time, so any change to the source (newer or older) triggers a rebuild.
async function outputIsCurrent(source: Stats, outputPath: string) {
  try {
    return Math.abs((await stat(outputPath)).mtimeMs - source.mtimeMs) < 1;
  } catch {
    return false;
  }
}

// Writes to a hidden temporary file and only renames it into place once it is complete, so a failed or
// interrupted run never leaves a partial output (or an unstripped full image) that looks current.
async function writeOutput(source: Stats, outputPath: string, write: (temporaryPath: string) => Promise<unknown>) {
  const temporaryPath = join(dirname(outputPath), `.tmp-${basename(outputPath)}`);
  try {
    await write(temporaryPath);
    await utimes(temporaryPath, source.atime, source.mtime);
    await rename(temporaryPath, outputPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

// Strips EXIF/GPS/IPTC/XMP by editing the container's metadata directly, so the pixel data is untouched
// (no quality loss, no encoder dimension limits). The color profile and rotation are needed to display the photo.
async function stripMetadata(path: string) {
  await exiftool.write(path, {}, {
    writeArgs: ["-all=", "-tagsFromFile", "@", "-ICC_Profile", "-Orientation", "-overwrite_original"],
  });
}

// Read from the smallest thumbnail rather than the source: it is fast and is already rotated.
async function placeholderFor(thumbnailPath: string) {
  const preview = await sharp(thumbnailPath)
    .resize(placeholderSize, placeholderSize, { fit: "inside" })
    .webp({ quality: placeholderQuality })
    .toBuffer();
  return `data:image/webp;base64,${preview.toString("base64")}`;
}

async function readDisplayedSize(sourcePath: string) {
  const { autoOrient } = await sharp(sourcePath).metadata();
  if (!(autoOrient.width > 0 && autoOrient.height > 0)) {
    throw new Error("missing dimensions");
  }
  return autoOrient;
}

export async function processPhoto(
  sourcePath: string,
  directories: PhotoOutputDirectories,
): Promise<ProcessedPhoto | { skipped: string }> {
  let size: { width: number; height: number };
  try {
    size = await readDisplayedSize(sourcePath);
  } catch (error) {
    return { skipped: `image could not be read: ${(error as Error).message}` };
  }

  const source = await stat(sourcePath);
  const fileName = basename(sourcePath);
  const baseName = fileName.slice(0, -extname(fileName).length);
  const thumbnails = thumbnailSizes(size.width, size.height).map((thumbnail) => ({
    path: join(directories.derivatives, `${baseName}-${thumbnail.width}w.webp`),
    ...thumbnail,
  }));
  const fullImagePath = join(directories.fullImages, fileName);

  for (const thumbnail of thumbnails) {
    if (!(await outputIsCurrent(source, thumbnail.path))) {
      await writeOutput(source, thumbnail.path, (temporaryPath) =>
        sharp(sourcePath, { autoOrient: true })
          .resize({ width: thumbnail.width, withoutEnlargement: true })
          .webp({ quality: thumbnailQualityFor(source.size, size.width, size.height) })
          .toFile(temporaryPath),
      );
    }
  }

  if (!(await outputIsCurrent(source, fullImagePath))) {
    await writeOutput(source, fullImagePath, async (temporaryPath) => {
      await copyFile(sourcePath, temporaryPath);
      await stripMetadata(temporaryPath);
    });
  }

  return { ...size, fullImagePath, placeholder: await placeholderFor(thumbnails[0].path), thumbnails };
}
