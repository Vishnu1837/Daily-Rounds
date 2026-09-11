import 'server-only';

import { SESSION_COOKIE, getCurrentUser, hashSessionToken } from '@/lib/auth/session';
import { textbookKeyFor } from '@/server/queries/textbooks';

/**
 * "May this session read this book, and where are its bytes?" — answered without a database
 * round trip most of the time.
 *
 * The reader does not make one request per book. It makes one per byte range: opening a
 * chapter is a handful, and scrolling through it is a handful more every few seconds. Each
 * of those was paying for two joins — the session lookup, then the membership check — before
 * the store was touched at all. Against a store in the same region as the function, that
 * pair of round trips was a real share of the wait on every page turn.
 *
 * So the answer is memoised for `TTL_MS`, per session token and book.
 *
 * ## What that costs
 *
 * Revocation is no longer instant. A cohort lead who pauses a student mid-chapter stops
 * their next range request within half a minute rather than on the very next one. That is
 * the whole of the trade, and it is a small one: the student is already looking at pages
 * that were sent before the click, and half a minute of a book they had open is not the risk
 * the membership check exists to manage. Everything else is unchanged — a request with no
 * session, a wrong header, an unknown book or a cohort this account was never in is refused
 * on the spot, and refusals are never cached.
 *
 * The map lives in one server instance's memory and dies with it, so this is a short
 * per-instance memo and never a shared cache. It holds a hash of the session token rather
 * than the token, so a heap dump of a running function is not a set of working credentials.
 * And it is only ever a *key*: a hit is not a decision that the token is valid, it is a
 * recollection that this exact token was checked against the database moments ago.
 */

/** How stale an allowed answer may get. Short enough that revoking access still feels prompt. */
const TTL_MS = 30_000;

/** Entries kept before the oldest are dropped. A cohort's worth of readers, with room spare. */
const MAX_ENTRIES = 500;

const allowed = new Map<string, { key: string; expires: number }>();

function prune(now: number) {
  for (const [id, entry] of allowed) {
    if (entry.expires > now) break; // insertion order ≈ expiry order: the rest are younger
    allowed.delete(id);
  }
  while (allowed.size > MAX_ENTRIES) {
    const oldest = allowed.keys().next();
    if (oldest.done) break;
    allowed.delete(oldest.value);
  }
}

/**
 * The session token on a request, read off the raw header.
 *
 * Only ever used as a cache key. The token that decides whether this request is allowed is
 * the one `getCurrentUser` reads, from the request scope, and verifies against the database —
 * a request that arrives with no readable cookie is not refused here, it simply misses the
 * memo and asks properly.
 */
function sessionTokenFrom(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === SESSION_COOKIE) {
      return decodeURIComponent(part.slice(eq + 1).trim()) || null;
    }
  }
  return null;
}

/**
 * The storage key of a book this request may read, or null.
 *
 * Null covers every refusal the route treats alike — signed out, expired, not a member,
 * no such book — because the route answers all of them with the same 404.
 */
export async function authorisedTextbookKey(
  request: Request,
  materialId: string,
): Promise<string | null> {
  const token = sessionTokenFrom(request.headers.get('cookie'));
  const id = token ? `${hashSessionToken(token)}:${materialId}` : null;
  const now = Date.now();

  if (id) {
    const hit = allowed.get(id);
    if (hit && hit.expires > now) return hit.key;
  }

  const user = await getCurrentUser();
  if (!user) return null;

  const key = await textbookKeyFor(user, materialId);
  // Refusals are not cached: the next request should ask again, and a student who has just
  // been added to a cohort should not have to wait out a timer to open their first book.
  if (!key) return null;

  if (id) {
    allowed.delete(id); // re-insert, so the map stays ordered by expiry
    allowed.set(id, { key, expires: now + TTL_MS });
    prune(now);
  }
  return key;
}
