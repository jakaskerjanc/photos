import { useEffect, useState } from "react";
import { RowsPhotoAlbum } from "react-photo-album";
import Lightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import { albums } from "./generated/photos";

const galleryAlbums = albums.map((album) => ({
  ...album,
  thumbnails: album.photos.map(({ thumbnail, ...photo }) => ({
    ...photo,
    src: thumbnail.src,
  })),
}));
const titledAlbums = galleryAlbums.filter((album) => album.title !== null);

export function App() {
  const [lightbox, setLightbox] = useState({ albumIndex: 0, photoIndex: -1 });

  // The browser jumps to the #slug before the albums have measured their width and
  // rendered any photos, so it lands at the top of a short page. Jump again once they have.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const slug = decodeURIComponent(window.location.hash.slice(1));
      if (slug) document.getElementById(slug)?.scrollIntoView({ behavior: "instant" });
    });
    return () => cancelAnimationFrame(frame);
  }, []);

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

      {galleryAlbums.map((album, albumIndex) => (
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
            photos={album.thumbnails}
            targetRowHeight={280}
            rowConstraints={{ minPhotos: 1, maxPhotos: 5 }}
            spacing={4}
            onClick={({ index }) => setLightbox({ albumIndex, photoIndex: index })}
            componentsProps={{
              container: { className: "gallery" },
            }}
          />
        </section>
      ))}

      <Lightbox
        open={lightbox.photoIndex >= 0}
        close={() => setLightbox((current) => ({ ...current, photoIndex: -1 }))}
        index={Math.max(lightbox.photoIndex, 0)}
        slides={albums[lightbox.albumIndex]?.photos ?? []}
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
