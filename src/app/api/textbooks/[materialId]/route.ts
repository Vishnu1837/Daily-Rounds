import { NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth/session';
import { TEXTBOOK_READER_HEADER } from '@/lib/domain/textbooks';
import { textbookKeyFor } from '@/server/queries/textbooks';
import { readObject } from '@/server/textbook-storage';

/**
 * The bytes of a hosted textbook, one range at a time, for the in-app reader only.
 *
 * ## Who gets an answer
 *
 * Checked on every request, against the real session: an admin, or an active member of the
 * cohort the book is filed under (see `textbookKeyFor`). Everyone else — signed out, paused,
 * removed, another cohort — gets the same 404, because "no such book" and "a book you may
 * not read" should look identical from outside.
 *
 * ## Only the reader
 *
 * The request must carry `TEXTBOOK_READER_HEADER`, which PDF.js sets and a browser never
 * does on its own. That shuts the obvious door: pasting this URL into the address bar, or an
 * `<iframe>`/`<embed>` of it, would otherwise open the browser's own PDF viewer, and that
 * viewer has a download button. It is a door, not a vault — anyone who can read a page can
 * be made to reproduce it — so the reader also stamps the student's name onto every page it
 * draws. The header stops casual saving; the watermark is what makes a leak traceable.
 */
export async function GET(request: Request, context: { params: Promise<{ materialId: string }> }) {
  if (request.headers.get(TEXTBOOK_READER_HEADER) !== '1') return notFound();

  const user = await getCurrentUser();
  if (!user) return notFound();

  const { materialId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(materialId)) return notFound();

  const key = await textbookKeyFor(user, materialId);
  if (!key) return notFound();

  const object = await readObject(key, request.headers.get('range'));
  if (!object) return notFound();

  return new NextResponse(object.body, {
    status: object.status,
    headers: {
      ...object.headers,
      'Content-Type': 'application/pdf',
      'Accept-Ranges': 'bytes',
      // Nothing between here and the reader keeps a copy, and nothing re-encodes the body —
      // a gzipped response would hide its length and PDF.js would stop asking for ranges.
      'Cache-Control': 'private, no-store, no-transform',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
}

function notFound() {
  return new NextResponse('Not found', {
    status: 404,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
