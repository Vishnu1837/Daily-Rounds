'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { db } from '@/db/client';
import { materials, textbookTopicProgress, textbookTopics } from '@/db/schema';
import { requireAdminAction, requireUserAction } from '@/lib/auth/guards';
import { validateTopicPlan } from '@/lib/domain/textbook-topics';
import { fieldErrors, textbookTopicsSchema } from '@/lib/validation';
import { invalidateCohortLibrary } from '@/server/cache';
import { getMemberContext } from '@/server/context';
import { topicForMember } from '@/server/queries/textbooks';

import { type Result, fail, guarded, ok, recordAudit } from './shared';

/**
 * Marks a chapter read, or takes the mark back.
 *
 * The member id is never accepted from the client. It is derived from the session, and the
 * topic is then re-checked against that member's own active cohort — so the two ways this
 * could go wrong (marking someone else's progress, and a paused member marking anything at
 * all) are the same check, made once, on the server.
 *
 * Idempotent in both directions: marking a studied topic studied is a no-op rather than a
 * duplicate row, because a double tap on a slow connection is a normal thing for a phone to
 * send and not something a student should see an error for.
 */
export async function setTopicStudiedAction(
  topicId: string,
  studied: boolean,
): Promise<Result<{ studied: boolean }>> {
  return guarded(async () => {
    const user = await requireUserAction();
    if (!z.string().uuid().safeParse(topicId).success) return fail('Unknown topic.');

    const ctx = await getMemberContext(user);
    if (!ctx) return fail('You are not in an active cohort yet.');

    const topic = await topicForMember(topicId, ctx.memberId);
    if (!topic) return fail('That chapter is not available to you.');

    if (studied) {
      await db
        .insert(textbookTopicProgress)
        .values({ memberId: ctx.memberId, topicId })
        .onConflictDoNothing();
    } else {
      await db
        .delete(textbookTopicProgress)
        .where(
          and(
            eq(textbookTopicProgress.memberId, ctx.memberId),
            eq(textbookTopicProgress.topicId, topicId),
          ),
        );
    }

    revalidatePath(`/materials/${topic.materialId}`);
    return ok({ studied });
  }, 'We could not save that. Please try again.');
}

/**
 * Replaces a book's whole chapter list.
 *
 * Whole-list rather than per-row, because a chapter list is edited as a document: an admin
 * pastes a generated mapping, nudges three boundaries and saves. Diffing that into inserts,
 * updates and deletes would buy nothing except a window in which positions collide with the
 * unique index they have to satisfy.
 *
 * Progress is the cost of that choice, and it is paid deliberately: deleting a topic row
 * cascades to every student's mark on it. So the replace is done inside a transaction, and
 * marks are carried across by position — a list re-saved with a corrected page boundary
 * keeps chapter 7 read, while a list genuinely reordered does not pretend to know better.
 */
export async function saveTextbookTopicsAction(input: {
  materialId: string;
  cohortId: string;
  topics: {
    position: number;
    title: string;
    startPage: number;
    endPage: number;
    curriculumRef?: string | null;
  }[];
  /** The book's real page count, read from the PDF by the editor. */
  numPages: number | null;
}): Promise<Result<{ saved: number }>> {
  return guarded(async () => {
    const user = await requireAdminAction();

    const parsed = textbookTopicsSchema.safeParse(input);
    if (!parsed.success) return fail('Check the highlighted fields.', fieldErrors(parsed.error));
    const { materialId, cohortId, topics } = parsed.data;

    const problems = topics.length > 0 ? validateTopicPlan(topics, input.numPages ?? null) : [];
    if (problems.length > 0) return fail(problems[0]!, { topics: problems.join('\n') });

    const [book] = await db
      .select({ id: materials.id, storageKey: materials.storageKey })
      .from(materials)
      .where(and(eq(materials.id, materialId), eq(materials.cohortId, cohortId)))
      .limit(1);
    if (!book) return fail('That material no longer exists.');
    if (!book.storageKey) return fail('Only a hosted textbook can have chapters.');

    await db.transaction(async (tx) => {
      // Which positions were read, by whom, before the list is torn down.
      const carried = await tx
        .select({
          memberId: textbookTopicProgress.memberId,
          position: textbookTopics.position,
          studiedAt: textbookTopicProgress.studiedAt,
        })
        .from(textbookTopicProgress)
        .innerJoin(textbookTopics, eq(textbookTopics.id, textbookTopicProgress.topicId))
        .where(eq(textbookTopics.materialId, materialId));

      await tx.delete(textbookTopics).where(eq(textbookTopics.materialId, materialId));

      if (topics.length === 0) return;

      const inserted = await tx
        .insert(textbookTopics)
        .values(
          topics.map((t) => ({
            materialId,
            position: t.position,
            title: t.title,
            startPage: t.startPage,
            endPage: t.endPage,
            curriculumRef: t.curriculumRef ?? null,
          })),
        )
        .returning({ id: textbookTopics.id, position: textbookTopics.position });

      const idByPosition = new Map(inserted.map((row) => [row.position, row.id]));
      const restored = carried
        .map((row) => {
          const topicId = idByPosition.get(row.position);
          return topicId ? { memberId: row.memberId, topicId, studiedAt: row.studiedAt } : null;
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);

      if (restored.length > 0) {
        await tx.insert(textbookTopicProgress).values(restored).onConflictDoNothing();
      }
    });

    await recordAudit({
      actorUserId: user.id,
      action: 'textbook.topics.save',
      entity: 'material',
      entityId: materialId,
      payload: { topics: topics.length },
    });

    invalidateCohortLibrary(cohortId);
    revalidatePath('/admin/materials');
    revalidatePath(`/materials/${materialId}`);
    return ok({ saved: topics.length });
  }, 'We could not save those chapters. Please try again.');
}
