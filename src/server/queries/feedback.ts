import 'server-only';

import { cache } from 'react';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import {
  announcementReads,
  announcements,
  cohortMembers,
  cohorts,
  feedbackAttachments,
  feedbackPromptDismissals,
  feedbackSubmissions,
  users,
} from '@/db/schema';
import {
  FEEDBACK_PROMPT_KEY,
  type FeedbackPromptState,
  type FeedbackReport,
  type NotificationInbox,
} from '@/lib/domain/feedback';
import type { MemberContext } from '@/server/context';

/* ------------------------------------------------------------ student side */

/**
 * Where this student stands with the current feedback round.
 *
 * Both flags are read in one round trip — the notification bell sits in the header of every
 * screen, so this runs on every page and is not the place for two queries. The shape itself
 * lives in `lib/domain/feedback` alongside the copy, because the client renders from it.
 *
 * Memoised per request because two independent shell slots want the same answer: the bell,
 * which needs to know whether to count the request as unread, and the popup, which needs to
 * know whether to exist. Neither can reasonably ask the other, and without this every page
 * in the app pays for the same `EXISTS` twice.
 */
export const getFeedbackPromptState = cache(async function getFeedbackPromptState(
  ctx: MemberContext,
): Promise<FeedbackPromptState> {
  const [row] = await db
    .select({
      answered: sql<boolean>`EXISTS (
        SELECT 1 FROM ${feedbackSubmissions}
        WHERE ${feedbackSubmissions.memberId} = ${ctx.memberId}
          AND ${feedbackSubmissions.promptKey} = ${FEEDBACK_PROMPT_KEY}
      )`,
      dismissed: sql<boolean>`EXISTS (
        SELECT 1 FROM ${feedbackPromptDismissals}
        WHERE ${feedbackPromptDismissals.memberId} = ${ctx.memberId}
          AND ${feedbackPromptDismissals.promptKey} = ${FEEDBACK_PROMPT_KEY}
      )`,
    })
    .from(sql`(SELECT 1) AS probe`);

  return { answered: row?.answered ?? false, dismissed: row?.dismissed ?? false };
});

/**
 * The most recent announcements a student could still care about.
 *
 * Capped rather than paged: a notification bell holds the last few weeks of things, and
 * someone hunting for the twentieth-most-recent notice is looking for something this was
 * never the right surface for.
 */
const ANNOUNCEMENT_LIMIT = 20;

export async function getNotifications(ctx: MemberContext): Promise<NotificationInbox> {
  const [prompt, rows] = await Promise.all([
    getFeedbackPromptState(ctx),
    db
      .select({
        id: announcements.id,
        title: announcements.title,
        body: announcements.body,
        createdAt: announcements.createdAt,
        readAt: announcementReads.readAt,
      })
      .from(announcements)
      .leftJoin(
        announcementReads,
        and(
          eq(announcementReads.announcementId, announcements.id),
          eq(announcementReads.memberId, ctx.memberId),
        ),
      )
      .where(eq(announcements.cohortId, ctx.cohort.id))
      .orderBy(desc(announcements.isPinned), desc(announcements.createdAt))
      .limit(ANNOUNCEMENT_LIMIT),
  ]);

  const list = rows.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    unread: row.readAt === null,
  }));

  return {
    prompt,
    announcements: list,
    unreadCount: list.filter((a) => a.unread).length + (prompt.answered ? 0 : 1),
  };
}

/* -------------------------------------------------------------- admin side */

/**
 * Every report, newest first, with its screenshots named but not loaded.
 *
 * The `data` column is deliberately absent here. It is the only column in the schema big
 * enough to make a list view expensive, and a console that drags three megabytes of PNG
 * across the wire to render a table of one-line summaries gets slower every week whether or
 * not anybody opens a picture. The bytes are read in exactly one place — the attachment
 * route, one image at a time.
 *
 * Read whole rather than paged, on the same reasoning as the waitlist: the point of the
 * screen is to search and triage the complete list, and a feedback table large enough for
 * paging to matter would be a very good problem to have.
 */
export async function getFeedbackReports(): Promise<FeedbackReport[]> {
  const rows = await db
    .select({
      id: feedbackSubmissions.id,
      promptKey: feedbackSubmissions.promptKey,
      issues: feedbackSubmissions.issues,
      suggestions: feedbackSubmissions.suggestions,
      resolvedAt: feedbackSubmissions.resolvedAt,
      createdAt: feedbackSubmissions.createdAt,
      studentName: users.fullName,
      studentEmail: users.email,
      cohortName: cohorts.name,
      memberStatus: cohortMembers.status,
      resolvedByName: sql<string | null>`resolver."full_name"`,
    })
    .from(feedbackSubmissions)
    .leftJoin(users, eq(users.id, feedbackSubmissions.userId))
    .leftJoin(cohorts, eq(cohorts.id, feedbackSubmissions.cohortId))
    .leftJoin(cohortMembers, eq(cohortMembers.id, feedbackSubmissions.memberId))
    // The second look at `users`, for whoever closed the report. Aliased in raw SQL because
    // the same table is already joined above for the student who wrote it.
    .leftJoin(sql`${users} AS resolver`, sql`resolver."id" = ${feedbackSubmissions.resolvedBy}`)
    .orderBy(desc(feedbackSubmissions.createdAt));

  if (rows.length === 0) return [];

  /*
   * Attachments in a second query rather than a join. A report with three screenshots would
   * otherwise repeat its full text three times over the wire, and the ordering the screen is
   * built around would have to survive the fan-out.
   */
  const files = await db
    .select({
      id: feedbackAttachments.id,
      submissionId: feedbackAttachments.submissionId,
      mimeType: feedbackAttachments.mimeType,
      byteSize: feedbackAttachments.byteSize,
    })
    .from(feedbackAttachments)
    .where(
      inArray(
        feedbackAttachments.submissionId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(feedbackAttachments.createdAt));

  const bySubmission = new Map<string, FeedbackReport['attachments']>();
  for (const file of files) {
    const list = bySubmission.get(file.submissionId) ?? [];
    list.push({ id: file.id, mimeType: file.mimeType, byteSize: file.byteSize });
    bySubmission.set(file.submissionId, list);
  }

  return rows.map((row) => ({
    id: row.id,
    studentName: row.studentName,
    studentEmail: row.studentEmail,
    cohortName: row.cohortName,
    isActiveMember: row.memberStatus === 'active',
    promptKey: row.promptKey,
    issues: row.issues,
    suggestions: row.suggestions,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    resolvedByName: row.resolvedByName,
    createdAt: row.createdAt.toISOString(),
    attachments: bySubmission.get(row.id) ?? [],
  }));
}

/**
 * How many reports nobody has dealt with yet.
 *
 * Counted in Postgres rather than as a `.length` on the list above, so the console's overview
 * can show the number without reading a single word of what any student wrote.
 */
export async function getUnresolvedFeedbackCount(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(feedbackSubmissions)
    .where(isNull(feedbackSubmissions.resolvedAt));
  return row?.count ?? 0;
}

/**
 * One screenshot's bytes, for the route that serves it.
 *
 * The only read of the `data` column anywhere in the application, and it takes exactly one
 * row. Keeping it in this file rather than inline in the route is what makes that claim
 * checkable with a grep.
 */
export async function getFeedbackAttachment(
  attachmentId: string,
): Promise<{ mimeType: string; data: Uint8Array } | null> {
  const [row] = await db
    .select({ mimeType: feedbackAttachments.mimeType, data: feedbackAttachments.data })
    .from(feedbackAttachments)
    .where(eq(feedbackAttachments.id, attachmentId))
    .limit(1);
  return row ?? null;
}
