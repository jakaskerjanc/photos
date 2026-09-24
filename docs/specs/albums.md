# Spec: Folders / albums

Issue: [#2 Add support for folders / albums](https://github.com/jakaskerjanc/photos/issues/2)

## Goal

Group the gallery into named albums instead of one flat grid. Albums are defined purely by the
filesystem: each subfolder of `photos/` is an album, and the folder name is the album title. No
config files, no CMS — adding an album is `mkdir` + drop photos + push.

The page stays a single scrolling list. Each album gets a title, and its photos start in a new
set of rows below that title.

## Source layout

```
photos/
  01 Iceland 2025/
    DSC01120.avif
    DSC01270.avif
  02 Julian Alps/
    DSC01912-Pano.avif
    ...
  DSC09999.avif        ← loose photo (see "Loose photos")
```

### Rules

| Case | Behaviour |
| --- | --- |
| Subfolder of `photos/` | One album. Photos inside are sorted by filename, same as today. |
| Album order | Sorted by folder name with the same numeric-aware compare used for files (`localeCompare(…, { numeric: true, sensitivity: "base" })`). |
| Ordering prefix | A leading `NN ` / `NN-` / `NN_` (digits, then a space, `-` or `_`) is stripped from the displayed title. `01 Iceland 2025` is shown as **Iceland 2025**. Matches the existing "name files `001.jpg` to control order" convention in the README. |
| Empty folder (no supported images) | Skipped with a console warning. |
| Nested folders (`photos/A/B/…`) | Not supported. Ignored with a console warning. Only one level of albums. |
| Hidden folders (`.something`) | Ignored silently. |
| Loose photos directly in `photos/` | Grouped into an untitled album that is rendered **first, without a heading**. This keeps the current flat gallery working unchanged until photos are moved into folders. |

Once albums exist, the current 51 photos should be moved into one or more album folders.
That's a content change, not part of this spec.

## Build script (`scripts/generate-photo-manifest.ts`)

### Discovery

1. `readdir(photos/, { withFileTypes: true })`.
2. Collect supported image files at the root → loose album (`slug: ""`, `title: null`).
3. For every directory entry (excluding hidden ones), read its files → one album each. Warn on
   nested directories.
4. Sort albums by folder name, photos within each album by filename.

### Slugs and output paths

Each album gets a URL-safe slug derived from its **display title** (prefix stripped):
lower-case, diacritics removed (`normalize("NFKD")` + strip combining marks), non-alphanumerics
collapsed to `-`, trimmed. `02 Julian Alps` becomes `julian-alps`.

- Two folders that produce the same slug → **fail the build** with a clear error. Don't guess.
- Generated files are namespaced by album so identical filenames in different albums (camera
  counters wrap, e.g. two `DSC01120.avif`) can't collide:
  - `public/photos/full/<slug>/<file>`
  - `public/photos/derivatives/<slug>/<base>-<w>w.webp`
  - The loose album uses the existing top-level directories (slug `""`).
- The slug also becomes the HTML `id` of the album heading, for `#julian-alps` deep links.

### Stale-file cleanup

`removeStaleFiles` currently only looks at one flat directory. It needs to walk the
`full/` and `derivatives/` trees:

- Build the expected set as relative paths (`julian-alps/DSC01912-Pano.avif`).
- Delete any file not in the set, then remove album directories that ended up empty
  (renamed or deleted albums).

### Manifest shape (`src/generated/photos.ts`)

```ts
export type GalleryPhoto = {
  src: string;
  width: number;
  height: number;
  thumbnail: { src: string; width: number; height: number };
};

export type GalleryAlbum = {
  slug: string;          // "" for loose photos
  title: string | null;  // null for loose photos → no heading
  photos: GalleryPhoto[];
};

export const albums: GalleryAlbum[] = [ … ];
```

The loose album is only emitted when it has photos. The flat `photos` export is removed. `App.tsx`
is its only consumer.

Log line becomes e.g. `Generated photo manifest with 51 photos in 3 albums.`

## UI (`src/App.tsx`, `src/styles.css`)

### Layout

```
┌────────────────────────────────────────────┐
│ Iceland 2025 · Julian Alps · Tokyo         │  ← album index (only if ≥ 2 titled albums)
├────────────────────────────────────────────┤
│ [loose photos, no heading, if any]         │
│                                            │
│ ICELAND 2025                         12    │  ← album heading + photo count
│ ▇▇▇▇ ▇▇▇▇▇▇ ▇▇▇                            │
│ ▇▇▇▇▇▇ ▇▇▇▇ ▇▇▇▇▇                          │
│                                            │
│ JULIAN ALPS                          24    │
│ ▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇ (pano)              │
│ ▇▇▇ ▇▇▇▇ ▇▇▇▇▇                             │
└────────────────────────────────────────────┘
```

- Each album is a `<section aria-labelledby={slug}>` with an `<h2 id={slug}>` and its own
  `<RowsPhotoAlbum>`. Separate `RowsPhotoAlbum` instances mean rows never mix photos from two
  albums. Each album starts on a fresh row and the last row of each album is justified on its own.
  The existing props (`targetRowHeight={280}`, `rowConstraints`, `spacing={4}`) stay the same.
- **Heading style**: the gallery is edge-to-edge and dark, so keep headings quiet. Small
  (~0.8rem), uppercase, letter-spaced, `#bbb` title with a dimmer photo count right-aligned on the
  same line. Padding of about `48px 8px 12px` gives separation from the album above. The first
  album gets less top padding. No borders or cards.
- **Album index**: a single line of links at the top (`<nav>`), one per titled album, pointing to
  `#slug`. Rendered only when there are at least 2 titled albums. Links use the same muted
  style and scroll smoothly (`scroll-behavior: smooth`, disabled under
  `prefers-reduced-motion`). It wraps on narrow screens. It is not sticky, to keep the page chrome
  minimal.
- **Deep links**: loading `/#julian-alps` scrolls to that album through native anchor behaviour.
  Nothing else to add.

### Lightbox

Keep a single `<Lightbox>`, but scope its slides to the album that was clicked:

```ts
const [open, setOpen] = useState<{ album: number; index: number } | null>(null);
// onClick of album a → setOpen({ album: a, index })
// slides = open ? albums[open.album].photos : []
```

Swiping or arrow keys in the lightbox cycle only within the current album
(`carousel.finite: false` still wraps). Crossing album boundaries in the lightbox feels wrong
once albums have titles.

### Thumbnails

The `photos.map(({ thumbnail, ...photo }) => …)` mapping moves into a per-album `useMemo` (or a
module-level constant, since the manifest is static). The behaviour stays the same.

## README

Update "Add photos":

- Explain `photos/<Album name>/…`, the optional `NN ` ordering prefix, and loose photos.
- Note that filenames only need to be unique **within** an album.

## Out of scope (possible follow-ups)

- Per-album metadata such as description, date, or cover photo (e.g. an optional
  `photos/<album>/album.json`).
- Separate routes/pages per album, or an album-cover grid landing page. The single-page list with
  anchors covers the need for now and is easy to extend later.
- Nested albums.
- Sorting albums by EXIF date instead of name.

## Implementation checklist

1. Script: album discovery, slugging, duplicate-slug error, namespaced output paths.
2. Script: recursive stale cleanup and empty-directory removal.
3. Script: emit `GalleryAlbum[]` manifest.
4. App: per-album sections, headings, per-album lightbox slides.
5. App: album index nav (≥ 2 titled albums).
6. Styles: headings, nav, smooth scroll with reduced-motion fallback.
7. README update.
8. Verify with `pnpm build` in these cases: (a) today's flat layout gives an identical-looking
   gallery with no headings, (b) two albums plus loose photos, (c) duplicate slug fails the build,
   (d) renaming an album folder removes its old generated directory.
