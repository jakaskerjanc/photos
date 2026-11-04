// An album folder may contain an album.md with an optional cover photo and a short description:
//
//   ---
//   cover: DSC02167.avif
//   ---
//   Two weeks driving the Ring Road.
//
// The description is plain text; blank lines separate paragraphs.

export const albumNotesFileName = "album.md";

export type AlbumNotes = { cover?: string; description?: string; warnings: string[] };

const knownKeys = new Set(["cover"]);

export function parseAlbumNotes(text: string, location: string): AlbumNotes {
  const warnings: string[] = [];
  let body = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  let cover: string | undefined;

  const frontMatter = body.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (frontMatter) {
    body = body.slice(frontMatter[0].length);
    for (const line of frontMatter[1].split("\n")) {
      if (!line.trim()) continue;
      const field = line.match(/^\s*([A-Za-z]+)\s*:\s*(.*?)\s*$/);
      const key = field?.[1].toLowerCase();
      if (!field || !key || !knownKeys.has(key)) {
        warnings.push(`Ignoring "${line.trim()}" in ${location}: only "cover: <photo file name>" is supported.`);
        continue;
      }
      // Quotes are optional, as in YAML.
      cover = field[2].replace(/^(["'])(.*)\1$/, "$2") || undefined;
    }
  }

  const paragraphs = body
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  return { cover, description: paragraphs.length > 0 ? paragraphs.join("\n\n") : undefined, warnings };
}
