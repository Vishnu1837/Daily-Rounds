import { NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth/session';
import { getFeedbackAttachment } from '@/server/queries/feedback';

/**
 * One screenshot from a student's bug report.
 *
 * A route rather than a data URL in the page, for the reason that decides most of this
 * feature: images are the only thing here big enough to be expensive, and inlining them
 * would put every screenshot of every report into the HTML of a list nobody has clicked into
 * yet. Behind a URL they cost nothing until somebody looks.
 *
 * ## Authorisation
 *
 * Admin only, checked against the *real* session rather than the effective one — a cohort
 * lead with a "view as student" session open is still an admin, and the student they are
 * viewing as must never become a way to read other students' reports.
 *
 * It answers 404 rather than 403 for a signed-in non-admin. There is nothing at this path
 * for them, and the distinction between "no such image" and "an image you may not see" is
 * itself a fact about other people's data.
 *
 * The id in the path is the only handle on the row and it is a v4 UUID, so a URL is not
 * something anyone guesses their way to. It is still not a capability: the check above runs
 * on every request, so a link pasted out of the console is inert for whoever receives it.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ attachmentId: string }> },
) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') {
    return new NextResponse('Not found', { status: 404 });
  }

  const { attachmentId } = await context.params;
  const attachment = await getFeedbackAttachment(attachmentId);
  if (!attachment) return new NextResponse('Not found', { status: 404 });

  return new NextResponse(Buffer.from(attachment.data), {
    headers: {
      'Content-Type': attachment.mimeType,
      /*
       * Private and long-lived. The bytes at a given id never change — an edited screenshot
       * would be a new row — so a cohort lead scrolling back up a list does not re-fetch a
       * megabyte, while `private` keeps it out of any shared cache in front of the app.
       */
      'Cache-Control': 'private, max-age=3600',
      // Belt and braces beside the MIME allowlist the upload enforces: whatever this turns
      // out to be, the browser renders it as the type we recorded or not at all.
      'X-Content-Type-Options': 'nosniff',
      // A screenshot is evidence, not a document to be framed by another site.
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
}
