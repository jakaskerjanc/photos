# Photos

A minimal React photo gallery for GitHub Pages.

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

- Albums are sorted by folder name. A leading number of up to three digits followed by a space, `-` or `_` controls the order and is hidden from the title, so `01 Iceland 2025` is shown as **Iceland 2025**. Longer numbers such as years are kept: `2024 Norway` stays **2024 Norway**.
- Each album is linked from the index at the top of the page and has its own URL anchor, e.g. `#iceland-2025`.
- Photos placed directly in `photos` (not in a subfolder) are shown first, without a title.
- File names only need to be unique within an album.
- Albums can't be nested; subfolders inside an album are ignored with a warning.
- Two folders whose titles produce the same URL name (e.g. `Škocjan` and `Skocjan`) stop the build with an error. Rename one of them.

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
