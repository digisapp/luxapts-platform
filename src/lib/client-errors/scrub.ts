// Server-side cleanup for browser error reports, applied before anything is
// stored: error text can carry whatever the page was handling.

/** Emails, URL query strings (search text, tokens) and long digit runs. */
export function scrubText(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[email]")
    .replace(/(https?:\/\/[^\s?#'"()]+)\?[^\s#'"()]*/g, "$1?…")
    .replace(/\b\d{7,}\b/g, "[number]");
}

/** The path alone: query strings carry search text and tracking ids. */
export function pathOnly(path: string): string {
  return path.split(/[?#]/)[0].slice(0, 300) || "/";
}
