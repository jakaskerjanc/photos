import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import type { GalleryAlbum } from "../src/gallery";

const supportedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);

export type AlbumSource = Pick<GalleryAlbum, "slug" | "title"> & {
  directory: string;
  fileNames: string[];
};

function compareNames(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

export function albumTitle(folderName: string) {
  return folderName.replace(/^\d{1,3}[ _-]+/, "") || folderName;
}

export function slugify(title: string) {
  return title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function imageFileNames(entries: Dirent[]) {
  return entries
    .filter((entry) => entry.isFile() && supportedExtensions.has(extname(entry.name).toLowerCase()))
    .map((entry) => entry.name)
    .sort(compareNames);
}

// Thumbnails are named after the photo without its extension, so "a.jpg" and "a.png" would overwrite each other.
// Compared case-insensitively because macOS file systems treat "A.jpg" and "a.jpg" as the same file.
function assertUniqueBaseNames(fileNames: string[], location: string) {
  const fileNamesByBaseName = new Map<string, string>();

  for (const fileName of fileNames) {
    const baseName = fileName.slice(0, -extname(fileName).length).toLowerCase();
    const existingFileName = fileNamesByBaseName.get(baseName);
    if (existingFileName) {
      throw new Error(`Photos "${existingFileName}" and "${fileName}" in ${location} have the same name. Rename one of them.`);
    }
    fileNamesByBaseName.set(baseName, fileName);
  }
}

function visibleFolderNames(entries: Dirent[]) {
  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort(compareNames);
}

export async function discoverAlbums(rootDirectory: string) {
  const warnings: string[] = [];
  const albums: AlbumSource[] = [];
  const entries = await readdir(rootDirectory, { withFileTypes: true });

  const looseFileNames = imageFileNames(entries);
  if (looseFileNames.length > 0) {
    assertUniqueBaseNames(looseFileNames, "the photos folder");
    albums.push({ slug: "", title: null, directory: rootDirectory, fileNames: looseFileNames });
  }

  const folderNamesBySlug = new Map<string, string>();

  for (const folderName of visibleFolderNames(entries)) {
    const directory = join(rootDirectory, folderName);
    const folderEntries = await readdir(directory, { withFileTypes: true });

    for (const nestedFolderName of visibleFolderNames(folderEntries)) {
      warnings.push(`Ignoring nested folder "${folderName}/${nestedFolderName}": albums cannot contain subfolders.`);
    }

    const fileNames = imageFileNames(folderEntries);
    if (fileNames.length === 0) {
      warnings.push(`Skipping album folder "${folderName}": it contains no supported images.`);
      continue;
    }

    assertUniqueBaseNames(fileNames, `album folder "${folderName}"`);

    const title = albumTitle(folderName);
    const slug = slugify(title);
    if (!slug) {
      throw new Error(`Album folder "${folderName}" has no letters or digits that can be used in a URL. Rename it.`);
    }

    const existingFolderName = folderNamesBySlug.get(slug);
    if (existingFolderName) {
      throw new Error(
        `Album folders "${existingFolderName}" and "${folderName}" both use the URL name "${slug}". Rename one of them.`,
      );
    }
    folderNamesBySlug.set(slug, folderName);

    albums.push({ slug, title, directory, fileNames });
  }

  return { albums, warnings };
}
