# My Simple Gallery

A minimal React photo gallery for GitHub Pages.

## Add photos

Put supported image files in [`public/photos`](./public/photos):

- `.jpg` / `.jpeg`
- `.png`
- `.webp`
- `.avif`

The build automatically scans that folder and generates the gallery manifest. Photos are sorted by filename, so names such as `001.jpg`, `002.jpg`, and `003.jpg` can be used to control the order.

## Run locally

```bash
npm install
npm run dev
```

## Build and preview

```bash
npm run build
npm run preview
```

## Deploy

Push the repository's `main` branch to GitHub. The workflow in `.github/workflows/deploy.yml` builds and publishes the `dist` folder to GitHub Pages.

In the repository settings, set Pages → Build and deployment → Source to **GitHub Actions**.
