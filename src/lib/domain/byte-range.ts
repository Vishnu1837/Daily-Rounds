/**
 * Parses a single-range HTTP `Range` header against an object of `size` bytes.
 *
 * Returns the inclusive byte span, `null` when there is no usable range (serve the whole
 * object), or `'unsatisfiable'` when the range starts past the end (answer 416).
 *
 * Multi-range requests (`bytes=0-10,20-30`) are treated as no range at all. PDF.js never
 * sends them, and a 200 with the full body is a correct answer to one.
 */
export function parseByteRange(
  header: string | null,
  size: number,
): { start: number; end: number } | null | 'unsatisfiable' {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;

  const [, rawStart, rawEnd] = match;
  if (rawStart === '' && rawEnd === '') return null;

  if (rawStart === '') {
    // A suffix range: the last N bytes.
    const length = Number(rawEnd);
    if (length === 0) return 'unsatisfiable';
    return { start: Math.max(0, size - length), end: size - 1 };
  }

  const start = Number(rawStart);
  if (start >= size) return 'unsatisfiable';
  const end = rawEnd === '' ? size - 1 : Math.min(Number(rawEnd), size - 1);
  if (end < start) return null;
  return { start, end };
}
