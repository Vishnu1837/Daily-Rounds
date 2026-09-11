'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { db } from '@/db/client';
import { materials, textbookChapterDrafts } from '@/db/schema';
import { requireAdminAction } from '@/lib/auth/guards';
import { chaptersFromOutline } from '@/lib/domain/chapter-plan';
import { validateTopicPlan } from '@/lib/domain/textbook-topics';
import { bookDigestSchema, textbookTopicsSchema } from '@/lib/validation';
import { proposeChapters } from '@/server/gemini';

import { type Result, fail, guarded, ok, recordAudit } from './shared';

/**
 * Generating a chapter list, keeping it as a draft, and letting a person disagree with it.
 *
 * The whole point of this file is the gap between "a model proposed chapters" and "students
 * are reading chapters". Nothing here writes to `textbook_topics`; publishing is a separate,
 * deliberate act that goes through `saveTextbookTopicsAction` with the same validation a
 * hand-typed list gets. A draft can be regenerated, edited, ignored for a week, or thrown
 * away, and in none of those cases does a student see a chapter that nobody read first.
 */

/** Where the book came from and whether the caller may touch it. */
async function adminBook(materialId: string, cohortId: string) {
  if (!z.string().uuid().safeParse(materialId).success) return null;
  if (!z.string().uuid().safeParse(cohortId).success) return null;
  const rows = await db
    .select({ id: materials.id, title: materials.title, storageKey: materials.storageKey })
    .from(materials)
    .where(and(eq(materials.id, materialId), eq(materials.cohortId, cohortId)))
    .limit(1);
  const book = rows[0];
  return book?.storageKey ? book : null;
}

export type DraftPlan = {
  topics: {
    position: number;
    title: string;
    startPage: number;
    endPage: number;
    curriculumRef: string | null;
  }[];
  notes: string[];
  model: string | null;
  source: string;
};

/**
 * Reads the book the admin's browser just summarised and proposes chapters for it.
 *
 * The digest arrives from the client, which is the only place that has the PDF open — so it
 * is treated as what it is: untrusted, bounded by `bookDigestSchema`, and never allowed to
 * decide anything on its own. Its page count is checked against nothing here because the
 * proposal it produces is checked against the real book before it can be published.
 *
 * Falls back to the PDF's own bookmarks when there is no API key, or when Gemini cannot
 * answer. A book whose publisher shipped an outline does not need a model at all, and an
 * admin with no key should still get a first draft rather than an empty table.
 */
export async function generateChapterDraftAction(input: {
  materialId: string;
  cohortId: string;
  digest: unknown;
}): Promise<Result<DraftPlan>> {
  return guarded(async () => {
    const user = await requireAdminAction();

    const book = await adminBook(input.materialId, input.cohortId);
    if (!book) return fail('That book is not one this cohort hosts.');

    const parsed = bookDigestSchema.safeParse(input.digest);
    if (!parsed.success) return fail('The book summary could not be read. Reopen and try again.');
    const digest = parsed.data;

    const proposal = await proposeChapters(book.title, digest);

    if (!proposal.ok) {
      /*
       * A failed model call is not a dead end while the PDF has bookmarks: the outline is a
       * real chapter list written by the publisher, and offering it with the reason the
       * model did not answer beats making an admin type the same thing by hand.
       */
      const fromOutline = chaptersFromOutline(digest.outline, digest.numPages);
      if (fromOutline.length < 2) return fail(proposal.message);

      const saved = await storeDraft(input.materialId, {
        topics: fromOutline,
        notes: [`${proposal.message} These chapters came from the PDF's own bookmarks instead.`],
        model: null,
        source: 'outline',
      });
      revalidatePath('/admin/materials');
      return ok(saved);
    }

    const saved = await storeDraft(input.materialId, {
      topics: proposal.plan.topics,
      notes: proposal.plan.notes,
      model: proposal.model,
      source: 'gemini',
    });

    await recordAudit({
      actorUserId: user.id,
      action: 'textbook.chapters.generate',
      entity: 'material',
      entityId: input.materialId,
      payload: { chapters: saved.topics.length, model: proposal.model },
    });

    revalidatePath('/admin/materials');
    return ok(saved);
  }, 'We could not generate chapters for that book. Please try again.');
}

/**
 * Keeps an edited draft without publishing it.
 *
 * Saved loosely on purpose: a half-corrected draft with one impossible page range is exactly
 * the state an admin wants to come back to after lunch. The strict check is `validateTopicPlan`
 * at publish, where it decides what students see.
 */
export async function saveChapterDraftAction(input: {
  materialId: string;
  cohortId: string;
  topics: DraftPlan['topics'];
  notes?: string[];
}): Promise<Result<{ saved: number }>> {
  return guarded(async () => {
    await requireAdminAction();
    const book = await adminBook(input.materialId, input.cohortId);
    if (!book) return fail('That book is not one this cohort hosts.');

    const [existing] = await db
      .select({ model: textbookChapterDrafts.model, source: textbookChapterDrafts.source })
      .from(textbookChapterDrafts)
      .where(eq(textbookChapterDrafts.materialId, input.materialId))
      .limit(1);

    const saved = await storeDraft(input.materialId, {
      topics: input.topics.slice(0, 400),
      notes: input.notes ?? [],
      model: existing?.model ?? null,
      source: existing?.source ?? 'manual',
    });
    revalidatePath('/admin/materials');
    return ok({ saved: saved.topics.length });
  }, 'We could not save that draft. Please try again.');
}

/** Throws the proposal away. The published chapter list, if there is one, is untouched. */
export async function discardChapterDraftAction(input: {
  materialId: string;
  cohortId: string;
}): Promise<Result> {
  return guarded(async () => {
    await requireAdminAction();
    const book = await adminBook(input.materialId, input.cohortId);
    if (!book) return fail('That book is not one this cohort hosts.');

    await db
      .delete(textbookChapterDrafts)
      .where(eq(textbookChapterDrafts.materialId, input.materialId));
    revalidatePath('/admin/materials');
    return ok();
  }, 'We could not discard that draft. Please try again.');
}

/**
 * Checks a draft against the real book without publishing anything.
 *
 * The editor runs the same check in the browser; this exists so the admin screen can say
 * "ready to publish" from the server's own answer rather than the client's, and so the
 * publish button is never the first place a problem is mentioned.
 */
export async function checkChapterDraftAction(input: {
  topics: DraftPlan['topics'];
  numPages: number | null;
}): Promise<Result<{ problems: string[] }>> {
  return guarded(async () => {
    await requireAdminAction();
    const parsed = textbookTopicsSchema.shape.topics.safeParse(input.topics);
    if (!parsed.success) return ok({ problems: ['Some rows are not filled in yet.'] });
    return ok({ problems: validateTopicPlan(parsed.data, input.numPages) });
  }, 'We could not check that draft.');
}

/* ------------------------------------------------------------------ pieces */

async function storeDraft(materialId: string, plan: DraftPlan): Promise<DraftPlan> {
  const row = {
    plan: plan.topics,
    model: plan.model,
    source: plan.source,
    note: plan.notes.join('\n') || null,
    updatedAt: new Date(),
  };
  await db
    .insert(textbookChapterDrafts)
    .values({ materialId, ...row })
    .onConflictDoUpdate({ target: textbookChapterDrafts.materialId, set: row });
  return plan;
}
