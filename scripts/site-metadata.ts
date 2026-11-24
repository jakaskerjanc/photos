// The <head> tags that describe the site to search engines and to the apps that show link previews.

export type LinkPreviewImage = {
  path: string; // relative to the site's address, e.g. "photos/derivatives/link-preview.jpg"
  width: number;
  height: number;
  alt: string;
  version: string; // changes with the image, so apps that cache previews by URL fetch the new one
};

export function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// The image and address need the site's full public address (`url`), so they are left out without one.
export function headTags({
  title,
  description,
  url,
  image,
}: {
  title: string;
  description: string;
  url: string;
  image: LinkPreviewImage | null;
}) {
  const meta = (attribute: "name" | "property", key: string, content: string | number) =>
    `<meta ${attribute}="${key}" content="${escapeHtml(String(content))}" />`;
  const siteUrl = url && (url.endsWith("/") ? url : `${url}/`);

  const tags = [
    `<title>${escapeHtml(title)}</title>`,
    meta("name", "description", description),
    meta("property", "og:type", "website"),
    meta("property", "og:title", title),
    meta("property", "og:description", description),
  ];
  if (siteUrl) {
    tags.push(meta("property", "og:url", siteUrl));
    if (image) {
      tags.push(
        meta("property", "og:image", new URL(`${image.path}?v=${image.version}`, siteUrl).href),
        meta("property", "og:image:width", image.width),
        meta("property", "og:image:height", image.height),
        meta("property", "og:image:alt", image.alt),
        meta("name", "twitter:card", "summary_large_image"),
      );
    }
  }
  return tags;
}
