import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { after, before, describe, it } from "node:test";
import type { GalleryAlbum } from "../src/gallery";
import { formatManifest } from "./manifest";

describe("formatManifest", () => {
  let directory: string;
  let fileCount = 0;

  before(async () => {
    directory = await mkdtemp(join(tmpdir(), "manifest-test-"));
  });

  after(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  async function importManifest(albums: GalleryAlbum[]) {
    const path = join(directory, `photos-${fileCount++}.ts`);
    await writeFile(path, formatManifest(albums), "utf8");
    const module = (await import(pathToFileURL(path).href)) as { albums: GalleryAlbum[] };
    return module.albums;
  }

  const photo = (name: string) => ({
    src: `/photos/full/${name}.avif`,
    width: 4000,
    height: 3000,
    placeholder: "data:image/webp;base64,UklGRg==",
    thumbnails: [
      { src: `/photos/derivatives/${name}-640w.webp`, width: 640, height: 480 },
      { src: `/photos/derivatives/${name}-960w.webp`, width: 960, height: 720 },
    ],
  });

  it("round-trips loose and titled albums", async () => {
    const albums: GalleryAlbum[] = [
      { slug: "", title: null, photos: [photo("loose")] },
      { slug: "julian-alps", title: "Julian Alps", photos: [photo("julian-alps/a"), photo("julian-alps/b")] },
    ];

    assert.deepEqual(await importManifest(albums), albums);
  });

  it("round-trips album dates, descriptions, covers and photo details", async () => {
    const albums: GalleryAlbum[] = [
      {
        slug: "iceland",
        title: "Iceland",
        dates: "5–17 Aug 2026",
        description: 'Two "weeks".\n\nSecond paragraph with ${x} and `ticks`.',
        cover: 1,
        photos: [photo("a"), { ...photo("b"), details: "6 Aug 2026 · Sony α6700 · f/8" }],
      },
    ];

    assert.deepEqual(await importManifest(albums), albums);
  });

  it("round-trips titles containing quotes, backticks and template syntax", async () => {
    const albums: GalleryAlbum[] = [
      { slug: "mum-s-best-trip-x", title: 'Mum\'s "best" `trip` ${x} \\ ok', photos: [photo("a")] },
    ];

    assert.deepEqual(await importManifest(albums), albums);
  });

  it("produces an empty albums array when there are no photos", async () => {
    assert.deepEqual(await importManifest([]), []);
  });

  it("keeps the BASE_URL placeholder unevaluated in src", () => {
    const source = formatManifest([
      { slug: "", title: null, photos: [{ ...photo("a"), src: "${import.meta.env.BASE_URL}photos/full/a.avif" }] },
    ]);

    assert.match(source, /src: `\$\{import\.meta\.env\.BASE_URL\}photos\/full\/a\.avif`/);
    assert.match(source, /export const albums: GalleryAlbum\[\] = \[/);
  });
});
