/**
 * Shared between the reader, which sets it, and the textbook route, which requires it.
 *
 * A custom header is something a page can add to a `fetch` and an address bar, a link or an
 * `<embed>` cannot — so its presence is how the route tells the in-app reader apart from a
 * browser tab pointed straight at the file.
 */
export const TEXTBOOK_READER_HEADER = 'x-textbook-reader';

/** A PDF's first bytes. Checked after upload so a mislabelled file never reaches a reader. */
export const PDF_MAGIC = '%PDF-';

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

/**
 * A short, stable stand-in for a cover's storage key, for cache busting.
 *
 * The cover route answers on the *material's* id, so replacing a cover changes nothing
 * about the URL and a browser that cached the old one for an hour keeps showing it. This
 * gives the shelf a `?v=` to hang off the key instead — it changes exactly when the cover
 * does, and it is a hash rather than the key itself because the key is the one handle on a
 * private object and does not belong in a page's HTML.
 */
export function coverVersion(coverKey: string): string {
  let hash = 0;
  for (let i = 0; i < coverKey.length; i += 1) {
    hash = (Math.imul(hash, 31) + coverKey.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}
