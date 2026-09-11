import { and, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { SessionUser } from '@/lib/auth/session';

import { createTestCohort, createTestMember, db, schema } from './helpers/db';

/**
 * Chapters of a hosted textbook, against a real database.
 *
 * The access promise for a book is already covered in `textbooks.integration.test.ts`: the
 * bytes go only to an active member of the cohort. Chapters add two more surfaces that have
 * to keep the same promise, and neither is protected by the byte route:
 *
 *   1. The *chapter list* — what is in the book — must not leak to another cohort. It is
 *      not the content, but it is not ours to hand out either.
 *   2. The *progress writes*. A student marking a chapter read is the one place a student
 *      writes to a shared table, so it must be impossible to mark someone else's progress,
 *      to mark a chapter of a book you cannot read, or to mark anything at all once you
 *      have been paused.
 *
 * Everything here goes through the real query and the real server action, because a test
 * that reimplemented the cohort join would be testing itself.
 */

const state: { user: SessionUser | null } = { user: null };

vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: async () => state.user,
  SESSION_COOKIE: 'dr_session',
}));

vi.mock('next/cache', () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
  updateTag: () => {},
  cacheTag: () => {},
  cacheLife: () => {},
}));

import { saveTextbookTopicsAction, setTopicStudiedAction } from '@/server/actions/textbooks';
import { getBookTopics, getTopicForReader } from '@/server/queries/textbooks';

type Member = { user: SessionUser; memberId: string };

let cohortId: string;
let otherCohortId: string;
let bookId: string;
let otherBookId: string;
let topicIds: string[];

let active: Member;
let paused: Member;
let outsider: Member;
let admin: SessionUser;

const PLAN = [
  { position: 1, title: 'Introduction Upper Limb', startPage: 1, endPage: 4 },
  { position: 2, title: 'Bones', startPage: 5, endPage: 30 },
  { position: 3, title: 'Pectoral Region', startPage: 30, endPage: 48 },
];

async function makeMember(cohort: string, role: 'student' | 'admin' = 'student'): Promise<Member> {
  const { user, memberId } = await createTestMember(cohort, { role });
  return { user: { ...user, timezone: 'Asia/Kolkata' } as SessionUser, memberId };
}

async function hostedBook(cohort: string, title: string) {
  const [row] = await db
    .insert(schema.materials)
    .values({
      cohortId: cohort,
      title,
      type: 'textbook',
      storageKey: `textbooks/${cohort}/${title}.pdf`,
      sizeBytes: 4096,
    })
    .returning();
  return row!.id;
}

beforeAll(async () => {
  const { cohort } = await createTestCohort();
  const { cohort: other } = await createTestCohort();
  cohortId = cohort.id;
  otherCohortId = other.id;

  bookId = await hostedBook(cohortId, 'Atlas');
  otherBookId = await hostedBook(otherCohortId, 'Other Atlas');

  active = await makeMember(cohortId);
  paused = await makeMember(cohortId);
  outsider = await makeMember(otherCohortId);
  admin = (await makeMember(cohortId, 'admin')).user;

  await db
    .update(schema.cohortMembers)
    .set({ status: 'paused' })
    .where(eq(schema.cohortMembers.id, paused.memberId));

  const rows = await db
    .insert(schema.textbookTopics)
    .values(PLAN.map((t) => ({ ...t, materialId: bookId })))
    .returning({ id: schema.textbookTopics.id, position: schema.textbookTopics.position });
  topicIds = rows.sort((a, b) => a.position - b.position).map((r) => r.id);
});

describe('the chapter list', () => {
  it('is visible to a member of the cohort, in reading order', async () => {
    const topics = await getBookTopics(cohortId, bookId, active.memberId);
    expect(topics.map((t) => t.title)).toEqual([
      'Introduction Upper Limb',
      'Bones',
      'Pectoral Region',
    ]);
    expect(topics.every((t) => !t.studied)).toBe(true);
  });

  it('is empty for a student of another cohort, even with the right material id', async () => {
    expect(await getBookTopics(otherCohortId, bookId, outsider.memberId)).toEqual([]);
  });

  it('is empty for a book that has not been split', async () => {
    expect(await getBookTopics(otherCohortId, otherBookId, outsider.memberId)).toEqual([]);
  });

  it('carries page ranges as stored, boundary sharing included', async () => {
    const topics = await getBookTopics(cohortId, bookId, active.memberId);
    expect(topics[1]).toMatchObject({ startPage: 5, endPage: 30 });
    expect(topics[2]).toMatchObject({ startPage: 30, endPage: 48 });
  });
});

describe('opening one chapter', () => {
  it('resolves for a member of its cohort', async () => {
    const topic = await getTopicForReader(cohortId, topicIds[1]!);
    expect(topic).toMatchObject({ title: 'Bones', startPage: 5, endPage: 30, materialId: bookId });
  });

  it('does not resolve for another cohort', async () => {
    expect(await getTopicForReader(otherCohortId, topicIds[1]!)).toBeNull();
  });
});

describe('marking a chapter studied', () => {
  it('records the mark for the student who made it, and nobody else', async () => {
    state.user = active.user;
    const result = await setTopicStudiedAction(topicIds[0]!, true);
    expect(result.ok).toBe(true);

    const mine = await getBookTopics(cohortId, bookId, active.memberId);
    expect(mine[0]!.studied).toBe(true);
    expect(mine[1]!.studied).toBe(false);

    // A different student in the same cohort sees an untouched book.
    const second = await makeMember(cohortId);
    const theirs = await getBookTopics(cohortId, bookId, second.memberId);
    expect(theirs.every((t) => !t.studied)).toBe(true);
  });

  it('is a toggle: unmarking removes the row', async () => {
    state.user = active.user;
    await setTopicStudiedAction(topicIds[1]!, true);
    await setTopicStudiedAction(topicIds[1]!, false);

    const rows = await db
      .select()
      .from(schema.textbookTopicProgress)
      .where(
        and(
          eq(schema.textbookTopicProgress.memberId, active.memberId),
          eq(schema.textbookTopicProgress.topicId, topicIds[1]!),
        ),
      );
    expect(rows).toHaveLength(0);
  });

  it('is idempotent — a double tap does not write twice', async () => {
    state.user = active.user;
    await setTopicStudiedAction(topicIds[2]!, true);
    const again = await setTopicStudiedAction(topicIds[2]!, true);
    expect(again.ok).toBe(true);

    const rows = await db
      .select()
      .from(schema.textbookTopicProgress)
      .where(
        and(
          eq(schema.textbookTopicProgress.memberId, active.memberId),
          eq(schema.textbookTopicProgress.topicId, topicIds[2]!),
        ),
      );
    expect(rows).toHaveLength(1);
  });

  it('is refused for a paused member', async () => {
    state.user = paused.user;
    const result = await setTopicStudiedAction(topicIds[0]!, true);
    expect(result.ok).toBe(false);

    const rows = await db
      .select()
      .from(schema.textbookTopicProgress)
      .where(eq(schema.textbookTopicProgress.memberId, paused.memberId));
    expect(rows).toHaveLength(0);
  });

  it("is refused for another cohort's student", async () => {
    state.user = outsider.user;
    const result = await setTopicStudiedAction(topicIds[0]!, true);
    expect(result.ok).toBe(false);

    const rows = await db
      .select()
      .from(schema.textbookTopicProgress)
      .where(eq(schema.textbookTopicProgress.memberId, outsider.memberId));
    expect(rows).toHaveLength(0);
  });

  it('is refused when signed out', async () => {
    state.user = null;
    expect((await setTopicStudiedAction(topicIds[0]!, true)).ok).toBe(false);
  });
});

describe('saving a chapter list', () => {
  it('is refused for a student', async () => {
    state.user = active.user;
    const result = await saveTextbookTopicsAction({
      materialId: bookId,
      cohortId,
      topics: PLAN,
      numPages: 100,
    });
    expect(result.ok).toBe(false);
  });

  it('rejects a plan that runs past the end of the book', async () => {
    state.user = admin;
    const result = await saveTextbookTopicsAction({
      materialId: bookId,
      cohortId,
      topics: [{ position: 1, title: 'Too long', startPage: 1, endPage: 900 }],
      numPages: 48,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('the book has 48 pages');
  });

  it('keeps a student’s marks when a boundary is corrected', async () => {
    state.user = active.user;
    await setTopicStudiedAction(topicIds[0]!, true);

    state.user = admin;
    const corrected = PLAN.map((t) => (t.position === 2 ? { ...t, endPage: 29 } : t));
    const result = await saveTextbookTopicsAction({
      materialId: bookId,
      cohortId,
      topics: corrected,
      numPages: 100,
    });
    expect(result.ok).toBe(true);

    const topics = await getBookTopics(cohortId, bookId, active.memberId);
    expect(topics).toHaveLength(3);
    expect(topics[1]!.endPage).toBe(29);
    // Chapter 1 is still read, even though every row was replaced.
    expect(topics[0]!.studied).toBe(true);
  });

  it('clears the list when saved empty, and takes the marks with it', async () => {
    state.user = admin;
    const result = await saveTextbookTopicsAction({
      materialId: bookId,
      cohortId,
      topics: [],
      numPages: 100,
    });
    expect(result.ok).toBe(true);
    expect(await getBookTopics(cohortId, bookId, active.memberId)).toEqual([]);

    const orphans = await db.select().from(schema.textbookTopicProgress);
    expect(orphans).toHaveLength(0);
  });
});
