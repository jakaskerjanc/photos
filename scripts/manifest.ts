import type { GalleryAlbum, GalleryImage, GalleryPhoto } from "../src/gallery";

// The generated file lives in src/generated/ and shares the app's types instead of redeclaring them.
const manifestTypes = `import type { GalleryAlbum } from "../gallery";

export type { GalleryAlbum, GalleryImage, GalleryPhoto } from "../gallery";
`;

// src values are template literals so that their ${import.meta.env.BASE_URL} prefix is evaluated by Vite.
function formatImage({ src, width, height }: GalleryImage) {
  return `src: \`${src}\`, width: ${width}, height: ${height}`;
}

function formatPhoto({ placeholder, thumbnails, ...image }: GalleryPhoto) {
  const thumbnailList = thumbnails.map((thumbnail) => `{ ${formatImage(thumbnail)} }`).join(", ");
  return `      { ${formatImage(image)}, placeholder: ${JSON.stringify(placeholder)}, thumbnails: [${thumbnailList}] },`;
}

function formatAlbum({ slug, title, photos }: GalleryAlbum) {
  return `  {
    slug: ${JSON.stringify(slug)},
    title: ${JSON.stringify(title)},
    photos: [
${photos.map(formatPhoto).join("\n")}
    ],
  },`;
}

export function formatManifest(albums: GalleryAlbum[]) {
  return `${manifestTypes}
export const albums: GalleryAlbum[] = [
${albums.map(formatAlbum).join("\n")}
];
`;
}
