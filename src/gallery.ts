export type GalleryImage = { src: string; width: number; height: number };

export type GalleryPhoto = GalleryImage & {
  // A tiny blurred preview, shown as a data URI while the thumbnail loads.
  placeholder: string;
  thumbnails: GalleryImage[]; // smallest first
};

export type GalleryAlbum = {
  slug: string; // "" for loose photos
  title: string | null; // null for loose photos → no heading
  photos: GalleryPhoto[];
};
