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
