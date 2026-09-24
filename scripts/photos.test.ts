import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, afterEach, beforeEach, describe, it } from "node:test";
import { exiftool } from "exiftool-vendored";
import sharp from "sharp";
import { processPhoto, thumbnailSize } from "./photos";

after(async () => {
  await exiftool.end();
});

describe("thumbnailSize", () => {
  it("uses a 640px wide thumbnail for normal photos", () => {
    assert.deepEqual(thumbnailSize(4000, 3000), { width: 640, height: 480 });
    assert.deepEqual(thumbnailSize(3000, 4000), { width: 640, height: 853 });
  });

  it("sizes panoramas for a 960px display height", () => {
    assert.deepEqual(thumbnailSize(8000, 4000), { width: 1920, height: 960 });
  });

  it("caps panorama thumbnails at 6144px wide", () => {
    assert.deepEqual(thumbnailSize(40000, 2000), { width: 6144, height: 307 });
  });

  it("never enlarges small photos", () => {
    assert.deepEqual(thumbnailSize(300, 200), { width: 300, height: 200 });
    assert.deepEqual(thumbnailSize(1000, 400), { width: 1000, height: 400 });
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
      .withExif({ IFD3: { GPSLatitudeRef: "N", GPSLatitude: "46/1 22/1 0/1" } })
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
    assert.deepEqual(result.thumbnail, {
      path: join(directories.derivatives, "portrait-640w.webp"),
      width: 640,
      height: 960,
    });

    const thumbnail = await sharp(result.thumbnail.path).metadata();
    assert.deepEqual([thumbnail.width, thumbnail.height], [640, 960]);

    const fullImageTags = await exiftool.read(result.fullImagePath);
    assert.equal(fullImageTags.GPSLatitude, undefined);
    assert.equal(fullImageTags.Orientation, 6);
    assert.ok(fullImageTags.ProfileDescription, "full image should keep its color profile");
  });

  it("leaves no temporary files behind", async () => {
    await processPhoto(await writeCameraJpeg("a.jpg"), directories);

    assert.deepEqual(await readdir(directories.derivatives), ["a-640w.webp"]);
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
    const outputPaths = [first.fullImagePath, first.thumbnail.path];
    const outputTimes = () => Promise.all(outputPaths.map(async (path) => (await stat(path)).mtimeMs));

    const newerTime = new Date(Date.now() + 60_000);
    await utimes(sourcePath, newerTime, newerTime);
    await processPhoto(sourcePath, directories);
    assert.deepEqual(await outputTimes(), [newerTime.getTime(), newerTime.getTime()]);

    // An older replacement file (e.g. restored with `cp -p`) must also trigger a rebuild.
    const olderTime = new Date("2019-01-01T00:00:00Z");
    await utimes(sourcePath, olderTime, olderTime);
    await processPhoto(sourcePath, directories);
    assert.deepEqual(await outputTimes(), [olderTime.getTime(), olderTime.getTime()]);
  });

  it("reuses outputs while the source is unchanged", async () => {
    const sourcePath = await writeCameraJpeg("a.jpg");
    const first = await processPhoto(sourcePath, directories);
    assert.ok(!("skipped" in first));
    const outputPaths = [first.fullImagePath, first.thumbnail.path];
    // Rebuilds replace the file, so its inode would change.
    const inodes = () => Promise.all(outputPaths.map(async (path) => (await stat(path)).ino));

    const before = await inodes();
    await processPhoto(sourcePath, directories);

    assert.deepEqual(await inodes(), before);
  });
});
