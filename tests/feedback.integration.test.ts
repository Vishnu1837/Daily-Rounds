import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import type { SessionUser } from '@/lib/auth/session';

import { createTestCohort, createTestMember, db, migrateTestDb, schema } from './helpers/db';

/**
 * The feedback round, against a real database.
 *
 * Three things are worth a real Postgres rather than a mock, and they are the three things
 * that decide whether this feature works:
 *
 *   1. Screenshots really do survive a round trip through a `bytea` column. The whole design
 *      rests on storing image bytes in the row, and a driver that mangles them would not
 *      show up in any test that stubbed the database.
 *   2. Dismissing and answering are genuinely separate states. That is the difference
 *      between a popup that stops nagging and a request that quietly disappears.
 *   3. Deleting a report takes its images with it, by the foreign key rather than by
 *      remembering to. "Freeing the storage" is only true if nothing is left behind.
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

import { FEEDBACK_PROMPT_KEY } from '@/lib/domain/feedback';
import {
  clearFeedbackAttachmentsAction,
  deleteFeedbackAction,
  dismissFeedbackPromptAction,
  setFeedbackResolvedAction,
  submitFeedbackAction,
} from '@/server/actions/feedback';
import { getMemberContext } from '@/server/context';
import { getFeedbackPromptState, getFeedbackReports } from '@/server/queries/feedback';

beforeEach(async () => {
  await migrateTestDb();
  state.user = null;
  /*
   * The harness keeps one in-memory database for the whole file, and every cohort helper
   * adds to it rather than replacing it. These three tables are global — a report is not
   * scoped to the cohort the way attendance is — so counting rows across the database only
   * means anything if each test starts with them empty.
   */
  await db.delete(schema.feedbackAttachments);
  await db.delete(schema.feedbackPromptDismissals);
  await db.delete(schema.feedbackSubmissions);
});

/** A one-pixel PNG. Small, but genuinely binary — which is the point of using it. */
const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89,
]);

async function signedInStudent() {
  const { cohort } = await createTestCohort();
  const student = await createTestMember(cohort.id, { role: 'student' });
  state.user = {
    id: student.user.id,
    role: 'student',
    fullName: student.user.fullName,
  } as SessionUser;
  return { cohort, student };
}

function report(fields: { issues?: string; suggestions?: string; files?: File[] }) {
  const data = new FormData();
  data.set('promptKey', FEEDBACK_PROMPT_KEY);
  data.set('issues', fields.issues ?? '');
  data.set('suggestions', fields.suggestions ?? '');
  for (const file of fields.files ?? []) data.append('screenshots', file);
  return data;
}

function png(name = 'shot.png') {
  return new File([PNG_BYTES], name, { type: 'image/png' });
}

async function contextFor(user: SessionUser) {
  const ctx = await getMemberContext(user);
  if (!ctx) throw new Error('expected a membership');
  return ctx;
}

describe('submitFeedbackAction', () => {
  it('stores what the student wrote and the screenshot bytes exactly', async () => {
    const { student } = await signedInStudent();

    const result = await submitFeedbackAction(
      report({ issues: 'The timer resets when I lock my phone.', files: [png()] }),
    );
    expect(result.ok).toBe(true);

    const [row] = await db
      .select()
      .from(schema.feedbackSubmissions)
      .where(eq(schema.feedbackSubmissions.userId, student.user.id));

    expect(row?.issues).toBe('The timer resets when I lock my phone.');
    expect(row?.memberId).toBe(student.memberId);
    expect(row?.promptKey).toBe(FEEDBACK_PROMPT_KEY);
    expect(row?.resolvedAt).toBeNull();

    const files = await db
      .select()
      .from(schema.feedbackAttachments)
      .where(eq(schema.feedbackAttachments.submissionId, row!.id));

    expect(files).toHaveLength(1);
    expect(files[0]!.mimeType).toBe('image/png');
    expect(files[0]!.byteSize).toBe(PNG_BYTES.byteLength);
    // The bytes matter more than the count: a driver that round-tripped this through a
    // string would give the right length and the wrong image.
    expect(Array.from(files[0]!.data)).toEqual(Array.from(PNG_BYTES));
  });

  it('accepts a suggestion with no issue, and refuses a report that says nothing', async () => {
    await signedInStudent();

    expect((await submitFeedbackAction(report({ suggestions: 'Dark mode on the timer' }))).ok).toBe(
      true,
    );

    const empty = await submitFeedbackAction(report({}));
    expect(empty.ok).toBe(false);
  });

  it('refuses a file that is not one of the image types we serve', async () => {
    await signedInStudent();

    const result = await submitFeedbackAction(
      report({
        issues: 'Attaching my notes',
        files: [new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' })],
      }),
    );

    expect(result.ok).toBe(false);
    expect(await db.select().from(schema.feedbackAttachments)).toHaveLength(0);
    // The refusal is total: no half-written report is left behind for an admin to read.
    expect(await db.select().from(schema.feedbackSubmissions)).toHaveLength(0);
  });

  it('refuses a signed-out caller', async () => {
    await signedInStudent();
    state.user = null;

    const result = await submitFeedbackAction(report({ issues: 'anything' }));
    expect(result.ok).toBe(false);
    expect(await db.select().from(schema.feedbackSubmissions)).toHaveLength(0);
  });
});

describe('the prompt lifecycle', () => {
  it('separates closing the popup from answering it', async () => {
    const { student } = await signedInStudent();
    const ctx = await contextFor(state.user!);

    expect(await getFeedbackPromptState(ctx)).toEqual({ answered: false, dismissed: false });

    // Closing the modal stops it opening by itself, and leaves the request in the bell.
    await dismissFeedbackPromptAction(FEEDBACK_PROMPT_KEY);
    expect(await getFeedbackPromptState(ctx)).toEqual({ answered: false, dismissed: true });

    // Answering is what takes it out of the bell.
    await submitFeedbackAction(report({ issues: 'Roadmap week numbers are off by one' }));
    expect(await getFeedbackPromptState(ctx)).toEqual({ answered: true, dismissed: true });

    expect(student.memberId).toBeTruthy();
  });

  it('is safe to dismiss twice', async () => {
    await signedInStudent();
    const ctx = await contextFor(state.user!);

    expect((await dismissFeedbackPromptAction(FEEDBACK_PROMPT_KEY)).ok).toBe(true);
    expect((await dismissFeedbackPromptAction(FEEDBACK_PROMPT_KEY)).ok).toBe(true);
    expect(await getFeedbackPromptState(ctx)).toEqual({ answered: false, dismissed: true });
  });

  it('asks again when a new round is opened', async () => {
    await signedInStudent();
    const ctx = await contextFor(state.user!);

    await dismissFeedbackPromptAction(FEEDBACK_PROMPT_KEY);
    await submitFeedbackAction(report({ issues: 'Something from the first round' }));
    expect(await getFeedbackPromptState(ctx)).toEqual({ answered: true, dismissed: true });

    // The key is what identifies a round; changing it is the whole mechanism for asking a
    // cohort again without a migration and without re-asking anyone who has not been asked.
    await db.update(schema.feedbackSubmissions).set({ promptKey: 'previous-round' });
    await db.update(schema.feedbackPromptDismissals).set({ promptKey: 'previous-round' });

    expect(await getFeedbackPromptState(ctx)).toEqual({ answered: false, dismissed: false });
  });
});

describe('the admin side', () => {
  async function reportFromStudentAndAdmin() {
    const { cohort, student } = await signedInStudent();
    await submitFeedbackAction(report({ issues: 'Check-in will not submit', files: [png()] }));

    const admin = await createTestMember(cohort.id, { role: 'admin' });
    state.user = { id: admin.user.id, role: 'admin', fullName: admin.user.fullName } as SessionUser;

    const [row] = await db.select().from(schema.feedbackSubmissions);
    return { id: row!.id, student, admin };
  }

  it('lists a report with its author and its screenshots, and never its bytes', async () => {
    const { student } = await reportFromStudentAndAdmin();

    const [listed] = await getFeedbackReports();
    expect(listed?.studentName).toBe(student.user.fullName);
    expect(listed?.issues).toBe('Check-in will not submit');
    expect(listed?.attachments).toHaveLength(1);
    expect(listed?.attachments[0]!.byteSize).toBe(PNG_BYTES.byteLength);
    // The list view names the image and does not carry it.
    expect(listed?.attachments[0]).not.toHaveProperty('data');
  });

  it('frees the screenshots without losing what the student wrote', async () => {
    const { id } = await reportFromStudentAndAdmin();

    const result = await clearFeedbackAttachmentsAction(id);
    expect(result.ok && result.data.freedBytes).toBe(PNG_BYTES.byteLength);

    expect(await db.select().from(schema.feedbackAttachments)).toHaveLength(0);
    const [listed] = await getFeedbackReports();
    expect(listed?.issues).toBe('Check-in will not submit');
  });

  it('takes the images with the report when the report is deleted', async () => {
    const { id } = await reportFromStudentAndAdmin();

    expect((await deleteFeedbackAction(id)).ok).toBe(true);
    expect(await db.select().from(schema.feedbackSubmissions)).toHaveLength(0);
    expect(await db.select().from(schema.feedbackAttachments)).toHaveLength(0);
  });

  it('records who resolved a report, and lets it be reopened', async () => {
    const { id, admin } = await reportFromStudentAndAdmin();

    expect((await setFeedbackResolvedAction(id, true)).ok).toBe(true);
    let [listed] = await getFeedbackReports();
    expect(listed?.resolvedAt).not.toBeNull();
    expect(listed?.resolvedByName).toBe(admin.user.fullName);

    expect((await setFeedbackResolvedAction(id, false)).ok).toBe(true);
    [listed] = await getFeedbackReports();
    expect(listed?.resolvedAt).toBeNull();
    expect(listed?.resolvedByName).toBeNull();
  });

  it('refuses every admin action for a student', async () => {
    const { id, student } = await reportFromStudentAndAdmin();
    state.user = { id: student.user.id, role: 'student' } as SessionUser;

    expect((await setFeedbackResolvedAction(id, true)).ok).toBe(false);
    expect((await clearFeedbackAttachmentsAction(id)).ok).toBe(false);
    expect((await deleteFeedbackAction(id)).ok).toBe(false);

    // Nothing moved.
    expect(await db.select().from(schema.feedbackSubmissions)).toHaveLength(1);
    expect(await db.select().from(schema.feedbackAttachments)).toHaveLength(1);
  });
});
