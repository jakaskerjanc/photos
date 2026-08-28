export type GalleryPhoto = {
  src: string;
  width: number;
  height: number;
};

export const photos: GalleryPhoto[] = [
  { src: `${import.meta.env.BASE_URL}photos/01-landscape.jpg`, width: 1600, height: 1100 },
  { src: `${import.meta.env.BASE_URL}photos/02-portrait.jpg`, width: 1000, height: 1600 },
  { src: `${import.meta.env.BASE_URL}photos/03-wide.jpg`, width: 1800, height: 900 },
  { src: `${import.meta.env.BASE_URL}photos/04-square.jpg`, width: 1200, height: 1200 },
  { src: `${import.meta.env.BASE_URL}photos/05-tall.jpg`, width: 1000, height: 1500 },
  { src: `${import.meta.env.BASE_URL}photos/06-landscape.jpg`, width: 1600, height: 1000 },
  { src: `${import.meta.env.BASE_URL}photos/07-very-wide.jpg`, width: 2400, height: 500 }
];
