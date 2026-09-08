'use server';

import { eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { db } from '@/db/client';
import { feedbackAttachments, feedbackPromptDismissals, feedbackSubmissions } from '@/db/schema';
import { requireAdminAction, requireUserAction } from '@/lib/auth/guards';
import {
  FEEDBACK_ATTACHMENT_MAX_BYTES,
  FEEDBACK_MAX_ATTACHMENTS,
  formatBytes,
  isFeedbackImageType,
} from '@/lib/domain/feedback';
import { feedbackSubmissionSchema } from '@/lib/validation';
import { getMemberContext } from '@/server/context';

import { type Result, fail, guarded, ok, recordAudit } from './shared';

/* ------------------------------------------------------------ student side */

/**
 * The screenshots on one submission, checked before a single byte is stored.
 *
 * Every rule here is also enforced in the browser, and every one of them has to be repeated
 * on this side anyway: a server action is an ordinary HTTP endpoint, and the client that
 * shrank the image to 1600px and refused the fourth file is not the only client that can
 * reach it. What the browser work buys is that an honest student never *sees* these errors —
 * by the time a picture arrives here it has already been re-encoded down to a few hundred
 * kilobytes. These are the backstop, not the mechanism.
 */
async function readAttachments(
  files: File[],
): Promise<
  { ok: true; files: { mimeType: string; bytes: Uint8Array }[] } | { ok: false; message: string }
> {
  if (files.length > FEEDBACK_MAX_ATTACHMENTS) {
    return { ok: false, message: `Please attach at most ${FEEDBACK_MAX_ATTACHMENTS} screenshots.` };
  }

  const out: { mimeType: string; bytes: Uint8Array }[] = [];
  for (const file of files) {
    if (file.size === 0) continue;
    if (!isFeedbackImageType(file.type)) {
      return { ok: false, message: 'Screenshots must be PNG, JPEG or WebP images.' };
    }
    if (file.size > FEEDBACK_ATTACHMENT_MAX_BYTES) {
      return {
        ok: false,
        message: `Each screenshot must be under ${formatBytes(FEEDBACK_ATTACHMENT_MAX_BYTES)}.`,
      };
    }
    out.push({ mimeType: file.type, bytes: new Uint8Array(await file.arrayBuffer()) });
  }

  return { ok: true, files: out };
}

/**
 * A student's answer to the feedback round.
 *
 * Written as one transaction with its screenshots, so a report can never exist with half its
 * evidence — and so the "have you answered" check that clears the notification bell can
 * never see a row whose images are still arriving.
 *
 * Deliberately not idempotent and deliberately not restricted to one per student. Someone
 * who hits two separate bugs on two separate days should be able to tell us about the second
 * one, and the prompt disappearing after the first answer is a UI decision, not a data rule.
 */
export async function submitFeedbackAction(formData: FormData): Promise<Result> {
  return guarded(async () => {
    const user = await requireUserAction();
    const ctx = await getMemberContext(user);

    const parsed = feedbackSubmissionSchema.safeParse({
      promptKey: formData.get('promptKey'),
      issues: formData.get('issues') ?? '',
      suggestions: formData.get('suggestions') ?? '',
    });

    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.') || 'form';
        if (!(key in errors)) errors[key] = issue.message;
      }
      return fail(errors.issues ?? 'Check the highlighted fields.', errors);
    }

    const images = await readAttachments(
      formData.getAll('screenshots').filter((v): v is File => v instanceof File),
    );
    if (!images.ok) return fail(images.message);

    await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(feedbackSubmissions)
        .values({
          cohortId: ctx?.cohort.id ?? null,
          memberId: ctx?.memberId ?? null,
          userId: user.id,
          promptKey: parsed.data.promptKey,
          issues: parsed.data.issues,
          suggestions: parsed.data.suggestions,
        })
        .returning({ id: feedbackSubmissions.id });

      if (images.files.length === 0) return;

      await tx.insert(feedbackAttachments).values(
        images.files.map((file) => ({
          submissionId: row!.id,
          mimeType: file.mimeType,
          byteSize: file.bytes.byteLength,
          data: file.bytes,
        })),
      );
    });

    /*
     * The bell is in the header of every screen, so an answer has to clear it everywhere at
     * once — revalidating only the page the student happened to be on would leave the dot
     * showing on every other tab until they navigated twice.
     */
    revalidatePath('/', 'layout');
    return ok();
  }, 'We could not send that just now. Your words are still in the box — please try again.');
}

/**
 * "Not now."
 *
 * Records that the modal has been seen so it stops opening by itself, and nothing else. The
 * request itself stays in the notification bell, which is the whole point of the two states
 * being separate: closing a popup is a statement about this moment, not about whether the
 * student has anything to tell us.
 */
export async function dismissFeedbackPromptAction(promptKey: string): Promise<Result> {
  return guarded(async () => {
    const user = await requireUserAction();
    const ctx = await getMemberContext(user);
    // An admin browsing the student app has no membership to record a dismissal against.
    // Nothing to store and nothing to fail: the popup is closed either way.
    if (!ctx) return ok();

    await db
      .insert(feedbackPromptDismissals)
      .values({ memberId: ctx.memberId, promptKey: promptKey.slice(0, 60) })
      .onConflictDoNothing();

    return ok();
  }, 'We could not save that. It is safe to dismiss again.');
}

/* -------------------------------------------------------------- admin side */

/**
 * Marks a report dealt with, or puts it back on the pile.
 *
 * Resolving is not deleting, and keeping the two apart is what makes deleting safe to offer:
 * a cohort lead who has fixed a bug has an obvious, reversible thing to click, so the
 * irreversible one is reserved for reports that genuinely should not be kept.
 */
export async function setFeedbackResolvedAction(
  feedbackId: string,
  resolved: boolean,
): Promise<Result> {
  return guarded(async () => {
    const user = await requireAdminAction();

    const updated = await db
      .update(feedbackSubmissions)
      .set({
        resolvedAt: resolved ? new Date() : null,
        resolvedBy: resolved ? user.id : null,
      })
      .where(eq(feedbackSubmissions.id, feedbackId))
      .returning({ id: feedbackSubmissions.id });

    if (updated.length === 0) return fail('That report no longer exists.');

    await recordAudit({
      actorUserId: user.id,
      action: resolved ? 'feedback.resolve' : 'feedback.reopen',
      entity: 'feedback_submission',
      entityId: feedbackId,
    });

    revalidatePath('/admin/feedback');
    return ok();
  }, 'We could not update that report. Please try again.');
}

/**
 * Drops the screenshots and keeps the words.
 *
 * The reason this exists as its own action rather than as a side effect of resolving: images
 * are the only part of a report that costs meaningful storage, and the moment they stop
 * earning it is when the bug is fixed — but the description of the bug is worth keeping long
 * after that, because the next report that looks like it is usually the same bug coming
 * back. Freeing the space should not mean losing the record.
 */
export async function clearFeedbackAttachmentsAction(
  feedbackId: string,
): Promise<Result<{ freedBytes: number; count: number }>> {
  return guarded(async () => {
    const user = await requireAdminAction();

    const removed = await db
      .delete(feedbackAttachments)
      .where(eq(feedbackAttachments.submissionId, feedbackId))
      .returning({ id: feedbackAttachments.id, byteSize: feedbackAttachments.byteSize });

    if (removed.length === 0) return fail('That report has no screenshots left to remove.');

    const freedBytes = removed.reduce((sum, row) => sum + row.byteSize, 0);

    await recordAudit({
      actorUserId: user.id,
      action: 'feedback.clear_attachments',
      entity: 'feedback_submission',
      entityId: feedbackId,
      payload: { count: removed.length, freedBytes },
    });

    revalidatePath('/admin/feedback');
    return ok({ freedBytes, count: removed.length });
  }, 'We could not remove those screenshots. Please try again.');
}

/**
 * Removes a report and its screenshots for good.
 *
 * A real delete rather than a third state. The audit entry keeps who did it and roughly what
 * was in it, so a report that turns out to have mattered can at least be traced back to a
 * person and a date — but the words and the images are gone, which is what an admin asking
 * for this actually wants.
 */
export async function deleteFeedbackAction(feedbackId: string): Promise<Result> {
  return guarded(async () => {
    const user = await requireAdminAction();

    // The attachments go with it: the foreign key cascades, so the bytes cannot be orphaned
    // by this path.
    const deleted = await db
      .delete(feedbackSubmissions)
      .where(eq(feedbackSubmissions.id, feedbackId))
      .returning({
        id: feedbackSubmissions.id,
        userId: feedbackSubmissions.userId,
        createdAt: feedbackSubmissions.createdAt,
      });

    if (deleted.length === 0) return fail('That report no longer exists.');

    await recordAudit({
      actorUserId: user.id,
      action: 'feedback.delete',
      entity: 'feedback_submission',
      entityId: feedbackId,
      payload: {
        authorUserId: deleted[0]!.userId,
        submittedAt: deleted[0]!.createdAt.toISOString(),
      },
    });

    revalidatePath('/admin/feedback');
    return ok();
  }, 'We could not delete that report. Please try again.');
}

/**
 * Clears the screenshots from every report already marked resolved.
 *
 * The bulk version of the same judgement, for the case this whole feature creates: a survey
 * goes out, two hundred students answer over a fortnight, the bugs get fixed one by one, and
 * nobody wants to click through two hundred rows to reclaim the space. Resolved reports only
 * — an unresolved one still needs its evidence.
 */
export async function clearResolvedFeedbackImagesAction(): Promise<
  Result<{ freedBytes: number; count: number }>
> {
  return guarded(async () => {
    const user = await requireAdminAction();

    const removed = await db
      .delete(feedbackAttachments)
      .where(
        sql`${feedbackAttachments.submissionId} IN (
          SELECT ${feedbackSubmissions.id} FROM ${feedbackSubmissions}
          WHERE ${feedbackSubmissions.resolvedAt} IS NOT NULL
        )`,
      )
      .returning({ byteSize: feedbackAttachments.byteSize });

    if (removed.length === 0) {
      return fail('No resolved report is still holding screenshots.');
    }

    const freedBytes = removed.reduce((sum, row) => sum + row.byteSize, 0);

    await recordAudit({
      actorUserId: user.id,
      action: 'feedback.clear_resolved_images',
      entity: 'feedback_submission',
      payload: { count: removed.length, freedBytes },
    });

    revalidatePath('/admin/feedback');
    return ok({ freedBytes, count: removed.length });
  }, 'We could not free that storage. Please try again.');
}

/**
 * How much space the screenshots are taking, and how much of it is on resolved reports.
 *
 * Read on demand from the console rather than shipped with every page of the list, because
 * it is a `sum()` over a table whose rows are megabytes and the answer only matters at the
 * moment somebody is deciding whether to tidy up.
 */
export async function feedbackStorageAction(): Promise<
  Result<{ totalBytes: number; reclaimableBytes: number }>
> {
  return guarded(async () => {
    await requireAdminAction();

    const [row] = await db
      .select({
        totalBytes: sql<number>`COALESCE(SUM(${feedbackAttachments.byteSize}), 0)::int`,
        reclaimableBytes: sql<number>`COALESCE(SUM(${feedbackAttachments.byteSize}) FILTER (
          WHERE ${feedbackSubmissions.resolvedAt} IS NOT NULL
        ), 0)::int`,
      })
      .from(feedbackAttachments)
      .leftJoin(feedbackSubmissions, eq(feedbackSubmissions.id, feedbackAttachments.submissionId));

    return ok({
      totalBytes: row?.totalBytes ?? 0,
      reclaimableBytes: row?.reclaimableBytes ?? 0,
    });
  }, 'We could not read the storage figures. Please try again.');
}
