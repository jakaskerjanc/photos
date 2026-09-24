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
