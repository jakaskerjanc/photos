import { useState } from "react";
import { RowsPhotoAlbum } from "react-photo-album";
import Lightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import { albums } from "./generated/photos";

const albumThumbnails = albums.map((album) =>
  album.photos.map(({ thumbnail, ...photo }) => ({
    ...photo,
    src: thumbnail.src,
  })),
);
const titledAlbums = albums.filter((album) => album.title !== null);

export function App() {
  const [lightbox, setLightbox] = useState({ album: 0, index: -1 });

  return (
    <main className="gallery-shell">
      {titledAlbums.length >= 2 && (
        <nav className="album-index" aria-label="Albums">
          {titledAlbums.map((album) => (
            <a key={album.slug} href={`#${album.slug}`}>
              {album.title}
            </a>
          ))}
        </nav>
      )}

      {albums.map((album, albumIndex) => (
        <section
          key={album.slug}
          className="album"
          aria-labelledby={album.title === null ? undefined : album.slug}
        >
          {album.title !== null && (
            <header className="album-header">
              <h2 id={album.slug} className="album-title">
                {album.title}
              </h2>
              <span className="album-count">
                {album.photos.length} {album.photos.length === 1 ? "photo" : "photos"}
              </span>
            </header>
          )}

          <RowsPhotoAlbum
            photos={albumThumbnails[albumIndex]}
            targetRowHeight={280}
            rowConstraints={{ minPhotos: 1, maxPhotos: 5 }}
            spacing={4}
            onClick={({ index }) => setLightbox({ album: albumIndex, index })}
            componentsProps={{
              container: { className: "gallery" },
            }}
          />
        </section>
      ))}

      <Lightbox
        open={lightbox.index >= 0}
        close={() => setLightbox((current) => ({ ...current, index: -1 }))}
        index={Math.max(lightbox.index, 0)}
        slides={albums[lightbox.album]?.photos ?? []}
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
