# Folder-based Albums Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn each subfolder of `photos/` into a titled album. The gallery then renders one section per album instead of a single flat grid.

**Architecture:** The build script (`scripts/generate-photo-manifest.ts`) gets three small, pure-ish helper modules: album discovery, recursive stale-file cleanup and manifest formatting. Each helper has `node:test` unit tests. The generated `src/generated/photos.ts` exports `albums: GalleryAlbum[]`. `App.tsx` renders one `<section>` + `RowsPhotoAlbum` per album and shares one `Lightbox` whose slides are scoped to the clicked album.

**Tech Stack:** TypeScript, React 19, Vite 8, `react-photo-album` 3, `yet-another-react-lightbox` 3, `sharp`, `exiftool-vendored`, `tsx`. Tests use Node's built-in `node:test` runner through `tsx --test`. No new dependencies.

**Spec:** [`docs/specs/albums.md`](../specs/albums.md). Read it before starting.

## Global Constraints

- Package manager is `pnpm` (`pnpm@10.34.5`). CI runs Node 24. **Do not add dependencies.**
- An album is one subfolder of `photos/`. Only one level is supported. Nested folders are ignored with a console warning. Hidden folders (`.something`) are ignored silently.
- Album order and photo order both use `a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })` on the raw folder name or file name.
- The displayed title strips a leading ordering prefix: digits followed by one or more spaces, `-` or `_`. `01 Iceland 2025` → `Iceland 2025`.
- Slug: from the displayed title, apply `normalize("NFKD")`, strip combining marks, lower-case, collapse runs of non-`[a-z0-9]` to `-`, then trim `-`.
- If two folders produce the same slug, the build fails with a clear error.
- Loose photos directly in `photos/` form an album with `slug: ""` and `title: null`. It is rendered first, without a heading, and emitted only if it has photos.
- Generated files live under `public/photos/full/<slug>/<file>` and `public/photos/derivatives/<slug>/<base>-<w>w.webp`. The loose album uses the top-level directories.
- Keep the existing gallery props unchanged: `targetRowHeight={280}`, `rowConstraints={{ minPhotos: 1, maxPhotos: 5 }}`, `spacing={4}`.
- `src/generated/photos.ts` is **tracked in git**. Commit it whenever the build regenerates it for the real `photos/` layout, and never commit it while test fixture folders exist.
- Commit messages follow the repo style: plain imperative sentence, no `feat:` prefix.

## Review Focus

These cases aren't spelled out in the spec's checklist, but they're the most likely to break for a real user. Each one has a pinned test in the task named.

1. **A folder name with no Latin letters or digits** (`東京`, `🌋`) slugifies to `""`, the same slug as the loose album. The build must fail with a message asking to rename the folder. It must not silently merge the album with loose photos (Task 1).
2. **Slovenian and other accented titles** (`Škocjan Caves`, `Julijske Alpe – Triglav`) should produce readable slugs (`skocjan-caves`, `julijske-alpe-triglav`) rather than dropping letters (Task 1).
3. **Titles containing quotes, apostrophes, backticks or `${`** (`Mum's "best" \`trip\` ${x}`) must still produce a valid, importable manifest with the exact title (Task 3).
4. **Moving today's flat photos into an album folder** must delete the old top-level generated files and keep the new namespaced ones. Renaming an album must remove its old directory (Task 2).
5. **An empty `photos/` directory, or one where every album is empty,** must produce `albums = []`. The page must render without crashing (Tasks 1, 3 and 5).

---

## File Structure

| File | Status | Responsibility |
| --- | --- | --- |
| `scripts/albums.ts` | Create | `albumTitle`, `slugify` and `discoverAlbums`. Turns the `photos/` tree into an ordered list of album sources and validates slugs. No image I/O. |
| `scripts/albums.test.ts` | Create | Unit tests for the above against temp directories. |
| `scripts/stale-files.ts` | Create | `removeStaleFiles`. Recursive delete of unexpected files and empty directories under a generated-output root. |
| `scripts/stale-files.test.ts` | Create | Unit tests against temp directories. |
| `scripts/manifest.ts` | Create | Manifest types plus `formatManifest`, which serializes albums to the TypeScript source of `src/generated/photos.ts`. |
| `scripts/manifest.test.ts` | Create | Round-trip tests. Write the output to a temp `.ts` file, import it and compare. |
| `scripts/generate-photo-manifest.ts` | Modify | Orchestration only: discover → process images per album → clean up → write manifest. |
| `src/generated/photos.ts` | Regenerated | Exports `albums` instead of `photos`. |
| `src/App.tsx` | Modify | Album index nav, one section per album, per-album lightbox. |
| `src/styles.css` | Modify | Album headings, index nav, smooth scrolling. |
| `package.json` | Modify | Adds a `test` script. |
| `tsconfig.node.json` | Modify | Type-checks all of `scripts/`, including the new modules and tests. |
| `README.md` | Modify | Documents albums. |

---

### Task 1: Test runner and album discovery

**Files:**
- Modify: `package.json` (the `scripts` block)
- Modify: `tsconfig.node.json` (the `include` array)
- Create: `scripts/albums.ts`
- Test: `scripts/albums.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (from `scripts/albums.ts`):
  ```ts
  export const supportedExtensions: Set<string>; // ".jpg", ".jpeg", ".png", ".webp", ".avif"
  export function compareNames(a: string, b: string): number;
  export function albumTitle(folderName: string): string;
  export function slugify(title: string): string;
  export type AlbumSource = {
    slug: string;          // "" for loose photos
    title: string | null;  // null for loose photos
    directory: string;     // absolute path of the source folder
    fileNames: string[];   // supported image file names, sorted with compareNames
  };
  export function discoverAlbums(rootDirectory: string): Promise<{ albums: AlbumSource[]; warnings: string[] }>;
  ```

- [ ] **Step 1: Install dependencies and add the test script**

Run: `pnpm install`

In `package.json`, add a `test` script so the `scripts` block reads:

```json
  "scripts": {
    "dev": "tsx scripts/generate-photo-manifest.ts && vite",
    "build": "tsx scripts/generate-photo-manifest.ts && tsc -b && vite build",
    "preview": "vite preview",
    "generate:photos": "tsx scripts/generate-photo-manifest.ts",
    "test": "tsx --test scripts/*.test.ts"
  },
```

In `tsconfig.node.json`, change `include` so `tsc -b` type-checks every script and test:

```json
  "include": ["vite.config.ts", "scripts/**/*.ts"]
```

- [ ] **Step 2: Write the failing tests**

Create `scripts/albums.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm test`
Expected: FAIL. The module `./albums` cannot be found (`ERR_MODULE_NOT_FOUND`).

- [ ] **Step 4: Implement `scripts/albums.ts`**

```ts
import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import { extname, join } from "node:path";

export const supportedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);

export type AlbumSource = {
  slug: string;
  title: string | null;
  directory: string;
  fileNames: string[];
};

export function compareNames(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

export function albumTitle(folderName: string) {
  return folderName.replace(/^\d{1,3}[ _-]+/, "") || folderName;
}

export function slugify(title: string) {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function imageFileNames(entries: Dirent[]) {
  return entries
    .filter((entry) => entry.isFile() && supportedExtensions.has(extname(entry.name).toLowerCase()))
    .map((entry) => entry.name)
    .sort(compareNames);
}

function visibleFolderNames(entries: Dirent[]) {
  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort(compareNames);
}

export async function discoverAlbums(rootDirectory: string) {
  const warnings: string[] = [];
  const albums: AlbumSource[] = [];
  const entries = await readdir(rootDirectory, { withFileTypes: true });

  const looseFileNames = imageFileNames(entries);
  if (looseFileNames.length > 0) {
    albums.push({ slug: "", title: null, directory: rootDirectory, fileNames: looseFileNames });
  }

  const folderNamesBySlug = new Map<string, string>();

  for (const folderName of visibleFolderNames(entries)) {
    const directory = join(rootDirectory, folderName);
    const folderEntries = await readdir(directory, { withFileTypes: true });

    for (const nestedFolderName of visibleFolderNames(folderEntries)) {
      warnings.push(`Ignoring nested folder "${folderName}/${nestedFolderName}": albums cannot contain subfolders.`);
    }

    const fileNames = imageFileNames(folderEntries);
    if (fileNames.length === 0) {
      warnings.push(`Skipping album folder "${folderName}": it contains no supported images.`);
      continue;
    }

    const title = albumTitle(folderName);
    const slug = slugify(title);
    if (!slug) {
      throw new Error(`Album folder "${folderName}" has no letters or digits that can be used in a URL. Rename it.`);
    }

    const existingFolderName = folderNamesBySlug.get(slug);
    if (existingFolderName) {
      throw new Error(
        `Album folders "${existingFolderName}" and "${folderName}" both use the URL name "${slug}". Rename one of them.`,
      );
    }
    folderNamesBySlug.set(slug, folderName);

    albums.push({ slug, title, directory, fileNames });
  }

  return { albums, warnings };
}
```

Note: `albumTitle("01 ")` returns `"01 "` because `"01 ".replace(…)` is `""`, and `|| folderName` falls back. The test in Step 2 pins this behaviour.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test`
Expected: PASS, all `albumTitle`, `slugify` and `discoverAlbums` tests.

Run: `pnpm exec tsc -b`
Expected: exits 0 with no output.

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.node.json scripts/albums.ts scripts/albums.test.ts
git commit -m "Add album discovery for photo subfolders"
```

---

### Task 2: Recursive stale-file cleanup

**Files:**
- Create: `scripts/stale-files.ts`
- Test: `scripts/stale-files.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (from `scripts/stale-files.ts`):
  ```ts
  // expectedPaths are POSIX-style paths relative to rootDirectory, e.g. "julian-alps/DSC01912-Pano.avif".
  // Deletes every file under rootDirectory not in expectedPaths, then deletes subdirectories left empty.
  // Never deletes rootDirectory itself.
  export function removeStaleFiles(rootDirectory: string, expectedPaths: Set<string>): Promise<void>;
  ```

- [ ] **Step 1: Write the failing tests**

Create `scripts/stale-files.test.ts`:

```ts
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { removeStaleFiles } from "./stale-files";

describe("removeStaleFiles", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "stale-files-test-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function touch(relativePath: string) {
    const path = join(root, ...relativePath.split("/"));
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, "");
  }

  async function listTree() {
    const entries = await readdir(root, { recursive: true, withFileTypes: true });
    return entries
      .map((entry) => {
        const path = relative(root, join(entry.parentPath, entry.name)).split(sep).join("/");
        return entry.isDirectory() ? `${path}/` : path;
      })
      .sort();
  }

  it("keeps expected files at the top level and in album folders", async () => {
    await touch("loose.avif");
    await touch("julian-alps/a.avif");

    await removeStaleFiles(root, new Set(["loose.avif", "julian-alps/a.avif"]));

    assert.deepEqual(await listTree(), ["julian-alps/", "julian-alps/a.avif", "loose.avif"]);
  });

  it("removes top-level files after photos move into an album", async () => {
    await touch("DSC01120.avif");
    await touch("iceland/DSC01120.avif");

    await removeStaleFiles(root, new Set(["iceland/DSC01120.avif"]));

    assert.deepEqual(await listTree(), ["iceland/", "iceland/DSC01120.avif"]);
  });

  it("removes a renamed album's old folder entirely", async () => {
    await touch("test-alps/a.avif");
    await touch("test-alps/b.avif");
    await touch("test-dolomites/a.avif");

    await removeStaleFiles(root, new Set(["test-dolomites/a.avif"]));

    assert.deepEqual(await listTree(), ["test-dolomites/", "test-dolomites/a.avif"]);
  });

  it("does not treat a same-named file in another album as expected", async () => {
    await touch("iceland/DSC01120.avif");
    await touch("alps/DSC01120.avif");

    await removeStaleFiles(root, new Set(["alps/DSC01120.avif"]));

    assert.deepEqual(await listTree(), ["alps/", "alps/DSC01120.avif"]);
  });

  it("empties but keeps the root when nothing is expected", async () => {
    await touch("a.avif");
    await touch("album/b.avif");

    await removeStaleFiles(root, new Set());

    assert.deepEqual(await listTree(), []);
    assert.deepEqual(await readdir(root), []);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test`
Expected: FAIL. The module `./stale-files` cannot be found. The Task 1 tests still pass.

- [ ] **Step 3: Implement `scripts/stale-files.ts`**

```ts
import { readdir, rmdir, unlink } from "node:fs/promises";
import { join } from "node:path";

export async function removeStaleFiles(rootDirectory: string, expectedPaths: Set<string>) {
  await pruneDirectory(rootDirectory, "", expectedPaths);
}

// Returns true when the directory is empty after pruning.
async function pruneDirectory(directory: string, relativeDirectory: string, expectedPaths: Set<string>) {
  const entries = await readdir(directory, { withFileTypes: true });
  let remainingEntries = entries.length;

  for (const entry of entries) {
    const path = join(directory, entry.name);
    const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      if (await pruneDirectory(path, relativePath, expectedPaths)) {
        await rmdir(path);
        remainingEntries--;
      }
    } else if (entry.isFile() && !expectedPaths.has(relativePath)) {
      await unlink(path);
      remainingEntries--;
    }
  }

  return remainingEntries === 0;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test && pnpm exec tsc -b`
Expected: all tests PASS. `tsc` exits 0.

- [ ] **Step 5: Commit**

```bash
git add scripts/stale-files.ts scripts/stale-files.test.ts
git commit -m "Add recursive cleanup of stale generated photos"
```

---

### Task 3: Album manifest formatter

**Files:**
- Create: `scripts/manifest.ts`
- Test: `scripts/manifest.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (from `scripts/manifest.ts`):
  ```ts
  export type ImageSource = { src: string; width: number; height: number };
  export type PhotoManifestEntry = ImageSource & { thumbnail: ImageSource };
  export type ManifestAlbum = { slug: string; title: string | null; photos: PhotoManifestEntry[] };
  // Returns the full TypeScript source of src/generated/photos.ts.
  // `src` values are emitted inside template literals verbatim, so they may contain `${import.meta.env.BASE_URL}`.
  export function formatManifest(albums: ManifestAlbum[]): string;
  ```
  The generated file exports `type GalleryPhoto`, `type GalleryAlbum = { slug: string; title: string | null; photos: GalleryPhoto[] }` and `const albums: GalleryAlbum[]`.

- [ ] **Step 1: Write the failing tests**

Create `scripts/manifest.test.ts`. The tests write the generated source to a temp `.ts` file and import it. This proves the output is valid TypeScript and round-trips exactly, without depending on formatting details.

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test`
Expected: FAIL. The module `./manifest` cannot be found. Tasks 1–2 tests still pass.

- [ ] **Step 3: Implement `scripts/manifest.ts`**

Every photo line and album block ends with a trailing comma, and the lines are joined with `\n` only. Empty arrays therefore still produce valid syntax. Joining with `",\n"` would emit a stray `,` for an empty list.

```ts
export type ImageSource = { src: string; width: number; height: number };
export type PhotoManifestEntry = ImageSource & { thumbnail: ImageSource };
export type ManifestAlbum = { slug: string; title: string | null; photos: PhotoManifestEntry[] };

const manifestTypes = `export type GalleryPhoto = {
  src: string;
  width: number;
  height: number;
  thumbnail: { src: string; width: number; height: number };
};

export type GalleryAlbum = {
  slug: string;
  title: string | null;
  photos: GalleryPhoto[];
};
`;

function formatPhoto({ src, width, height, thumbnail }: PhotoManifestEntry) {
  return `      { src: \`${src}\`, width: ${width}, height: ${height}, thumbnail: { src: \`${thumbnail.src}\`, width: ${thumbnail.width}, height: ${thumbnail.height} } },`;
}

function formatAlbum({ slug, title, photos }: ManifestAlbum) {
  return `  {
    slug: ${JSON.stringify(slug)},
    title: ${JSON.stringify(title)},
    photos: [
${photos.map(formatPhoto).join("\n")}
    ],
  },`;
}

export function formatManifest(albums: ManifestAlbum[]) {
  return `${manifestTypes}
export const albums: GalleryAlbum[] = [
${albums.map(formatAlbum).join("\n")}
];
`;
}
```

Titles go through `JSON.stringify`, so they become double-quoted string literals where backticks and `${` are inert. `src` values are already `encodeURIComponent`-encoded per path segment by the generator, so they cannot contain a backtick or `$`. The one exception is the intentional `${import.meta.env.BASE_URL}` prefix.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test && pnpm exec tsc -b`
Expected: all tests PASS. `tsc` exits 0.

- [ ] **Step 5: Commit**

```bash
git add scripts/manifest.ts scripts/manifest.test.ts
git commit -m "Add album manifest formatter"
```

---

### Task 4: Wire albums into the photo build script

**Files:**
- Modify: `scripts/generate-photo-manifest.ts` (full rewrite below)
- Modify: `src/App.tsx:5` (temporary one-line adapter so the app keeps building until Task 5)
- Regenerated: `src/generated/photos.ts`

**Interfaces:**
- Consumes: `discoverAlbums` and `AlbumSource` (Task 1), `removeStaleFiles` (Task 2), and `formatManifest`, `ManifestAlbum` and `PhotoManifestEntry` (Task 3).
- Produces: `src/generated/photos.ts` exporting `albums: GalleryAlbum[]` (the `photos` export is removed), plus files in `public/photos/{full,derivatives}/<slug>/`.

- [ ] **Step 1: Replace `scripts/generate-photo-manifest.ts`**

Image processing (thumbnail sizing, `sharp` settings, EXIF stripping and mtime caching) is unchanged. Only discovery, output paths, cleanup and manifest writing change.

```ts
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";
import { exiftool } from "exiftool-vendored";
import { imageSize } from "image-size";
import sharp from "sharp";
import { discoverAlbums } from "./albums";
import { formatManifest, type ManifestAlbum, type PhotoManifestEntry } from "./manifest";
import { removeStaleFiles } from "./stale-files";

const projectRoot = process.cwd();
const sourcePhotosDirectory = join(projectRoot, "photos");
const publicDirectory = join(projectRoot, "public");
const derivativesDirectory = join(publicDirectory, "photos", "derivatives");
const fullImagesDirectory = join(publicDirectory, "photos", "full");
const generatedDirectory = join(projectRoot, "src", "generated");
const manifestPath = join(generatedDirectory, "photos.ts");
const thumbnailWidth = 640;
const panoramaAspectRatio = 2;
const panoramaThumbnailHeight = 960;
const maxPanoramaThumbnailWidth = 6144;

await mkdir(sourcePhotosDirectory, { recursive: true });
await mkdir(derivativesDirectory, { recursive: true });
await mkdir(fullImagesDirectory, { recursive: true });
await mkdir(generatedDirectory, { recursive: true });

const { albums: albumSources, warnings } = await discoverAlbums(sourcePhotosDirectory);
for (const warning of warnings) {
  console.warn(warning);
}

function urlFor(filePath: string) {
  const encodedPath = relative(publicDirectory, filePath)
    .split(sep)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `\${import.meta.env.BASE_URL}${encodedPath}`;
}

async function writeFullImageWithoutMetadata(sourcePath: string, destinationPath: string) {
  await copyFile(sourcePath, destinationPath);
  // Strips EXIF/GPS/IPTC/XMP in place by editing the container's metadata boxes directly,
  // so the pixel data is untouched (no quality loss, no encoder dimension limits).
  await exiftool.write(destinationPath, {}, { writeArgs: ["-all=", "-overwrite_original"] });
}

async function derivativeIsCurrent(sourcePath: string, derivativePath: string) {
  try {
    const [source, derivative] = await Promise.all([stat(sourcePath), stat(derivativePath)]);
    return derivative.mtimeMs >= source.mtimeMs;
  } catch {
    return false;
  }
}

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

const manifestAlbums: ManifestAlbum[] = [];
const expectedDerivativeFiles = new Set<string>();
const expectedFullImageFiles = new Set<string>();

for (const album of albumSources) {
  // The loose album has slug "", so its files stay in the top-level output directories.
  const albumDerivativesDirectory = join(derivativesDirectory, album.slug);
  const albumFullImagesDirectory = join(fullImagesDirectory, album.slug);
  const expectedPathPrefix = album.slug ? `${album.slug}/` : "";
  await mkdir(albumDerivativesDirectory, { recursive: true });
  await mkdir(albumFullImagesDirectory, { recursive: true });

  const photoEntries: PhotoManifestEntry[] = [];

  for (const fileName of album.fileNames) {
    const filePath = join(album.directory, fileName);
    const { width, height } = imageSize(await readFile(filePath));

    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      console.warn(`Skipping ${relative(sourcePhotosDirectory, filePath)}: image dimensions could not be read.`);
      continue;
    }

    const aspectRatio = width / height;
    const thumbnailPixelWidth = Math.min(
      width,
      aspectRatio >= panoramaAspectRatio
        ? Math.min(maxPanoramaThumbnailWidth, Math.round(aspectRatio * panoramaThumbnailHeight))
        : thumbnailWidth,
    );
    const baseName = fileName.slice(0, -extname(fileName).length);
    const derivativeName = `${baseName}-${thumbnailPixelWidth}w.webp`;
    const derivativePath = join(albumDerivativesDirectory, derivativeName);
    const fullImagePath = join(albumFullImagesDirectory, fileName);
    expectedDerivativeFiles.add(`${expectedPathPrefix}${derivativeName}`);
    expectedFullImageFiles.add(`${expectedPathPrefix}${fileName}`);

    if (!(await derivativeIsCurrent(filePath, derivativePath))) {
      await sharp(filePath)
        .resize({ width: thumbnailPixelWidth, withoutEnlargement: true })
        .webp({ quality: 76 })
        .toFile(derivativePath);
    }

    if (!(await derivativeIsCurrent(filePath, fullImagePath))) {
      await writeFullImageWithoutMetadata(filePath, fullImagePath);
    }

    photoEntries.push({
      src: urlFor(fullImagePath),
      width,
      height,
      thumbnail: {
        src: urlFor(derivativePath),
        width: thumbnailPixelWidth,
        height: Math.round((height * thumbnailPixelWidth) / width),
      },
    });
  }

  if (photoEntries.length > 0) {
    manifestAlbums.push({ slug: album.slug, title: album.title, photos: photoEntries });
  }
}

await Promise.all([
  removeStaleFiles(derivativesDirectory, expectedDerivativeFiles),
  removeStaleFiles(fullImagesDirectory, expectedFullImageFiles),
]);

await writeFile(manifestPath, formatManifest(manifestAlbums), "utf8");
const photoCount = manifestAlbums.reduce((total, album) => total + album.photos.length, 0);
console.log(`Generated photo manifest with ${plural(photoCount, "photo")} in ${plural(manifestAlbums.length, "album")}.`);

await exiftool.end();
```

- [ ] **Step 2: Add a temporary flat adapter in `src/App.tsx`**

Replace line 5, `import { photos } from "./generated/photos";`, with:

```ts
import { albums } from "./generated/photos";

// Temporary until the album sections land in the next commit.
const photos = albums.flatMap((album) => album.photos);
```

- [ ] **Step 3: Regenerate and verify the flat layout is unchanged**

Run: `pnpm generate:photos`
Expected: `Generated photo manifest with 51 photos in 1 album.`

Run: `head -20 src/generated/photos.ts`
Expected: a `GalleryAlbum` type, then `export const albums: GalleryAlbum[] = [` whose first album has `slug: ""` and `title: null`. The photo `src` values are still `${import.meta.env.BASE_URL}photos/full/DSC01120.avif` (no album segment).

Run: `ls public/photos/full | head -3 && find public/photos -mindepth 2 -type d`
Expected: top-level `.avif` files are listed. The `find` prints nothing because there are no album subdirectories.

- [ ] **Step 4: Run the unit tests and full build**

Run: `pnpm test && pnpm build`
Expected: all tests PASS. The build finishes with `✓ built in …`. `tsc -b` reports no errors.

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-photo-manifest.ts src/App.tsx src/generated/photos.ts
git commit -m "Generate an album-grouped photo manifest"
```

---

### Task 5: Album sections in the gallery UI

**Files:**
- Modify: `src/App.tsx` (full rewrite below)
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `albums: GalleryAlbum[]` from `src/generated/photos.ts` (Task 4).
- Produces: the final UI. No code depends on it.

- [ ] **Step 1: Replace `src/App.tsx`**

The lightbox state keeps the last album index after closing (`index: -1`) rather than clearing it. Clearing `slides` to `[]` while the close animation runs would flash an empty lightbox. `albums[lightbox.album]?.photos ?? []` keeps an empty `photos/` directory from crashing.

The photo count sits beside the `<h2>`, not inside it, so the heading's accessible name is just the album title.

```tsx
import { useState } from "react";
import { RowsPhotoAlbum } from "react-photo-album";
import Lightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import { albums } from "./generated/photos";

const albumThumbnails = albums.map((album) =>
  album.photos.map(({ thumbnail, ...photo }) => ({
    ...photo,
    src: thumbnail.src,
  })),
);
const titledAlbums = albums.filter((album) => album.title !== null);

export function App() {
  const [lightbox, setLightbox] = useState({ album: 0, index: -1 });

  return (
    <main className="gallery-shell">
      {titledAlbums.length >= 2 && (
        <nav className="album-index" aria-label="Albums">
          {titledAlbums.map((album) => (
            <a key={album.slug} href={`#${album.slug}`}>
              {album.title}
            </a>
          ))}
        </nav>
      )}

      {albums.map((album, albumIndex) => (
        <section
          key={album.slug}
          className="album"
          aria-labelledby={album.title === null ? undefined : album.slug}
        >
          {album.title !== null && (
            <header className="album-header">
              <h2 id={album.slug} className="album-title">
                {album.title}
              </h2>
              <span className="album-count">
                {album.photos.length} {album.photos.length === 1 ? "photo" : "photos"}
              </span>
            </header>
          )}

          <RowsPhotoAlbum
            photos={albumThumbnails[albumIndex]}
            targetRowHeight={280}
            rowConstraints={{ minPhotos: 1, maxPhotos: 5 }}
            spacing={4}
            onClick={({ index }) => setLightbox({ album: albumIndex, index })}
            componentsProps={{
              container: { className: "gallery" },
            }}
          />
        </section>
      ))}

      <Lightbox
        open={lightbox.index >= 0}
        close={() => setLightbox((current) => ({ ...current, index: -1 }))}
        index={Math.max(lightbox.index, 0)}
        slides={albums[lightbox.album]?.photos ?? []}
        plugins={[Zoom]}
        zoom={{ maxZoomPixelRatio: 5, zoomInMultiplier: 1.25 }}
        carousel={{ finite: false, imageFit: "contain", preload: 0 }}
        toolbar={{ buttons: ["zoom", "close"] }}
        render={{ buttonPrev: () => null, buttonNext: () => null }}
        controller={{ closeOnBackdropClick: true }}
      />
    </main>
  );
}
```

Note: the original code passed `index={lightboxIndex}`, which was `-1` while closed. `Math.max(…, 0)` keeps the prop valid while closed and changes nothing while open.

The spec's mock shows a bare number. Showing "12 photos" is a deliberate wording refinement so the count reads correctly on its own, both visually and for screen readers.

- [ ] **Step 2: Add styles to `src/styles.css`**

Replace the existing rule

```css
button:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 3px;
}
```

with (so index links get the same focus ring):

```css
button:focus-visible,
a:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 3px;
}

html {
  scroll-behavior: smooth;
}
```

Then insert this block directly after the existing `.gallery-shell { … }` rule:

```css
.album-index {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 20px;
  padding: 16px 8px 8px;
}

.album-index a {
  color: #888;
  font-size: 0.8rem;
  letter-spacing: 0.08em;
  text-decoration: none;
  text-transform: uppercase;
}

.album-index a:hover {
  color: #fff;
}

.album-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  padding: 48px 8px 12px;
}

.album:first-of-type .album-header {
  padding-top: 16px;
}

.album-title {
  min-width: 0;
  margin: 0;
  color: #bbb;
  font-size: 0.8rem;
  font-weight: 500;
  letter-spacing: 0.12em;
  overflow-wrap: anywhere;
  text-transform: uppercase;
  scroll-margin-top: 16px;
}

.album-count {
  flex-shrink: 0;
  color: #666;
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
}
```

Finally, extend the existing reduced-motion block at the bottom of the file:

```css
@media (prefers-reduced-motion: reduce) {
  html {
    scroll-behavior: auto;
  }

  .gallery img {
    transition: none;
  }
}
```

`.album:first-of-type` works because the `<nav>` is not a `<section>`. The first album section therefore matches whether or not the index nav is present. If a loose (untitled) album comes first, the first titled header correctly keeps its 48px of separation.

- [ ] **Step 3: Type-check and verify the flat layout is visually unchanged**

Run: `pnpm build`
Expected: succeeds.

Run: `pnpm dev`, then open the printed URL.
Expected: exactly one grid, identical to `main`, with no headings and no index nav (only the loose album exists). Clicking a photo opens the lightbox. Swiping or arrow keys cycle through all 51 photos. Closing does not flash an empty lightbox.

- [ ] **Step 4: Verify with temporary fixture albums**

These fixture folders are **not committed**. Leave `pnpm dev` running in one terminal, and in another run:

```bash
mkdir -p "photos/01 Test Alps" "photos/02 Škocjan Caves"
cp photos/DSC01120.avif photos/DSC01270.avif photos/DSC01333.avif "photos/01 Test Alps/"
cp photos/DSC01912-Pano.avif "photos/02 Škocjan Caves/"
pnpm generate:photos
```

Expected log: `Generated photo manifest with 55 photos in 3 albums.` Reload the dev server page and check:

- The index nav shows `TEST ALPS · ŠKOCJAN CAVES`.
- The 51 loose photos render first with no heading.
- A `TEST ALPS` heading follows with `3 photos` on the right, then `ŠKOCJAN CAVES` with `1 photo`.
- Rows never mix photos from different albums, and the panorama sits on its own row.
- Clicking `ŠKOCJAN CAVES` in the nav scrolls smoothly to that heading. Loading `/#skocjan-caves` directly lands on it.
- Opening a photo in `TEST ALPS` and pressing → cycles through only those 3 photos and wraps around.
- At a 360px-wide viewport, the nav wraps and a long title wraps instead of overflowing.

- [ ] **Step 5: Remove the fixtures and restore the real manifest**

```bash
rm -rf "photos/01 Test Alps" "photos/02 Škocjan Caves"
pnpm generate:photos
git status --short
```

Expected: `Generated photo manifest with 51 photos in 1 album.` `git status` lists only `src/App.tsx` and `src/styles.css`. `src/generated/photos.ts` must **not** appear. If it does, a fixture folder is still present.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/styles.css
git commit -m "Render photos grouped into titled album sections"
```

---

### Task 6: README and end-to-end build checks

**Files:**
- Modify: `README.md` (the "Add photos" section)

**Interfaces:**
- Consumes: the full feature from Tasks 1–5.
- Produces: user documentation.

- [ ] **Step 1: Rewrite the "Add photos" section of `README.md`**

Replace everything from `## Add photos` up to (not including) `## Run locally` with:

````markdown
## Add photos

Put supported image files in [`photos`](./photos):

- `.jpg` / `.jpeg`
- `.png`
- `.webp`
- `.avif`

The build automatically scans that folder and writes the gallery manifest. It generates a 640px WebP thumbnail for normal images; panoramas (aspect ratio of at least 2:1) receive a larger thumbnail sized for a 960px display height, capped at 6144px wide. The grid loads that thumbnail; opening a photo loads its original file from `public/photos/full`. Generated files are reused unless their source photo has changed.

Photos are sorted by filename, so names such as `001.jpg`, `002.jpg`, and `003.jpg` can be used to control the order.

## Albums

Each subfolder of `photos` is an album, and the folder name is the album's title:

```
photos/
  01 Iceland 2025/
    DSC01120.avif
  02 Julian Alps/
    DSC01912-Pano.avif
```

- Albums are sorted by folder name. A leading number followed by a space, `-` or `_` controls the order and is hidden from the title, so `01 Iceland 2025` is shown as **Iceland 2025**.
- Each album is linked from the index at the top of the page and has its own URL anchor, e.g. `#iceland-2025`.
- Photos placed directly in `photos` (not in a subfolder) are shown first, without a title.
- File names only need to be unique within an album.
- Albums can't be nested; subfolders inside an album are ignored with a warning.
- Two folders whose titles produce the same URL name (e.g. `Škocjan` and `Skocjan`) stop the build with an error. Rename one of them.
````

- [ ] **Step 2: Verify that a duplicate slug fails the build**

```bash
mkdir -p "photos/01 Škocjan" "photos/02 Skocjan"
cp photos/DSC01120.avif "photos/01 Škocjan/"
cp photos/DSC01270.avif "photos/02 Skocjan/"
pnpm generate:photos; echo "exit code: $?"
```

Expected: the command prints `Album folders "01 Škocjan" and "02 Skocjan" both use the URL name "skocjan". Rename one of them.` and `exit code:` is non-zero.

- [ ] **Step 3: Verify that renaming an album removes its old generated files**

```bash
rm -rf "photos/02 Skocjan"
pnpm generate:photos
ls public/photos/full/skocjan
mv "photos/01 Škocjan" "photos/01 Triglav"
pnpm generate:photos
ls public/photos/full
```

Expected: the first `ls` shows `DSC01120.avif`. After the rename, `public/photos/full` contains a `triglav` directory and **no** `skocjan` directory. `public/photos/derivatives` behaves the same way (`ls public/photos/derivatives`).

- [ ] **Step 4: Clean up and run the final checks**

```bash
rm -rf "photos/01 Triglav"
pnpm test
pnpm build
git status --short
```

Expected: all tests PASS and the build succeeds with `Generated photo manifest with 51 photos in 1 album.` `git status` lists only `README.md`. `ls public/photos/full` shows no leftover album directories.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "Document photo albums"
```

---

## Out of scope

Moving today's 51 photos into real album folders is a content decision for the repo owner. Do it in a separate commit after this lands. The Task 2 tests and the Task 6 rename check cover the cleanup behaviour.
