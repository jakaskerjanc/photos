export type GalleryImage = { src: string; width: number; height: number };

export type GalleryPhoto = GalleryImage & {
  // A tiny blurred preview, shown as a data URI while the thumbnail loads.
  placeholder: string;
  thumbnails: GalleryImage[]; // smallest first
  // From EXIF: the date taken, e.g. "6 Aug 2026", the camera, e.g. "Sony α6700", and its settings.
  taken?: string;
  camera?: string;
  settings?: string[]; // e.g. ["16mm", "f/8", "1/250 s", "ISO 100"]
  file: string[]; // the full image's resolution and size, e.g. ["6192 × 4128", "25.6 MP", "8.4 MB"]
};

export type GalleryAlbum = {
  slug: string; // "" for loose photos
  title: string | null; // null for loose photos → no heading
  photos: GalleryPhoto[];
  dates?: string; // e.g. "5–17 Aug 2026", from the photos' EXIF
  description?: string; // from album.md; paragraphs separated by blank lines
  cover?: number; // index into photos, from album.md; the first photo otherwise
};
