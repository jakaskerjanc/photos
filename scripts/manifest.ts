import type { GalleryAlbum, GalleryPhoto } from "../src/gallery";

// The generated file lives in src/generated/ and shares the app's types instead of redeclaring them.
const manifestTypes = `import type { GalleryAlbum } from "../gallery";

export type { GalleryAlbum, GalleryPhoto } from "../gallery";
`;

function formatPhoto({ src, width, height, thumbnail }: GalleryPhoto) {
  return `      { src: \`${src}\`, width: ${width}, height: ${height}, thumbnail: { src: \`${thumbnail.src}\`, width: ${thumbnail.width}, height: ${thumbnail.height} } },`;
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
