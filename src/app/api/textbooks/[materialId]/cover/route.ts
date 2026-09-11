import { NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth/session';
import { coverKeyFor } from '@/server/queries/textbooks';
import { coverContentType, readObject } from '@/server/textbook-storage';

/**
 * A textbook's cover image, for the shelf and the book's own page.
 *
 * Membership is checked here exactly as it is for the book's pages — signed out, paused,
 * removed or another cohort all get the same 404 — but the reader-header trick the PDF
 * route uses is deliberately absent: this is drawn by an `<img>`, and an `<img>` cannot set
 * a custom header. Nor does it need the protection. The cover is the one page of the book
 * that is already on the back of every copy in every bookshop.
 *
 * Cached privately and briefly. A shelf of twelve books is twelve requests on every visit,
 * and a cover changes when an admin replaces it — an hour of staleness in a browser cache
 * is a fair trade for not paying for those twelve on every navigation. `private` keeps it
 * out of any shared cache, because the URL is only a 404 away from being someone else's.
 */
export async function GET(request: Request, context: { params: Promise<{ materialId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return notFound();

  const { materialId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(materialId)) return notFound();

  const key = await coverKeyFor(user, materialId);
  if (!key) return notFound();

  const object = await readObject(key, request.headers.get('range'));
  if (!object) return notFound();

  return new NextResponse(object.body, {
    status: object.status,
    headers: {
      ...object.headers,
      'Content-Type': coverContentType(key),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=3600',
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
