import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { site } from "./src/site";

function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Fills the page title and link-preview tags from src/site.ts, so chat apps show the site's name and intro.
function siteMetadata(): Plugin {
  return {
    name: "site-metadata",
    transformIndexHtml(html) {
      const meta = [
        `<meta property="og:type" content="website" />`,
        `<meta property="og:title" content="${escapeHtml(site.title)}" />`,
        ...(site.intro
          ? [
              `<meta name="description" content="${escapeHtml(site.intro)}" />`,
              `<meta property="og:description" content="${escapeHtml(site.intro)}" />`,
            ]
          : []),
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
