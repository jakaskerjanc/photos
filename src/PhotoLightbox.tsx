// Loaded on demand (see App.tsx), so the grid can show before the lightbox's code has downloaded.
import { useEffect, useRef } from "react";
import Lightbox, { useLightboxState } from "yet-another-react-lightbox";
import Download from "yet-another-react-lightbox/plugins/download";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";
// After the library's styles, so the overrides in it win.
import "./lightbox.css";

export type LightboxSlide = {
  src: string;
  width: number;
  height: number;
  alt: string;
  thumbnail: string;
  // From EXIF: the date taken, e.g. "6 Aug 2026", the camera, e.g. "Sony α6700", and its settings.
  taken?: string;
  camera?: string;
  settings?: string[]; // e.g. ["16mm", "f/8", "1/250 s", "ISO 100"]
  file: string[]; // the full image's resolution and size, e.g. ["6192 × 4128", "25.6 MP", "8.4 MB"]
};

export type LightboxAlbum = { title: string | null; slides: LightboxSlide[] };

// Not yet-another-react-lightbox's Thumbnails plugin: it only shows as many thumbnails as the carousel
// preloads, and preloading more would download several full-size originals around the current photo.
function LightboxThumbnails({ slides, onSelect }: { slides: LightboxSlide[]; onSelect: (index: number) => void }) {
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

function SpecList({ className, items }: { className: string; items: string[] }) {
  return (
    <span className={className}>
      {items.map((item) => (
        <span key={item}>{item}</span>
      ))}
    </span>
  );
}

function LightboxPosition({ album }: { album: LightboxAlbum }) {
  const { currentIndex } = useLightboxState();
  const photo = album.slides[currentIndex];
  return (
    <div className="lightbox-position">
      <div>
        {album.title !== null && <span className="lightbox-album">{album.title}</span>}
        <span className="lightbox-counter">
          {currentIndex + 1} / {album.slides.length}
        </span>
      </div>
      {photo && (photo.camera || photo.taken) && (
        <div className="lightbox-capture">
          {photo.camera && <span className="lightbox-camera">{photo.camera}</span>}
          {photo.taken && <span>{photo.taken}</span>}
        </div>
      )}
      {photo && (
        <div className="lightbox-specs">
          {photo.settings && <SpecList className="lightbox-settings" items={photo.settings} />}
          <SpecList className="lightbox-file" items={photo.file} />
        </div>
      )}
    </div>
  );
}

export default function PhotoLightbox({
  album,
  index,
  onView,
  onClose,
}: {
  album: LightboxAlbum | undefined;
  index: number; // -1 when closed
  onView: (index: number) => void;
  onClose: () => void;
}) {
  const hasThumbnails = album !== undefined && album.slides.length > 1;
  return (
    <Lightbox
      open={index >= 0}
      close={onClose}
      index={Math.max(index, 0)}
      slides={album?.slides ?? []}
      plugins={[Zoom, Download]}
      zoom={{ maxZoomPixelRatio: 1.13, zoomInMultiplier: 1.25, doubleClickMaxStops: 1 }}
      carousel={{ finite: false, imageFit: "contain", preload: 0 }}
      toolbar={{ buttons: ["download", "zoom", "close"] }}
      render={{
        controls: () => (
          <>
            {album && <LightboxPosition album={album} />}
            {hasThumbnails && <LightboxThumbnails slides={album.slides} onSelect={onView} />}
          </>
        ),
      }}
      on={{ view: ({ index: photoIndex }) => onView(photoIndex) }}
      className={hasThumbnails ? "lightbox-with-thumbnails" : undefined}
      controller={{ closeOnBackdropClick: true, closeOnPullDown: true }}
    />
  );
}
