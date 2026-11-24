// Search engines show a page's description under its title, so the page always has one:
// the intro from src/site.ts if it is set, otherwise a list of the albums.
const maxListedAlbums = 5;

export function siteDescription(intro: string, albumTitles: string[]) {
  if (intro) return intro;
  if (albumTitles.length === 0) return "A photo gallery.";
  const listed =
    albumTitles.length > maxListedAlbums ? [...albumTitles.slice(0, maxListedAlbums), "more"] : albumTitles;
  return `Photos from ${new Intl.ListFormat("en", { type: "conjunction" }).format(listed)}.`;
}
