import { join, relative, sep } from "node:path";
import type { AlbumSource } from "./albums";

// Written next to the thumbnails, so it is published with them and its URL follows the site's base path.
export const linkPreviewFileName = "link-preview.jpg";

export type LinkPreviewPhoto = { sourcePath: string; albumTitle: string | null };

function pathInside(rootDirectory: string, album: AlbumSource, fileName: string) {
  return relative(rootDirectory, join(album.directory, fileName)).split(sep).join("/");
}

// The photo named by previewPhoto in src/site.ts (a path inside the photos folder, compared ignoring case),
// or else the first album's cover; the photos outside albums are only used when there are no albums.
export function chooseLinkPreviewPhoto(
  albums: AlbumSource[],
  rootDirectory: string,
  previewPhoto: string,
  warnings: string[],
): LinkPreviewPhoto | undefined {
  const wanted = previewPhoto.trim().replace(/\\/g, "/").replace(/^\.?\/+/, "").toLowerCase();
  if (wanted) {
    for (const album of albums) {
      const fileName = album.fileNames.find((name) => pathInside(rootDirectory, album, name).toLowerCase() === wanted);
      if (fileName) return { sourcePath: join(album.directory, fileName), albumTitle: album.title };
    }
    warnings.push(`The previewPhoto "${previewPhoto}" set in src/site.ts is not a photo in the photos folder; using the first album's cover.`);
  }

  const album = albums.find((candidate) => candidate.title !== null) ?? albums[0];
  if (!album) return undefined;
  return { sourcePath: join(album.directory, album.coverFileName ?? album.fileNames[0]), albumTitle: album.title };
}

export function linkPreviewAlt(siteTitle: string, albumTitle: string | null) {
  return `A photo from ${albumTitle ?? siteTitle}`;
}
