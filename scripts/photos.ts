import type { Stats } from "node:fs";
import { copyFile, rename, rm, stat, utimes } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { exiftool } from "exiftool-vendored";
import sharp from "sharp";

const thumbnailWidth = 640;
const panoramaAspectRatio = 2;
const panoramaThumbnailHeight = 960;
const maxPanoramaThumbnailWidth = 6144;
const thumbnailQuality = 76;

export type PhotoOutputDirectories = { derivatives: string; fullImages: string };

export type ProcessedPhoto = {
  width: number;
  height: number;
  fullImagePath: string;
  thumbnail: { path: string; width: number; height: number };
};

export function thumbnailSize(width: number, height: number) {
  const aspectRatio = width / height;
  const targetWidth =
    aspectRatio >= panoramaAspectRatio
      ? Math.min(maxPanoramaThumbnailWidth, Math.round(aspectRatio * panoramaThumbnailHeight))
      : thumbnailWidth;
  const thumbnailPixelWidth = Math.min(width, targetWidth);
  return { width: thumbnailPixelWidth, height: Math.round((height * thumbnailPixelWidth) / width) };
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
  const thumbnail = thumbnailSize(size.width, size.height);
  const thumbnailPath = join(
    directories.derivatives,
    `${fileName.slice(0, -extname(fileName).length)}-${thumbnail.width}w.webp`,
  );
  const fullImagePath = join(directories.fullImages, fileName);

  if (!(await outputIsCurrent(source, thumbnailPath))) {
    await writeOutput(source, thumbnailPath, (temporaryPath) =>
      sharp(sourcePath, { autoOrient: true })
        .resize({ width: thumbnail.width, withoutEnlargement: true })
        .webp({ quality: thumbnailQuality })
        .toFile(temporaryPath),
    );
  }

  if (!(await outputIsCurrent(source, fullImagePath))) {
    await writeOutput(source, fullImagePath, async (temporaryPath) => {
      await copyFile(sourcePath, temporaryPath);
      await stripMetadata(temporaryPath);
    });
  }

  return { ...size, fullImagePath, thumbnail: { path: thumbnailPath, ...thumbnail } };
}
