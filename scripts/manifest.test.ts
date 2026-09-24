import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { after, before, describe, it } from "node:test";
import { formatManifest, type ManifestAlbum } from "./manifest";

describe("formatManifest", () => {
  let directory: string;
  let fileCount = 0;

  before(async () => {
    directory = await mkdtemp(join(tmpdir(), "manifest-test-"));
  });

  after(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  async function importManifest(albums: ManifestAlbum[]) {
    const path = join(directory, `photos-${fileCount++}.ts`);
    await writeFile(path, formatManifest(albums), "utf8");
    const module = (await import(pathToFileURL(path).href)) as { albums: ManifestAlbum[] };
    return module.albums;
  }

  const photo = (name: string) => ({
    src: `/photos/full/${name}.avif`,
    width: 4000,
    height: 3000,
    thumbnail: { src: `/photos/derivatives/${name}-640w.webp`, width: 640, height: 480 },
  });

  it("round-trips loose and titled albums", async () => {
    const albums: ManifestAlbum[] = [
      { slug: "", title: null, photos: [photo("loose")] },
      { slug: "julian-alps", title: "Julian Alps", photos: [photo("julian-alps/a"), photo("julian-alps/b")] },
    ];

    assert.deepEqual(await importManifest(albums), albums);
  });

  it("round-trips titles containing quotes, backticks and template syntax", async () => {
    const albums: ManifestAlbum[] = [
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
