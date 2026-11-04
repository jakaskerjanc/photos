import { useEffect, useRef, useState } from "react";
import { RowsPhotoAlbum } from "react-photo-album";
import Lightbox, { useLightboxState } from "yet-another-react-lightbox";
import Download from "yet-another-react-lightbox/plugins/download";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import { type GalleryImage, albums } from "./generated/photos";
import { site } from "./site";

// Same threshold as the build script: wider photos get a panorama thumbnail, and here a row of their own.
const panoramaAspectRatio = 2;

type GridPhoto = GalleryImage & { srcSet: GalleryImage[]; placeholder: string; alt: string };

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

// Consecutive photos share justified rows; a panorama would shrink between them, so it gets a row to itself.
// `start` is the group's first photo's index in the album, to open the right photo in the lightbox.
function rowGroups(photos: GridPhoto[]) {
  const groups: { start: number; photos: GridPhoto[] }[] = [];
  photos.forEach((photo, index) => {
    const isPanorama = photo.width / photo.height >= panoramaAspectRatio;
    const last = groups.at(-1);
    if (!isPanorama && last && last.photos[0].width / last.photos[0].height < panoramaAspectRatio) {
      last.photos.push(photo);
    } else {
      groups.push({ start: index, photos: [photo] });
    }
  });
  return groups;
}

const hasTitledAlbums = albums.some((album) => album.title !== null);

const galleryAlbums = albums.map((album) => {
  // Photos outside any album get a heading too, unless they are the only photos on the page.
  const heading = album.title ?? (hasTitledAlbums ? "Selected" : null);
  const alt = (index: number) => `${heading ?? site.title}, photo ${index + 1} of ${album.photos.length}`;
  // The grid shows thumbnails: the smallest as src and all of them as srcSet, so 2x screens pick a larger one.
  // width/height are the largest thumbnail's, otherwise react-photo-album adds src to srcSet at the wrong width.
  const thumbnails = album.photos.map(({ placeholder, thumbnails }, index) => {
    const largest = thumbnails[thumbnails.length - 1];
    return { src: thumbnails[0].src, width: largest.width, height: largest.height, srcSet: thumbnails, placeholder, alt: alt(index) };
  });
  return {
    ...album,
    heading,
    meta: [album.dates, plural(album.photos.length, "photo")].filter(Boolean).join(" · "),
    coverPhoto: album.photos[album.cover ?? 0],
    rowGroups: rowGroups(thumbnails),
    slides: album.photos.map(({ src, width, height, thumbnails }, index) => ({
      src,
      width,
      height,
      alt: alt(index),
      thumbnail: thumbnails[0].src,
    })),
  };
});
const titledAlbums = galleryAlbums.filter((album) => album.title !== null);
const photoCount = galleryAlbums.reduce((total, album) => total + album.photos.length, 0);

// Publishes the sticky header's height as --header-height (used to offset anchor jumps) and returns
// the album whose section is under the header. Short albums at the end can't scroll up to the header,
// so at the bottom of the page it's the album last linked to (if it's on screen), otherwise the last one.
function useActiveAlbum(header: React.RefObject<HTMLElement | null>) {
  const [activeSlug, setActiveSlug] = useState<string | null>(null);

  useEffect(() => {
    if (!header.current) return;
    const headerElement = header.current;
    const publishHeight = () =>
      document.documentElement.style.setProperty("--header-height", `${headerElement.offsetHeight}px`);
    // Set it right away too: the #slug jump below runs before the observer's first callback.
    publishHeight();
    const resizeObserver = new ResizeObserver(publishHeight);
    resizeObserver.observe(headerElement);

    let frame = 0;
    const update = () => {
      frame = 0;
      const sections = [...document.querySelectorAll<HTMLElement>("section[data-slug]")];
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      const headerBottom = headerElement.getBoundingClientRect().bottom;
      const linked = sections.find((section) => {
        const { top, bottom } = section.getBoundingClientRect();
        return window.location.hash === `#${section.dataset.slug}` && top < window.innerHeight && bottom > headerBottom;
      });
      const current = atBottom
        ? (linked ?? sections.at(-1))
        : sections.filter((section) => section.getBoundingClientRect().top <= headerBottom + 1).at(-1);
      setActiveSlug(current?.dataset.slug ?? null);
    };
    const scheduleUpdate = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("hashchange", scheduleUpdate);
    return () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("hashchange", scheduleUpdate);
    };
  }, [header]);

  return activeSlug;
}

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

function AlbumIndex({ activeSlug }: { activeSlug: string | null }) {
  const nav = useRef<HTMLElement>(null);

  // On narrow screens the index scrolls sideways; keep the current album's link in view.
  useEffect(() => {
    const active = nav.current?.querySelector<HTMLElement>("[aria-current]");
    if (!nav.current || !active || nav.current.scrollWidth <= nav.current.clientWidth) return;
    const left = active.offsetLeft - (nav.current.clientWidth - active.offsetWidth) / 2;
    nav.current.scrollTo({ left, behavior: "smooth" });
  }, [activeSlug]);

  return (
    <nav ref={nav} className="album-index" aria-label="Albums">
      {titledAlbums.map((album) => (
        <a key={album.slug} href={`#${album.slug}`} aria-current={album.slug === activeSlug ? "location" : undefined}>
          {album.title}
          <span className="album-index-count">{album.photos.length}</span>
        </a>
      ))}
    </nav>
  );
}

function LightboxPosition({ album }: { album: (typeof galleryAlbums)[number] }) {
  const { currentIndex } = useLightboxState();
  const details = album.photos[currentIndex]?.details;
  return (
    <div className="lightbox-position">
      <div>
        {album.heading !== null && <span className="lightbox-album">{album.heading}</span>}
        <span className="lightbox-counter">
          {currentIndex + 1} / {album.photos.length}
        </span>
      </div>
      {details && <div className="lightbox-details">{details}</div>}
    </div>
  );
}

function AlbumCovers() {
  return (
    <div className="album-covers">
      {titledAlbums.map(({ slug, title, meta, coverPhoto }) => (
        <a
          key={slug}
          href={`#${slug}`}
          className="album-cover"
          style={{ backgroundImage: `url(${coverPhoto.placeholder})` }}
        >
          <img
            src={coverPhoto.thumbnails[0].src}
            srcSet={coverPhoto.thumbnails.map(({ src, width }) => `${src} ${width}w`).join(", ")}
            sizes="(max-width: 600px) 50vw, 25vw"
            alt=""
            loading="lazy"
            decoding="async"
            onLoad={markLoaded}
            onError={markLoaded}
          />
          <span className="album-cover-text">
            <span className="album-cover-title">{title}</span>
            <span className="album-cover-meta">{meta}</span>
          </span>
        </a>
      ))}
    </div>
  );
}

export function App() {
  const [lightbox, setLightbox] = useState({ albumIndex: 0, photoIndex: -1 });
  const lightboxAlbum = galleryAlbums[lightbox.albumIndex];
  const header = useRef<HTMLElement>(null);
  const activeSlug = useActiveAlbum(header);
  const activeTitle = titledAlbums.find((album) => album.slug === activeSlug)?.title;

  useEffect(() => {
    document.title = activeTitle ? `${activeTitle} · ${site.title}` : site.title;
  }, [activeTitle]);

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
    <>
      <header ref={header} className="site-header">
        <a className="site-title" href="#">
          {site.title}
        </a>
        {titledAlbums.length >= 2 && <AlbumIndex activeSlug={activeSlug} />}
      </header>

      <main className="gallery-shell">
        {(site.intro || titledAlbums.length > 0) && (
          <div className="site-intro">
            {site.intro && <p>{site.intro}</p>}
            {titledAlbums.length > 0 && (
              <span className="site-summary">
                {plural(photoCount, "photo")} · {plural(titledAlbums.length, "album")}
              </span>
            )}
          </div>
        )}

        {titledAlbums.length >= 2 && <AlbumCovers />}

        {galleryAlbums.map((album, albumIndex) => (
          <section
            key={album.slug}
            className="album"
            data-slug={album.slug}
            aria-label={album.title === null ? (album.heading ?? undefined) : undefined}
            aria-labelledby={album.title === null ? undefined : album.slug}
          >
            {album.heading !== null && (
              <header className="album-header">
                {/* Loose photos have no slug, so their heading gets no anchor (and can't clash with an album's). */}
                <h2 id={album.title === null ? undefined : album.slug} className="album-title">
                  {album.heading}
                </h2>
                <span className="album-count">{album.meta}</span>
                {album.description && (
                  <div className="album-description">
                    {album.description.split("\n\n").map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </div>
                )}
              </header>
            )}

            {album.rowGroups.map(({ start, photos }) => (
              <RowsPhotoAlbum
                key={start}
                photos={photos}
                targetRowHeight={280}
                rowConstraints={{ minPhotos: 1, maxPhotos: 5 }}
                spacing={4}
                onClick={({ index }) => setLightbox({ albumIndex, photoIndex: start + index })}
                componentsProps={{
                  container: { className: "gallery" },
                  // The blurred preview fills the photo's box until the thumbnail has loaded and faded in over it.
                  button: ({ photo }) => ({ style: { backgroundImage: `url(${photo.placeholder})` } }),
                  image: { onLoad: markLoaded, onError: markLoaded },
                }}
              />
            ))}
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
                {lightboxAlbum && <LightboxPosition album={lightboxAlbum} />}
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
          controller={{ closeOnBackdropClick: true, closeOnPullDown: true }}
        />
      </main>

      <footer className="site-footer">
        {site.author && (
          <span>
            © {new Date().getFullYear()} {site.author}
          </span>
        )}
        <a href="#">Back to top</a>
      </footer>
    </>
  );
}
