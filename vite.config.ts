import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { discoverAlbums } from "./scripts/albums";
import { siteDescription } from "./scripts/site-description";
import { headTags, type LinkPreviewImage } from "./scripts/site-metadata";
import { site } from "./src/site";

// Written by scripts/generate-photo-manifest.ts, which runs before Vite in `pnpm dev` and `pnpm build`.
async function readLinkPreviewImage(): Promise<LinkPreviewImage | null> {
  try {
    return JSON.parse(await readFile(join(import.meta.dirname, "src", "generated", "link-preview.json"), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

// Fills the page title, description and link-preview tags from src/site.ts (and the album names, when
// there is no description or intro), so search results and chat apps show the site's name and what is in it.
function siteMetadata(): Plugin {
  return {
    name: "site-metadata",
    async transformIndexHtml(html) {
      // The manifest script has already reported any problems with the photos folder, so its warnings are not repeated.
      const { albums } = await discoverAlbums(join(import.meta.dirname, "photos"));
      const titles = albums.flatMap((album) => (album.title === null ? [] : [album.title]));
      const tags = headTags({
        title: site.title,
        description: siteDescription(site.description || site.intro, titles),
        url: site.url,
        image: await readLinkPreviewImage(),
      });
      return html.replace(/<title>.*<\/title>/, tags.join("\n    "));
    },
  };
}

export default defineConfig({
  plugins: [react(), siteMetadata()],
});
