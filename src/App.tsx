import { useEffect, useRef, useState } from "react";
import { RowsPhotoAlbum } from "react-photo-album";
import Lightbox, { useLightboxState } from "yet-another-react-lightbox";
import Download from "yet-another-react-lightbox/plugins/download";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import { albums } from "./generated/photos";

const galleryAlbums = albums.map((album) => ({
  ...album,
  // The grid shows thumbnails: the smallest as src and all of them as srcSet, so 2x screens pick a larger one.
  // width/height are the largest thumbnail's, otherwise react-photo-album adds src to srcSet at the wrong width.
  thumbnails: album.photos.map(({ placeholder, thumbnails }) => {
    const largest = thumbnails[thumbnails.length - 1];
    return { src: thumbnails[0].src, width: largest.width, height: largest.height, srcSet: thumbnails, placeholder };
  }),
  slides: album.photos.map(({ src, width, height, thumbnails }) => ({ src, width, height, thumbnail: thumbnails[0].src })),
}));
const titledAlbums = galleryAlbums.filter((album) => album.title !== null);

function markLoaded(event: React.SyntheticEvent<HTMLImageElement>) {
  event.currentTarget.dataset.loaded = "";
}

// Not yet-another-react-lightbox's Thumbnails plugin: it only shows as many thumbnails as the carousel
// preloads, and preloading more would download several full-size originals around the current photo.
function LightboxThumbnails({ slides, onSelect }: { slides: { thumbnail: string }[]; onSelect: (index: number) => void }) {
  const { currentIndex } = useLightboxState();
  const strip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const active = strip.current?.children[currentIndex] as HTMLElement | undefined;
    if (!strip.current || !active) return;
    const left = active.offsetLeft - (strip.current.clientWidth - active.offsetWidth) / 2;
    strip.current.scrollTo({ left, behavior: "smooth" });
  }, [currentIndex]);

  return (
    <div
      ref={strip}
      className="lightbox-thumbnails"
      // Scrolling or dragging the strip must not swipe the photo above it.
      onWheel={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {slides.map(({ thumbnail }, index) => (
        <button
          key={thumbnail}
          type="button"
          aria-label={`Photo ${index + 1}`}
          aria-current={index === currentIndex || undefined}
          onClick={() => onSelect(index)}
        >
          <img src={thumbnail} alt="" loading="lazy" decoding="async" />
        </button>
      ))}
    </div>
  );
}

function LightboxPosition({ title }: { title: string | null }) {
  const { currentIndex, slides } = useLightboxState();
  return (
    <div className="lightbox-position">
      {title !== null && <span className="lightbox-album">{title}</span>}
      <span className="lightbox-counter">
        {currentIndex + 1} / {slides.length}
      </span>
    </div>
  );
}

export function App() {
  const [lightbox, setLightbox] = useState({ albumIndex: 0, photoIndex: -1 });
  const lightboxAlbum = galleryAlbums[lightbox.albumIndex];

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
              // The blurred preview fills the photo's box until the thumbnail has loaded and faded in over it.
              button: ({ photo }) => ({ style: { backgroundImage: `url(${photo.placeholder})` } }),
              image: { onLoad: markLoaded, onError: markLoaded },
            }}
          />
        </section>
      ))}

      <Lightbox
        open={lightbox.photoIndex >= 0}
        close={() => setLightbox((current) => ({ ...current, photoIndex: -1 }))}
        index={Math.max(lightbox.photoIndex, 0)}
        slides={lightboxAlbum?.slides ?? []}
        plugins={[Zoom, Download]}
        zoom={{ maxZoomPixelRatio: 1.13, zoomInMultiplier: 1.25, doubleClickMaxStops: 1 }}
        carousel={{ finite: false, imageFit: "contain", preload: 0 }}
        toolbar={{ buttons: ["download", "zoom", "close"] }}
        render={{
          controls: () => (
            <>
              <LightboxPosition title={lightboxAlbum?.title ?? null} />
              {lightboxAlbum && lightboxAlbum.slides.length > 1 && (
                <LightboxThumbnails
                  slides={lightboxAlbum.slides}
                  onSelect={(photoIndex) => setLightbox((current) => ({ ...current, photoIndex }))}
                />
              )}
            </>
          ),
        }}
        on={{ view: ({ index: photoIndex }) => setLightbox((current) => ({ ...current, photoIndex })) }}
        className={lightboxAlbum && lightboxAlbum.slides.length > 1 ? "lightbox-with-thumbnails" : undefined}
        controller={{ closeOnBackdropClick: true }}
      />
    </main>
  );
}
