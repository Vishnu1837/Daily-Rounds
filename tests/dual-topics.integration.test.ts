import { and, asc, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SessionUser } from '@/lib/auth/session';

import { createTestCohort, createTestMember, db, schema } from './helpers/db';

/**
 * Two subjects, two topics a day — and what a roadmap says about itself.
 *
 * The rules under test are the ones the schema change made possible and that no UI can
 * enforce: a day holds one topic per subject rather than one topic overall; the bulk run
 * advances each subject along its own sequence, including a sequence an admin has
 * redesigned; and a subject that has run out of topics is marked finished instead of
 * quietly wrapping round to its first one.
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

function sessionUser(id: string, role: 'student' | 'admin'): SessionUser {
  return {
    id,
    email: `${id}@test.local`,
    fullName: 'Test User',
    role,
    timezone: 'Asia/Kolkata',
    avatarSeed: 'test',
    avatarUrl: null,
    mbbsYear: 2,
    university: null,
    whatsapp: null,
    onboardingCompletedAt: new Date('2025-08-01T00:00:00Z'),
  };
}

/** A roadmap in one slot, carrying `titles` in the order given. */
async function createRoadmap(
  memberId: string,
  slot: 'primary' | 'secondary',
  subjectName: string,
  titles: string[],
) {
  const suffix = Math.random().toString(36).slice(2, 8);
  const [subject] = await db
    .insert(schema.subjects)
    .values({ name: `${subjectName} ${suffix}`, slug: `${subjectName.toLowerCase()}-${suffix}` })
    .returning();

  const [roadmap] = await db
    .insert(schema.roadmaps)
    .values({ memberId, subjectId: subject!.id, slot, title: subjectName })
    .returning();

  const topics = [];
  for (const [index, title] of titles.entries()) {
    const [topic] = await db
      .insert(schema.roadmapTopics)
      .values({
        roadmapId: roadmap!.id,
        title,
        position: index,
        status: index === 0 ? 'in_progress' : 'upcoming',
      })
      .returning();
    topics.push(topic!);
  }

  return { subject: subject!, roadmap: roadmap!, topics };
}

const assignmentsFor = async (memberId: string, date: string) =>
  db
    .select()
    .from(schema.dailyAssignments)
    .where(
      and(eq(schema.dailyAssignments.memberId, memberId), eq(schema.dailyAssignments.date, date)),
    )
    .orderBy(asc(schema.dailyAssignments.slot));

const roadmapRow = async (id: string) =>
  (await db.select().from(schema.roadmaps).where(eq(schema.roadmaps.id, id)).limit(1))[0];

function bulkForm(cohortId: string, date: string) {
  const form = new FormData();
  form.set('cohortId', cohortId);
  form.set('date', date);
  form.set('plannedMinutes', '90');
  form.set('strategy', 'next_topic');
  return form;
}

beforeEach(() => {
  state.user = null;
});

describe('a day with two subjects', () => {
  it('assigns a topic in each subject, not one across both', async () => {
    const { cohort } = await createTestCohort();
    const admin = await createTestMember(cohort.id, { role: 'admin' });
    const student = await createTestMember(cohort.id, { fullName: 'Two Subject Student' });

    await createRoadmap(student.memberId, 'primary', 'Anatomy', ['Upper limb', 'Lower limb']);
    await createRoadmap(student.memberId, 'secondary', 'Physiology', ['Cardiac', 'Renal']);

    state.user = sessionUser(admin.user.id, 'admin');
    const { bulkAssignAction } = await import('@/server/actions/admin');

    const result = await bulkAssignAction(null, bulkForm(cohort.id, '2025-09-02'));
    expect(result.ok).toBe(true);

    const rows = await assignmentsFor(student.memberId, '2025-09-02');
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.slot)).toEqual(['primary', 'secondary']);
    expect(new Set(rows.map((r) => r.topicId)).size).toBe(2);
  });

  it('advances each student along their own sequence, custom order included', async () => {
    const { cohort } = await createTestCohort();
    const admin = await createTestMember(cohort.id, { role: 'admin' });
    const customised = await createTestMember(cohort.id, { fullName: 'Custom Student' });
    const standard = await createTestMember(cohort.id, { fullName: 'Standard Student' });

    const a = await createRoadmap(customised.memberId, 'primary', 'Anatomy', [
      'Introduction',
      'Lower limb',
    ]);
    const b = await createRoadmap(standard.memberId, 'primary', 'Anatomy', [
      'Introduction',
      'Lower limb',
    ]);

    state.user = sessionUser(admin.user.id, 'admin');
    const { reorderTopicsAction, bulkAssignAction } = await import('@/server/actions/admin');

    // One student's order is redesigned so that Lower limb comes first.
    const reorder = await reorderTopicsAction(cohort.id, a.roadmap.id, [
      a.topics[1]!.id,
      a.topics[0]!.id,
    ]);
    expect(reorder.ok).toBe(true);

    // Their roadmap now reports itself as customised; the other student's does not.
    expect((await roadmapRow(a.roadmap.id))?.isCustomized).toBe(true);
    expect((await roadmapRow(b.roadmap.id))?.isCustomized).toBe(false);

    // Both students finish the topic they were on, so the next run has to look up what
    // each of their own sequences puts next.
    for (const topicId of [a.topics[0]!.id, b.topics[0]!.id]) {
      await db
        .update(schema.roadmapTopics)
        .set({ status: 'completed' })
        .where(eq(schema.roadmapTopics.id, topicId));
    }

    const result = await bulkAssignAction(null, bulkForm(cohort.id, '2025-09-03'));
    expect(result.ok).toBe(true);

    // Each student advanced along their own roadmap. Neither read the other's.
    const [customRow] = await assignmentsFor(customised.memberId, '2025-09-03');
    const [standardRow] = await assignmentsFor(standard.memberId, '2025-09-03');
    expect(customRow?.topicId).toBe(a.topics[1]!.id);
    expect(standardRow?.topicId).toBe(b.topics[1]!.id);
  });

  it('marks a subject complete instead of wrapping back to its first topic', async () => {
    const { cohort } = await createTestCohort();
    const admin = await createTestMember(cohort.id, { role: 'admin' });
    const student = await createTestMember(cohort.id, { fullName: 'Finished Student' });

    const { roadmap } = await createRoadmap(student.memberId, 'primary', 'Anatomy', ['Only topic']);
    await db
      .update(schema.roadmapTopics)
      .set({ status: 'completed' })
      .where(eq(schema.roadmapTopics.roadmapId, roadmap.id));

    state.user = sessionUser(admin.user.id, 'admin');
    const { bulkAssignAction } = await import('@/server/actions/admin');

    const result = await bulkAssignAction(null, bulkForm(cohort.id, '2025-09-04'));
    expect(result.ok).toBe(true);

    expect(await assignmentsFor(student.memberId, '2025-09-04')).toHaveLength(0);
    expect((await roadmapRow(roadmap.id))?.completedAt).not.toBeNull();
  });

  it('pins one subject without stopping the other from being filled', async () => {
    const { cohort } = await createTestCohort();
    const admin = await createTestMember(cohort.id, { role: 'admin' });
    const student = await createTestMember(cohort.id, { fullName: 'Half Pinned Student' });

    const anatomy = await createRoadmap(student.memberId, 'primary', 'Anatomy', [
      'Upper limb',
      'Lower limb',
    ]);
    await createRoadmap(student.memberId, 'secondary', 'Physiology', ['Cardiac', 'Renal']);

    state.user = sessionUser(admin.user.id, 'admin');
    const { assignIndividualTopicAction, bulkAssignAction } =
      await import('@/server/actions/admin');

    const pinned = await assignIndividualTopicAction(cohort.id, {
      memberId: student.memberId,
      topicId: anatomy.topics[1]!.id,
      date: '2025-09-05',
    });
    expect(pinned.ok).toBe(true);

    const result = await bulkAssignAction(null, bulkForm(cohort.id, '2025-09-05'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The pinned *subject* is what gets skipped, not the whole student.
    expect(result.data.skippedNames).toEqual(['Half Pinned Student']);

    const rows = await assignmentsFor(student.memberId, '2025-09-05');
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.slot === 'primary')?.topicId).toBe(anatomy.topics[1]!.id);
    expect(rows.find((r) => r.slot === 'primary')?.source).toBe('admin');
    expect(rows.find((r) => r.slot === 'secondary')?.source).toBe('auto');
  });
});
