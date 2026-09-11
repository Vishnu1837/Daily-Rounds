import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { SESSION_COOKIE, type SessionUser } from '@/lib/auth/session';

/**
 * Hosted textbooks, against a real database and the local storage driver.
 *
 * The promise being tested is the one made to the cohort lead: a book is readable by an
 * active member of its cohort and by nobody else — not a paused or removed member, not a
 * student of another cohort, not a signed-out visitor, and not a browser tab pointed straight
 * at the file. Membership is managed by hand, so "removed" has to mean "locked out" on the
 * very next request.
 */

const session: { user: SessionUser | null } = { user: null };
vi.mock('@/lib/auth/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/session')>();
  return { ...actual, getCurrentUser: async () => session.user };
});

import { GET } from '@/app/api/textbooks/[materialId]/route';
import { TEXTBOOK_READER_HEADER } from '@/lib/domain/textbooks';
import { textbookKeyFor } from '@/server/queries/textbooks';
import { deleteObject, newTextbookKey, writeLocalObject } from '@/server/textbook-storage';

import { createTestCohort, createTestMember, db, schema } from './helpers/db';

const PDF = new TextEncoder().encode('%PDF-1.4\n' + 'x'.repeat(4000) + '\n%%EOF\n');

let cohortId: string;
let bookId: string;
let key: string;

function asUser(user: { id: string; email: string; fullName: string; role: 'student' | 'admin' }) {
  return { ...user, timezone: 'Asia/Kolkata' } as SessionUser;
}

function read(materialId: string, headers: Record<string, string> = {}) {
  return GET(new Request(`http://test/api/textbooks/${materialId}`, { headers }), {
    params: Promise.resolve({ materialId }),
  });
}

beforeAll(async () => {
  const { cohort } = await createTestCohort();
  cohortId = cohort.id;
  key = newTextbookKey(cohortId);
  await writeLocalObject(
    key,
    new ReadableStream({
      start(controller) {
        controller.enqueue(PDF);
        controller.close();
      },
    }),
  );
  const [book] = await db
    .insert(schema.materials)
    .values({ cohortId, title: 'Atlas', type: 'textbook', storageKey: key, sizeBytes: PDF.length })
    .returning();
  bookId = book!.id;
});

afterAll(async () => {
  await deleteObject(key);
});

describe('who may read a hosted textbook', () => {
  it('an active member of the cohort', async () => {
    const { user } = await createTestMember(cohortId);
    expect(await textbookKeyFor(asUser(user), bookId)).toBe(key);
  });

  it('not a member who has been paused or removed', async () => {
    for (const status of ['paused', 'left'] as const) {
      const { user, memberId } = await createTestMember(cohortId);
      await db
        .update(schema.cohortMembers)
        .set({ status })
        .where(eq(schema.cohortMembers.id, memberId));
      expect(await textbookKeyFor(asUser(user), bookId)).toBeNull();
    }
  });

  it('not a student of another cohort', async () => {
    const { cohort: other } = await createTestCohort();
    const { user } = await createTestMember(other.id);
    expect(await textbookKeyFor(asUser(user), bookId)).toBeNull();
  });

  it('an admin, whatever their memberships', async () => {
    const { cohort: other } = await createTestCohort();
    const { user } = await createTestMember(other.id, { role: 'admin' });
    expect(await textbookKeyFor(asUser(user), bookId)).toBe(key);
  });

  it('never a link material, which has no file behind it', async () => {
    const { user } = await createTestMember(cohortId);
    const [link] = await db
      .insert(schema.materials)
      .values({ cohortId, title: 'Video', type: 'video', url: 'https://example.com' })
      .returning();
    expect(await textbookKeyFor(asUser(user), link!.id)).toBeNull();
  });
});

describe('the textbook route', () => {
  it('serves byte ranges to the reader', async () => {
    const { user } = await createTestMember(cohortId);
    session.user = asUser(user);

    const res = await read(bookId, { [TEXTBOOK_READER_HEADER]: '1', range: 'bytes=0-4' });
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe(`bytes 0-4/${PDF.length}`);
    expect(res.headers.get('accept-ranges')).toBe('bytes');
    expect(res.headers.get('cache-control')).toContain('no-store');
    expect(await res.text()).toBe('%PDF-');
  });

  it('refuses a browser tab opened straight at the file', async () => {
    const { user } = await createTestMember(cohortId);
    session.user = asUser(user);
    expect((await read(bookId)).status).toBe(404);
  });

  it('refuses a signed-out visitor and a removed member alike', async () => {
    session.user = null;
    expect((await read(bookId, { [TEXTBOOK_READER_HEADER]: '1' })).status).toBe(404);

    const { user, memberId } = await createTestMember(cohortId);
    session.user = asUser(user);
    expect((await read(bookId, { [TEXTBOOK_READER_HEADER]: '1' })).status).toBe(200);

    await db
      .update(schema.cohortMembers)
      .set({ status: 'left' })
      .where(eq(schema.cohortMembers.id, memberId));
    expect((await read(bookId, { [TEXTBOOK_READER_HEADER]: '1' })).status).toBe(404);
  });

  /*
   * A reader makes one request per byte range, so the allowed answer is memoised per session
   * token for half a minute (see `authorisedTextbookKey`). That memo is a cache of a *yes*,
   * and only of a yes: this pins both halves, because the day it starts remembering a no is
   * the day a student who has just been added to a cohort cannot open their first book.
   */
  it('remembers an allowed session briefly, and never remembers a refusal', async () => {
    const { user } = await createTestMember(cohortId);
    const cookie = { cookie: `${SESSION_COOKIE}=range-memo-token` };
    const reader = { [TEXTBOOK_READER_HEADER]: '1', ...cookie };

    session.user = null;
    expect((await read(bookId, reader)).status).toBe(404);

    // The refusal above was not cached under this token: the yes is found on the next ask.
    session.user = asUser(user);
    expect((await read(bookId, reader)).status).toBe(200);

    // And now it is remembered — this range is served without the session being consulted.
    session.user = null;
    expect((await read(bookId, reader)).status).toBe(200);

    // The memo is per token, so another browser's request is still checked from scratch.
    const other = { [TEXTBOOK_READER_HEADER]: '1', cookie: `${SESSION_COOKIE}=another-token` };
    expect((await read(bookId, other)).status).toBe(404);
  });
});

describe('the materials table', () => {
  it('holds a link or a file, never both and never neither', async () => {
    const base = { cohortId, title: 'Broken', type: 'textbook' as const };
    await expect(
      db.insert(schema.materials).values({ ...base, url: 'https://x.test', storageKey: key }),
    ).rejects.toThrow();
    await expect(db.insert(schema.materials).values(base)).rejects.toThrow();
  });
});
