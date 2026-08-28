import { useState } from "react";
import { RowsPhotoAlbum } from "react-photo-album";
import Lightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import { photos } from "./generated/photos";

export function App() {
  const [lightboxIndex, setLightboxIndex] = useState(-1);

  return (
    <main className="gallery-shell">
      <RowsPhotoAlbum
        photos={photos}
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
        carousel={{ finite: false, imageFit: "contain" }}
        toolbar={{ buttons: ["zoom", "close"] }}
        render={{ buttonPrev: () => null, buttonNext: () => null }}
        controller={{ closeOnBackdropClick: true }}
      />
    </main>
  );
}
