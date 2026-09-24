export type GalleryPhoto = {
  src: string;
  width: number;
  height: number;
  thumbnail: { src: string; width: number; height: number };
};

export type GalleryAlbum = {
  slug: string; // "" for loose photos
  title: string | null; // null for loose photos → no heading
  photos: GalleryPhoto[];
};
