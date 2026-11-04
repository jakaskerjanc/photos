# Photos

A minimal React photo gallery for GitHub Pages.

## Add photos

Put supported image files in [`photos`](./photos):

- `.jpg` / `.jpeg`
- `.png`
- `.webp`
- `.avif`

The build automatically scans that folder and writes the gallery manifest. It generates 640px and 960px wide WebP thumbnails for normal images; the browser picks the 960px one on high-density screens. Panoramas (aspect ratio of at least 2:1) receive a single larger thumbnail sized for a 960px display height, capped at 6144px wide. Each photo also gets a 12px preview, inlined in the manifest, that is shown blurred while its thumbnail loads. Opening a photo loads its original file from `public/photos/full`; the lightbox's thumbnail strip reuses the grid thumbnails. Thumbnails are WebP quality 76, except for photos whose files are already very small for their resolution (under 0.3 bits per pixel): those are already heavily compressed, so their thumbnails use quality 90 to avoid losing what detail is left.

Published full-size photos have their metadata removed (camera details, GPS position, captions), keeping only the color profile and rotation needed to display them correctly.

Generated files are reused until their source photo's modification time changes. After changing thumbnail settings in `scripts/photos.ts`, delete `public/photos/derivatives` to rebuild all thumbnails.

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

- Albums are sorted by folder name. A leading number of up to three digits followed by a space, `-` or `_` controls the order and is hidden from the title, so `01 Iceland 2025` is shown as **Iceland 2025**. Longer numbers such as years are kept: `2024 Norway` stays **2024 Norway**.
- Each album is linked from the index in the page header and has its own URL anchor, e.g. `#iceland-2025`. The header stays at the top while scrolling and marks the album you're in.
- Photos placed directly in `photos` (not in a subfolder) are shown first, under the heading **Selected** (no heading if there are no albums).
- File names only need to be unique within an album. Two photos whose names differ only by extension or letter case (e.g. `sunset.jpg` and `Sunset.png`) stop the build with an error, because their thumbnails would share a name.
- Albums can't be nested; subfolders inside an album are ignored with a warning.
- Two folders whose titles produce the same URL name (e.g. `Škocjan` and `Skocjan`) stop the build with an error. Rename one of them.

## Site name and intro

The name in the page header and the line under it are set in [`src/site.ts`](./src/site.ts). Leave `intro` empty to hide the line.

## Run locally

```bash
pnpm install
pnpm dev
```

## Build and preview

```bash
pnpm build
pnpm preview
```

## Deploy

Push the repository's `main` branch to GitHub. The workflow in `.github/workflows/deploy.yml` builds and publishes the `dist` folder to GitHub Pages.

In the repository settings, set Pages → Build and deployment → Source to **GitHub Actions**.
