import { useState } from "react";
import { RowsPhotoAlbum } from "react-photo-album";
import Lightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import { albums } from "./generated/photos";

// Temporary until the album sections land in the next commit.
const photos = albums.flatMap((album) => album.photos);

export function App() {
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const thumbnails = photos.map(({ thumbnail, ...photo }) => ({
    ...photo,
    src: thumbnail.src,
  }));

  return (
    <main className="gallery-shell">
      <RowsPhotoAlbum
        photos={thumbnails}
        targetRowHeight={280}
        rowConstraints={{ minPhotos: 1, maxPhotos: 5 }}
        spacing={4}
        onClick={({ index }) => setLightboxIndex(index)}
        componentsProps={{
          container: { className: "gallery" },
        }}
      />

      <Lightbox
        open={lightboxIndex >= 0}
        close={() => setLightboxIndex(-1)}
        index={lightboxIndex}
        slides={photos}
        plugins={[Zoom]}
        zoom={{ maxZoomPixelRatio: 5, zoomInMultiplier: 1.25 }}
        carousel={{ finite: false, imageFit: "contain", preload: 0 }}
        toolbar={{ buttons: ["zoom", "close"] }}
        render={{ buttonPrev: () => null, buttonNext: () => null }}
        controller={{ closeOnBackdropClick: true }}
      />
    </main>
  );
}
