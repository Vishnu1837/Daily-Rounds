import 'server-only';

import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm';

import { db } from '@/db/client';
import { cohortMembers, materials, textbookTopicProgress, textbookTopics } from '@/db/schema';
import type { SessionUser } from '@/lib/auth/session';

/**
 * The storage key of a hosted textbook, if — and only if — this user may read it.
 *
 * A student may read a book filed under a cohort they are an *active* member of. Membership
 * is managed by hand: a cohort lead who pauses or removes someone has revoked their library
 * in the same click, and because this runs on every range request rather than once when the
 * reader opens, a book already open stops loading new pages on the next scroll.
 *
 * An admin may read any hosted book. Checked against the real session by the caller, never
 * the "view as" one.
 *
 * One round trip, joined rather than going through `getMemberContext`: a reader turning
 * pages fires this several times a minute, and the calendar and point rules that context
 * builds have nothing to say about whether someone may see page 212.
 */
export async function textbookKeyFor(user: SessionUser, materialId: string) {
  if (user.role === 'admin') {
    const rows = await db
      .select({ key: materials.storageKey })
      .from(materials)
      .where(and(eq(materials.id, materialId), isNotNull(materials.storageKey)))
      .limit(1);
    return rows[0]?.key ?? null;
  }

  const rows = await db
    .select({ key: materials.storageKey })
    .from(materials)
    .innerJoin(
      cohortMembers,
      and(
        eq(cohortMembers.cohortId, materials.cohortId),
        eq(cohortMembers.userId, user.id),
        eq(cohortMembers.status, 'active'),
      ),
    )
    .where(and(eq(materials.id, materialId), isNotNull(materials.storageKey)))
    .limit(1);
  return rows[0]?.key ?? null;
}

/** The reader page's view of a hosted textbook in the student's own cohort. */
export async function getHostedTextbook(cohortId: string, materialId: string) {
  const rows = await db
    .select({ id: materials.id, title: materials.title, sizeBytes: materials.sizeBytes })
    .from(materials)
    .where(
      and(
        eq(materials.id, materialId),
        eq(materials.cohortId, cohortId),
        isNotNull(materials.storageKey),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export type BookTopic = {
  id: string;
  position: number;
  title: string;
  startPage: number;
  endPage: number;
  curriculumRef: string | null;
  studied: boolean;
};

/**
 * A hosted book's chapter list, with this student's own reading marked on it.
 *
 * Scoped by cohort in the same `where` that finds the book, so a student who guesses
 * another cohort's material id gets an empty list rather than its table of contents — a
 * chapter list is not the bytes, but "what is in the book" is still theirs, not ours to
 * hand out.
 *
 * Two round trips rather than a left join: the join would repeat every topic row for a
 * progress row that is at most one, and the set the page actually wants is the studied ids.
 */
export async function getBookTopics(
  cohortId: string,
  materialId: string,
  memberId: string,
): Promise<BookTopic[]> {
  const rows = await db
    .select({
      id: textbookTopics.id,
      position: textbookTopics.position,
      title: textbookTopics.title,
      startPage: textbookTopics.startPage,
      endPage: textbookTopics.endPage,
      curriculumRef: textbookTopics.curriculumRef,
    })
    .from(textbookTopics)
    .innerJoin(materials, eq(materials.id, textbookTopics.materialId))
    .where(and(eq(textbookTopics.materialId, materialId), eq(materials.cohortId, cohortId)))
    .orderBy(asc(textbookTopics.position));

  if (rows.length === 0) return [];

  const studied = await db
    .select({ topicId: textbookTopicProgress.topicId })
    .from(textbookTopicProgress)
    .where(
      and(
        eq(textbookTopicProgress.memberId, memberId),
        inArray(
          textbookTopicProgress.topicId,
          rows.map((r) => r.id),
        ),
      ),
    );
  const studiedIds = new Set(studied.map((r) => r.topicId));

  return rows.map((row) => ({ ...row, studied: studiedIds.has(row.id) }));
}

/**
 * One topic, for the topic reader — and the proof that this student may open it.
 *
 * The cohort join is the authorisation. A topic id is a uuid a student could only have got
 * from their own book page, but "could only have" is not a check, and this is the query
 * that decides which pages a reader is handed.
 */
export async function getTopicForReader(cohortId: string, topicId: string) {
  const rows = await db
    .select({
      id: textbookTopics.id,
      title: textbookTopics.title,
      position: textbookTopics.position,
      startPage: textbookTopics.startPage,
      endPage: textbookTopics.endPage,
      materialId: materials.id,
      bookTitle: materials.title,
    })
    .from(textbookTopics)
    .innerJoin(materials, eq(materials.id, textbookTopics.materialId))
    .where(
      and(
        eq(textbookTopics.id, topicId),
        eq(materials.cohortId, cohortId),
        isNotNull(materials.storageKey),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * The topic that owns a progress mark, if this member is entitled to make it.
 *
 * Used by the toggle action. Membership is re-derived from the topic's own cohort rather
 * than taken from the request, so a paused member's mark lands nowhere.
 */
export async function topicForMember(topicId: string, memberId: string) {
  const rows = await db
    .select({ id: textbookTopics.id, materialId: textbookTopics.materialId })
    .from(textbookTopics)
    .innerJoin(materials, eq(materials.id, textbookTopics.materialId))
    .innerJoin(
      cohortMembers,
      and(
        eq(cohortMembers.cohortId, materials.cohortId),
        eq(cohortMembers.id, memberId),
        eq(cohortMembers.status, 'active'),
      ),
    )
    .where(eq(textbookTopics.id, topicId))
    .limit(1);
  return rows[0] ?? null;
}

/** The chapter list as the admin editor loads it. Admin-only; no cohort scoping needed. */
export async function getTopicsForAdmin(materialId: string) {
  return db
    .select({
      id: textbookTopics.id,
      position: textbookTopics.position,
      title: textbookTopics.title,
      startPage: textbookTopics.startPage,
      endPage: textbookTopics.endPage,
      curriculumRef: textbookTopics.curriculumRef,
    })
    .from(textbookTopics)
    .where(eq(textbookTopics.materialId, materialId))
    .orderBy(asc(textbookTopics.position));
}

/**
 * Every chapter of every hosted book in a cohort, for the admin materials screen.
 *
 * One query rather than one per book: a cohort has a handful of textbooks, and the screen
 * needs each one's chapter count on the row and its full list the moment an editor opens.
 * Grouping a few hundred rows in memory beats a waterfall of round trips.
 */
export async function getCohortTextbookTopics(cohortId: string) {
  const rows = await db
    .select({
      materialId: textbookTopics.materialId,
      id: textbookTopics.id,
      position: textbookTopics.position,
      title: textbookTopics.title,
      startPage: textbookTopics.startPage,
      endPage: textbookTopics.endPage,
      curriculumRef: textbookTopics.curriculumRef,
    })
    .from(textbookTopics)
    .innerJoin(materials, eq(materials.id, textbookTopics.materialId))
    .where(eq(materials.cohortId, cohortId))
    .orderBy(asc(textbookTopics.materialId), asc(textbookTopics.position));

  const byMaterial = new Map<string, Omit<(typeof rows)[number], 'materialId'>[]>();
  for (const { materialId, ...topic } of rows) {
    const list = byMaterial.get(materialId) ?? [];
    list.push(topic);
    byMaterial.set(materialId, list);
  }
  return byMaterial;
}
