export type GalleryImage = { src: string; width: number; height: number };

export type GalleryPhoto = GalleryImage & {
  // A tiny blurred preview, shown as a data URI while the thumbnail loads.
  placeholder: string;
  thumbnails: GalleryImage[]; // smallest first
  details?: string; // date taken and camera settings, from EXIF
};

export type GalleryAlbum = {
  slug: string; // "" for loose photos
  title: string | null; // null for loose photos → no heading
  photos: GalleryPhoto[];
  dates?: string; // e.g. "5–17 Aug 2026", from the photos' EXIF
  description?: string; // from album.md; paragraphs separated by blank lines
  cover?: number; // index into photos, from album.md; the first photo otherwise
};
