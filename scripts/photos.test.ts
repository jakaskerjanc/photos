import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, afterEach, beforeEach, describe, it } from "node:test";
import { exiftool } from "exiftool-vendored";
import sharp from "sharp";
import { processPhoto, thumbnailQualityFor, thumbnailSizes } from "./photos";

after(async () => {
  await exiftool.end();
});

describe("thumbnailSizes", () => {
  it("uses 640px and 960px wide thumbnails for normal photos", () => {
    assert.deepEqual(thumbnailSizes(4000, 3000), [
      { width: 640, height: 480 },
      { width: 960, height: 720 },
    ]);
    assert.deepEqual(thumbnailSizes(3000, 4000), [
      { width: 640, height: 853 },
      { width: 960, height: 1280 },
    ]);
  });

  it("sizes panoramas for a 960px display height, with a single thumbnail", () => {
    assert.deepEqual(thumbnailSizes(8000, 4000), [{ width: 1920, height: 960 }]);
  });

  it("caps panorama thumbnails at 6144px wide", () => {
    assert.deepEqual(thumbnailSizes(40000, 2000), [{ width: 6144, height: 307 }]);
  });

  it("never enlarges small photos", () => {
    assert.deepEqual(thumbnailSizes(300, 200), [{ width: 300, height: 200 }]);
    assert.deepEqual(thumbnailSizes(800, 600), [
      { width: 640, height: 480 },
      { width: 800, height: 600 },
    ]);
    assert.deepEqual(thumbnailSizes(1000, 400), [{ width: 1000, height: 400 }]);
  });
});

describe("thumbnailQualityFor", () => {
  it("uses the normal quality for typical photos", () => {
    // 24 MP stored in 3 MB is 1 bit per pixel.
    assert.equal(thumbnailQualityFor(3_000_000, 6000, 4000), 76);
  });

  it("uses a higher quality for sources that are already heavily compressed", () => {
    // 24 MP stored in 600 KB is 0.2 bits per pixel.
    assert.equal(thumbnailQualityFor(600_000, 6000, 4000), 90);
  });

  it("judges file size relative to resolution", () => {
    // The same 600 KB is a generous size for a 1200x800 image.
    assert.equal(thumbnailQualityFor(600_000, 1200, 800), 76);
  });
});

describe("processPhoto", () => {
  let root: string;
  let sourceDirectory: string;
  let directories: { derivatives: string; fullImages: string };

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "photos-test-"));
    sourceDirectory = join(root, "source");
    directories = { derivatives: join(root, "derivatives"), fullImages: join(root, "full") };
    await Promise.all([sourceDirectory, directories.derivatives, directories.fullImages].map((d) => mkdir(d)));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  // A 1200x800 JPEG tagged to be displayed rotated 90° (portrait), with a color profile and GPS position.
  async function writeCameraJpeg(fileName: string) {
    const path = join(sourceDirectory, fileName);
    await sharp({ create: { width: 1200, height: 800, channels: 3, background: "red" } })
      .withIccProfile("p3")
      .withMetadata({ orientation: 6 })
      .withExif({
        IFD0: { Make: "SONY", Model: "ILCE-6700" },
        IFD2: { DateTimeOriginal: "2026:08:06 18:39:07" },
        IFD3: { GPSLatitudeRef: "N", GPSLatitude: "46/1 22/1 0/1" },
      })
      .jpeg()
      .toFile(path);
    return path;
  }

  it("reports the displayed size of rotated photos and keeps color profile and rotation but not GPS", async () => {
    const sourcePath = await writeCameraJpeg("portrait.jpg");
    assert.ok((await exiftool.read(sourcePath)).GPSLatitude, "fixture should contain GPS");

    const result = await processPhoto(sourcePath, directories);

    assert.ok(!("skipped" in result));
    assert.equal(result.width, 800);
    assert.equal(result.height, 1200);
    // The 800px wide source is not enlarged to 960px.
    assert.deepEqual(result.thumbnails, [
      { path: join(directories.derivatives, "portrait-640w.webp"), width: 640, height: 960 },
      { path: join(directories.derivatives, "portrait-800w.webp"), width: 800, height: 1200 },
    ]);

    for (const { path, width, height } of result.thumbnails) {
      const thumbnail = await sharp(path).metadata();
      assert.deepEqual([thumbnail.width, thumbnail.height], [width, height]);
    }

    const fullImageTags = await exiftool.read(result.fullImagePath);
    assert.equal(fullImageTags.GPSLatitude, undefined);
    assert.equal(fullImageTags.Orientation, 6);
    assert.ok(fullImageTags.ProfileDescription, "full image should keep its color profile");
  });

  it("reads the capture date and camera from the source", async () => {
    const result = await processPhoto(await writeCameraJpeg("a.jpg"), directories);
    assert.ok(!("skipped" in result));

    assert.deepEqual(result.taken, { year: 2026, month: 8, day: 6 });
    assert.equal(result.exposure, "Sony α6700");
  });

  it("creates a tiny rotated placeholder preview", async () => {
    const result = await processPhoto(await writeCameraJpeg("portrait.jpg"), directories);
    assert.ok(!("skipped" in result));

    const [prefix, data] = result.placeholder.split(",");
    assert.equal(prefix, "data:image/webp;base64");
    const preview = await sharp(Buffer.from(data, "base64")).metadata();
    assert.deepEqual([preview.width, preview.height], [8, 12]);
    assert.ok(result.placeholder.length < 500, "placeholder should stay small enough to inline");
  });

  it("leaves no temporary files behind", async () => {
    await processPhoto(await writeCameraJpeg("a.jpg"), directories);

    assert.deepEqual((await readdir(directories.derivatives)).sort(), ["a-640w.webp", "a-800w.webp"]);
    assert.deepEqual(await readdir(directories.fullImages), ["a.jpg"]);
  });

  it("skips files that cannot be read as images", async () => {
    const sourcePath = join(sourceDirectory, "broken.jpg");
    await writeFile(sourcePath, "not an image");

    const result = await processPhoto(sourcePath, directories);

    assert.ok("skipped" in result);
    assert.match(result.skipped, /^image could not be read: /);
    assert.deepEqual(await readdir(directories.fullImages), []);
  });

  it("rebuilds outputs whenever the source's modification time changes, newer or older", async () => {
    const sourcePath = await writeCameraJpeg("a.jpg");
    const first = await processPhoto(sourcePath, directories);
    assert.ok(!("skipped" in first));
    const outputPaths = [first.fullImagePath, ...first.thumbnails.map(({ path }) => path)];
    const outputTimes = () => Promise.all(outputPaths.map(async (path) => (await stat(path)).mtimeMs));

    // Whole seconds, because file systems may round sub-millisecond parts of a timestamp.
    const newerTime = new Date(Math.floor(Date.now() / 1000) * 1000 + 60_000);
    await utimes(sourcePath, newerTime, newerTime);
    await processPhoto(sourcePath, directories);
    assert.deepEqual(await outputTimes(), outputPaths.map(() => newerTime.getTime()));

    // An older replacement file (e.g. restored with `cp -p`) must also trigger a rebuild.
    const olderTime = new Date("2019-01-01T00:00:00Z");
    await utimes(sourcePath, olderTime, olderTime);
    await processPhoto(sourcePath, directories);
    assert.deepEqual(await outputTimes(), outputPaths.map(() => olderTime.getTime()));
  });

  it("reuses outputs while the source is unchanged", async () => {
    const sourcePath = await writeCameraJpeg("a.jpg");
    const first = await processPhoto(sourcePath, directories);
    assert.ok(!("skipped" in first));
    const outputPaths = [first.fullImagePath, ...first.thumbnails.map(({ path }) => path)];
    // Rebuilds replace the file, so its inode would change.
    const inodes = () => Promise.all(outputPaths.map(async (path) => (await stat(path)).ino));

    const before = await inodes();
    await processPhoto(sourcePath, directories);

    assert.deepEqual(await inodes(), before);
  });
});
