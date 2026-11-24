import { join } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { discoverAlbums } from "./scripts/albums";
import { siteDescription } from "./scripts/site-description";
import { site } from "./src/site";

function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Fills the page title, description and link-preview tags from src/site.ts (and the album names, when
// there is no intro), so search results and chat apps show the site's name and what is in it.
function siteMetadata(): Plugin {
  return {
    name: "site-metadata",
    async transformIndexHtml(html) {
      // The manifest script has already reported any problems with the photos folder, so its warnings are not repeated.
      const { albums } = await discoverAlbums(join(import.meta.dirname, "photos"));
      const titles = albums.flatMap((album) => (album.title === null ? [] : [album.title]));
      const description = escapeHtml(siteDescription(site.intro, titles));
      const meta = [
        `<meta name="description" content="${description}" />`,
        `<meta property="og:type" content="website" />`,
        `<meta property="og:title" content="${escapeHtml(site.title)}" />`,
        `<meta property="og:description" content="${description}" />`,
      ];
      return html.replace(
        /<title>.*<\/title>/,
        [`<title>${escapeHtml(site.title)}</title>`, ...meta].join("\n    "),
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), siteMetadata()],
});
