// Search engines show a page's description under its title, so the page always has one: the description
// from src/site.ts, or else its intro (passed in as `text`), or else a list of the albums.
const maxListedAlbums = 5;

export function siteDescription(text: string, albumTitles: string[]) {
  if (text) return text;
  if (albumTitles.length === 0) return "A photo gallery.";
  const listed =
    albumTitles.length > maxListedAlbums ? [...albumTitles.slice(0, maxListedAlbums), "more"] : albumTitles;
  return `Photos from ${new Intl.ListFormat("en", { type: "conjunction" }).format(listed)}.`;
}
