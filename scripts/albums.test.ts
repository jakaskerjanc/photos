import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { albumTitle, discoverAlbums, slugify } from "./albums";

describe("albumTitle", () => {
  it("strips a numeric ordering prefix", () => {
    assert.equal(albumTitle("01 Iceland 2025"), "Iceland 2025");
    assert.equal(albumTitle("2-Julian Alps"), "Julian Alps");
    assert.equal(albumTitle("003_Tokyo"), "Tokyo");
    assert.equal(albumTitle("01 - Iceland"), "Iceland");
  });

  it("keeps names that are only a number or have no separator", () => {
    assert.equal(albumTitle("2025"), "2025");
    assert.equal(albumTitle("2025Iceland"), "2025Iceland");
  });

  it("keeps a leading year or date instead of treating it as an ordering prefix", () => {
    assert.equal(albumTitle("2024 Norway"), "2024 Norway");
    assert.equal(albumTitle("2025-06-14 Iceland"), "2025-06-14 Iceland");
    assert.notEqual(slugify(albumTitle("2024 Norway")), slugify(albumTitle("2025 Norway")));
  });

  it("falls back to the folder name when stripping leaves nothing", () => {
    assert.equal(albumTitle("01 "), "01 ");
  });
});

describe("slugify", () => {
  it("lower-cases and joins words with dashes", () => {
    assert.equal(slugify("Julian Alps"), "julian-alps");
    assert.equal(slugify("  Iceland 2025!  "), "iceland-2025");
  });

  it("transliterates accented letters instead of dropping them", () => {
    assert.equal(slugify("Škocjan Caves"), "skocjan-caves");
    assert.equal(slugify("Julijske Alpe – Triglav"), "julijske-alpe-triglav");
    assert.equal(slugify("Čebelarstvo in žabe"), "cebelarstvo-in-zabe");
  });

  it("returns an empty string when nothing URL-safe remains", () => {
    assert.equal(slugify("東京"), "");
  });
});

describe("discoverAlbums", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "albums-test-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function touch(...segments: string[]) {
    await mkdir(join(root, ...segments.slice(0, -1)), { recursive: true });
    await writeFile(join(root, ...segments), "");
  }

  it("returns no albums for an empty directory", async () => {
    assert.deepEqual(await discoverAlbums(root), { albums: [], warnings: [] });
  });

  it("puts loose photos first as an untitled album, then folders in name order", async () => {
    await touch("10 Later", "b.jpg");
    await touch("2 Earlier", "a.avif");
    await touch("loose-2.jpg");
    await touch("loose-10.jpg");
    await touch("notes.txt");

    const { albums, warnings } = await discoverAlbums(root);

    assert.deepEqual(warnings, []);
    assert.deepEqual(albums, [
      { slug: "", title: null, directory: root, fileNames: ["loose-2.jpg", "loose-10.jpg"] },
      { slug: "earlier", title: "Earlier", directory: join(root, "2 Earlier"), fileNames: ["a.avif"] },
      { slug: "later", title: "Later", directory: join(root, "10 Later"), fileNames: ["b.jpg"] },
    ]);
  });

  it("matches extensions case-insensitively and sorts files numerically", async () => {
    await touch("Trip", "IMG_10.JPG");
    await touch("Trip", "IMG_9.jpeg");
    await touch("Trip", "IMG_1.PNG");

    const { albums } = await discoverAlbums(root);

    assert.deepEqual(albums[0].fileNames, ["IMG_1.PNG", "IMG_9.jpeg", "IMG_10.JPG"]);
  });

  it("omits the loose album when there are no loose photos", async () => {
    await touch("Trip", "a.jpg");

    const { albums } = await discoverAlbums(root);

    assert.deepEqual(albums.map((album) => album.slug), ["trip"]);
  });

  it("skips empty folders with a warning and ignores hidden folders silently", async () => {
    await touch("Empty", "readme.txt");
    await touch(".cache", "a.jpg");
    await touch("Trip", "a.jpg");

    const { albums, warnings } = await discoverAlbums(root);

    assert.deepEqual(albums.map((album) => album.slug), ["trip"]);
    assert.deepEqual(warnings, ["Skipping album folder \"Empty\": it contains no supported images."]);
  });

  it("ignores nested folders with a warning but keeps the album's own photos", async () => {
    await touch("Trip", "a.jpg");
    await touch("Trip", "Day 2", "b.jpg");

    const { albums, warnings } = await discoverAlbums(root);

    assert.deepEqual(albums.map((album) => album.fileNames), [["a.jpg"]]);
    assert.deepEqual(warnings, ["Ignoring nested folder \"Trip/Day 2\": albums cannot contain subfolders."]);
  });

  it("fails when two folders produce the same slug", async () => {
    await touch("01 Škocjan", "a.jpg");
    await touch("02 Skocjan", "b.jpg");

    await assert.rejects(discoverAlbums(root), {
      message: 'Album folders "01 Škocjan" and "02 Skocjan" both use the URL name "skocjan". Rename one of them.',
    });
  });

  it("fails when a folder name has nothing usable for a URL", async () => {
    await touch("東京", "a.jpg");

    await assert.rejects(discoverAlbums(root), {
      message: 'Album folder "東京" has no letters or digits that can be used in a URL. Rename it.',
    });
  });
});
