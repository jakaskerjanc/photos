import type { GalleryAlbum, GalleryImage, GalleryPhoto } from "../src/gallery";

// The generated file lives in src/generated/ and shares the app's types instead of redeclaring them.
const manifestTypes = `import type { GalleryAlbum } from "../gallery";

export type { GalleryAlbum, GalleryImage, GalleryPhoto } from "../gallery";
`;

// src values are template literals so that their ${import.meta.env.BASE_URL} prefix is evaluated by Vite.
function formatImage({ src, width, height }: GalleryImage) {
  return `src: \`${src}\`, width: ${width}, height: ${height}`;
}

// Optional fields are left out when unset rather than written as undefined.
function optional(name: string, value: string | number | undefined, separator: string) {
  return value === undefined ? "" : `${separator}${name}: ${JSON.stringify(value)}`;
}

function formatPhoto({ src, width, height, placeholder, thumbnails, details }: GalleryPhoto) {
  const thumbnailList = thumbnails.map((thumbnail) => `{ ${formatImage(thumbnail)} }`).join(", ");
  return `      { ${formatImage({ src, width, height })}, placeholder: ${JSON.stringify(placeholder)}, thumbnails: [${thumbnailList}]${optional("details", details, ", ")} },`;
}

function formatAlbum({ slug, title, photos, dates, description, cover }: GalleryAlbum) {
  const fieldSeparator = ",\n    ";
  return `  {
    slug: ${JSON.stringify(slug)},
    title: ${JSON.stringify(title)}${optional("dates", dates, fieldSeparator)}${optional("description", description, fieldSeparator)}${optional("cover", cover, fieldSeparator)},
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
