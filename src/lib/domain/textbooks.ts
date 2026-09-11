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
