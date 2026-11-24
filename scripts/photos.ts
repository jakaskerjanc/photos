import type { Stats } from "node:fs";
import { copyFile, rename, rm, stat, utimes } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { exiftool } from "exiftool-vendored";
import sharp from "sharp";
import { type CaptureDate, cameraName, captureDate, exposureSettings } from "./exif";

// Grid rows are about 280px tall, so a portrait photo is shown around 190px wide and a landscape one around
// 420px, or up to the full screen width on phones. Several sizes let the browser pick the smallest one
// that is sharp at the displayed size and the screen's pixel density; 960px keeps landscape photos sharp on 2x screens.
const thumbnailWidths = [320, 480, 640, 960];
const panoramaAspectRatio = 2;
// A panorama fills the page width, so its displayed height is the screen width divided by its aspect ratio:
// 480px covers phones and normal screens, 960px wide 2x screens.
const panoramaThumbnailHeights = [480, 960];
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
  taken?: CaptureDate;
  camera?: string; // e.g. "Sony α6700"
  settings?: string[]; // e.g. ["16mm", "f/8", "1/250 s", "ISO 100"]; never empty
  file: string[]; // the published file's resolution and size, e.g. ["6192 × 4128", "25.6 MP", "8.4 MB"]
};

// Panoramas are sized by height rather than width, capped at maxPanoramaThumbnailWidth.
// Small photos are never enlarged, so they may end up with fewer sizes.
export function thumbnailSizes(width: number, height: number) {
  const aspectRatio = width / height;
  const targetWidths =
    aspectRatio >= panoramaAspectRatio
      ? panoramaThumbnailHeights.map((height) => Math.min(maxPanoramaThumbnailWidth, Math.round(aspectRatio * height)))
      : thumbnailWidths;
  const pixelWidths = [...new Set(targetWidths.map((targetWidth) => Math.min(width, targetWidth)))];
  return pixelWidths.map((pixelWidth) => ({ width: pixelWidth, height: Math.round((height * pixelWidth) / width) }));
}

export function thumbnailQualityFor(fileBytes: number, width: number, height: number) {
  const bitsPerPixel = (fileBytes * 8) / (width * height);
  return bitsPerPixel < compressedSourceBitsPerPixel ? compressedSourceThumbnailQuality : thumbnailQuality;
}

function oneDecimal(value: number) {
  return String(Math.round(value * 10) / 10);
}

// Sizes in decimal units (1 MB = 1,000,000 bytes), as file managers on macOS and most Linux desktops show them.
export function formatFileSize(bytes: number) {
  if (bytes < 1_000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${Math.round(bytes / 1_000)} KB`;
  return `${oneDecimal(bytes / 1_000_000)} MB`;
}

// Megapixels are only worth showing for camera-sized images; "0.3 MP" says less than the dimensions do.
export function fileDetails(width: number, height: number, bytes: number) {
  const megapixels = (width * height) / 1_000_000;
  const resolution = `${width} × ${height}`;
  const size = formatFileSize(bytes);
  return megapixels >= 1 ? [resolution, `${oneDecimal(megapixels)} MP`, size] : [resolution, size];
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

// Read from the source, before the published copy is stripped. A file exiftool can't read just has no details.
async function readDetails(sourcePath: string) {
  try {
    const tags = await exiftool.read(sourcePath);
    return { taken: captureDate(tags), camera: cameraName(tags.Make, tags.Model), settings: exposureSettings(tags) };
  } catch {
    return {};
  }
}

async function readDisplayedSize(sourcePath: string) {
  const { autoOrient } = await sharp(sourcePath).metadata();
  if (!(autoOrient.width > 0 && autoOrient.height > 0)) {
    throw new Error("missing dimensions");
  }
  return autoOrient;
}

// The 1.91:1 size that Facebook, LinkedIn, X and chat apps show in link previews.
export const linkPreviewSize = { width: 1200, height: 630 };

// Cropped around the photo's centre. Like the thumbnails, it carries no metadata (no GPS position).
export async function writeLinkPreview(sourcePath: string, outputPath: string) {
  const source = await stat(sourcePath);
  if (await outputIsCurrent(source, outputPath)) return;
  await writeOutput(source, outputPath, (temporaryPath) =>
    sharp(sourcePath, { autoOrient: true })
      .resize(linkPreviewSize.width, linkPreviewSize.height, { fit: "cover" })
      .jpeg({ quality: 82, mozjpeg: true })
      .toFile(temporaryPath),
  );
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

  const staleThumbnails = [];
  for (const thumbnail of thumbnails) {
    if (!(await outputIsCurrent(source, thumbnail.path))) staleThumbnails.push(thumbnail);
  }
  if (staleThumbnails.length > 0) {
    // Decoding a large source is most of the work, so it is decoded once, at the largest thumbnail's size
    // (rotated and converted to sRGB like a direct resize), and every thumbnail is scaled from that.
    const largest = thumbnails[thumbnails.length - 1];
    const { data, info } = await sharp(sourcePath, { autoOrient: true })
      .resize(largest.width, largest.height, { fit: "fill" })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const quality = thumbnailQualityFor(source.size, size.width, size.height);
    for (const thumbnail of staleThumbnails) {
      await writeOutput(source, thumbnail.path, (temporaryPath) =>
        sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
          .resize(thumbnail.width, thumbnail.height, { fit: "fill" })
          .webp({ quality })
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

  const { taken, camera, settings } = await readDetails(sourcePath);
  // Measured on the published copy, the file the lightbox's download button saves.
  const fullImage = await stat(fullImagePath);
  return {
    ...size,
    fullImagePath,
    placeholder: await placeholderFor(thumbnails[0].path),
    thumbnails,
    ...(taken && { taken }),
    ...(camera && { camera }),
    ...(settings?.length && { settings }),
    file: fileDetails(size.width, size.height, fullImage.size),
  };
}
