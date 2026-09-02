import { beforeEach, describe, expect, it, vi } from 'vitest';
import { and, asc, eq } from 'drizzle-orm';

import type { SessionUser } from '@/lib/auth/session';

import { createTestCohort, createTestMember, db, schema } from './helpers/db';

/**
 * Individual topic assignment, end to end against a real database.
 *
 * The rules under test are the ones a UI cannot enforce: which rows change when an admin
 * pins a student to a topic, what the bulk run is allowed to overwrite, and what a student
 * is refused when they call the action directly. All three are decided by SQL and by the
 * guards, so they are exercised through the actions themselves rather than through mocks.
 */

const state: { user: SessionUser | null } = { user: null };

vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: async () => state.user,
  SESSION_COOKIE: 'dr_session',
}));

vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

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

/** A three-topic roadmap in one module, in syllabus order. */
async function createRoadmap(memberId: string, titles: string[]) {
  const [subject] = await db
    .insert(schema.subjects)
    .values({
      name: `Anatomy ${Math.random().toString(36).slice(2, 8)}`,
      slug: `anatomy-${Math.random().toString(36).slice(2, 8)}`,
    })
    .returning();

  const [roadmap] = await db
    .insert(schema.roadmaps)
    .values({
      memberId,
      subjectId: subject!.id,
      slot: 'primary',
      title: 'Anatomy',
    })
    .returning();

  const [week] = await db
    .insert(schema.roadmapWeeks)
    .values({ roadmapId: roadmap!.id, weekNumber: 1, title: 'Upper limb' })
    .returning();

  const topics = [];
  for (const [index, title] of titles.entries()) {
    const [topic] = await db
      .insert(schema.roadmapTopics)
      .values({
        roadmapId: roadmap!.id,
        weekId: week!.id,
        title,
        position: index,
        status: index === 0 ? 'in_progress' : 'upcoming',
      })
      .returning();
    topics.push(topic!);
  }

  return { roadmap: roadmap!, topics };
}

const statusOf = async (topicId: string) =>
  (
    await db
      .select({ status: schema.roadmapTopics.status })
      .from(schema.roadmapTopics)
      .where(eq(schema.roadmapTopics.id, topicId))
      .limit(1)
  )[0]?.status;

const assignmentFor = async (memberId: string, date: string) =>
  (
    await db
      .select()
      .from(schema.dailyAssignments)
      .where(
        and(eq(schema.dailyAssignments.memberId, memberId), eq(schema.dailyAssignments.date, date)),
      )
      .limit(1)
  )[0];

beforeEach(() => {
  state.user = null;
});

describe('assignIndividualTopicAction', () => {
  it('makes the chosen topic current and leaves the rest of the roadmap alone', async () => {
    const { cohort } = await createTestCohort();
    const admin = await createTestMember(cohort.id, { role: 'admin' });
    const student = await createTestMember(cohort.id);
    const { topics } = await createRoadmap(student.memberId, ['Shoulder', 'Arm', 'Wrist']);

    state.user = sessionUser(admin.user.id, 'admin');
    const { assignIndividualTopicAction } = await import('@/server/actions/admin');

    const result = await assignIndividualTopicAction(cohort.id, {
      memberId: student.memberId,
      topicId: topics[2]!.id,
      date: '2025-09-02',
    });

    expect(result.ok).toBe(true);

    // The pinned topic is current, and the topic that *was* current steps back.
    expect(await statusOf(topics[2]!.id)).toBe('in_progress');
    expect(await statusOf(topics[0]!.id)).toBe('upcoming');
    expect(await statusOf(topics[1]!.id)).toBe('upcoming');

    const assignment = await assignmentFor(student.memberId, '2025-09-02');
    expect(assignment?.topicId).toBe(topics[2]!.id);
    expect(assignment?.source).toBe('admin');
    expect(assignment?.assignedByUserId).toBe(admin.user.id);
    expect(assignment?.assignedAt).toBeInstanceOf(Date);
  });

  it('refuses a topic belonging to a different student', async () => {
    const { cohort } = await createTestCohort();
    const admin = await createTestMember(cohort.id, { role: 'admin' });
    const alice = await createTestMember(cohort.id);
    const bob = await createTestMember(cohort.id);
    const bobsRoadmap = await createRoadmap(bob.memberId, ['Shoulder', 'Arm']);

    state.user = sessionUser(admin.user.id, 'admin');
    const { assignIndividualTopicAction } = await import('@/server/actions/admin');

    const result = await assignIndividualTopicAction(cohort.id, {
      memberId: alice.memberId,
      topicId: bobsRoadmap.topics[1]!.id,
      date: '2025-09-02',
    });

    expect(result.ok).toBe(false);
    expect(await statusOf(bobsRoadmap.topics[1]!.id)).toBe('upcoming');
    expect(await assignmentFor(alice.memberId, '2025-09-02')).toBeUndefined();
  });

  it('is refused outright for a student, whatever they send', async () => {
    const { cohort } = await createTestCohort();
    const student = await createTestMember(cohort.id);
    const { topics } = await createRoadmap(student.memberId, ['Shoulder', 'Arm']);

    state.user = sessionUser(student.user.id, 'student');
    const { assignIndividualTopicAction } = await import('@/server/actions/admin');

    const result = await assignIndividualTopicAction(cohort.id, {
      memberId: student.memberId,
      topicId: topics[1]!.id,
      date: '2025-09-02',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/Administrator access/i);
    expect(await statusOf(topics[1]!.id)).toBe('upcoming');
  });

  it('warns before reassigning finished work, and proceeds once confirmed', async () => {
    const { cohort } = await createTestCohort();
    const admin = await createTestMember(cohort.id, { role: 'admin' });
    const student = await createTestMember(cohort.id);
    const { topics } = await createRoadmap(student.memberId, ['Shoulder', 'Arm', 'Wrist']);

    await db
      .update(schema.roadmapTopics)
      .set({ status: 'completed', completedAt: new Date() })
      .where(eq(schema.roadmapTopics.id, topics[0]!.id));

    state.user = sessionUser(admin.user.id, 'admin');
    const { assignIndividualTopicAction } = await import('@/server/actions/admin');

    const refused = await assignIndividualTopicAction(cohort.id, {
      memberId: student.memberId,
      topicId: topics[0]!.id,
      date: '2025-09-02',
    });
    expect(refused.ok).toBe(false);
    expect(await statusOf(topics[0]!.id)).toBe('completed');

    const confirmed = await assignIndividualTopicAction(cohort.id, {
      memberId: student.memberId,
      topicId: topics[0]!.id,
      date: '2025-09-02',
      allowCompleted: true,
    });
    expect(confirmed.ok).toBe(true);
    if (confirmed.ok) expect(confirmed.data.wasCompleted).toBe(true);
    expect(await statusOf(topics[0]!.id)).toBe('in_progress');
  });

  it('records who changed the topic and when', async () => {
    const { cohort } = await createTestCohort();
    const admin = await createTestMember(cohort.id, { role: 'admin' });
    const student = await createTestMember(cohort.id);
    const { topics } = await createRoadmap(student.memberId, ['Shoulder', 'Arm']);

    state.user = sessionUser(admin.user.id, 'admin');
    const { assignIndividualTopicAction } = await import('@/server/actions/admin');
    await assignIndividualTopicAction(cohort.id, {
      memberId: student.memberId,
      topicId: topics[1]!.id,
      date: '2025-09-02',
    });

    const [audit] = await db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.entityId, student.memberId));

    expect(audit?.action).toBe('assignment.individual');
    expect(audit?.actorUserId).toBe(admin.user.id);
    expect(audit?.payload).toMatchObject({ topicTitle: 'Arm' });
  });
});

describe('bulk assignment against individual assignments', () => {
  async function setup() {
    const { cohort } = await createTestCohort();
    const admin = await createTestMember(cohort.id, { role: 'admin' });
    const pinned = await createTestMember(cohort.id, { fullName: 'Pinned Student' });
    const other = await createTestMember(cohort.id, { fullName: 'Other Student' });
    const pinnedRoadmap = await createRoadmap(pinned.memberId, ['Shoulder', 'Arm', 'Wrist']);
    const otherRoadmap = await createRoadmap(other.memberId, ['Shoulder', 'Arm']);

    state.user = sessionUser(admin.user.id, 'admin');
    const admins = await import('@/server/actions/admin');

    await admins.assignIndividualTopicAction(cohort.id, {
      memberId: pinned.memberId,
      topicId: pinnedRoadmap.topics[2]!.id,
      date: '2025-09-02',
    });

    return { cohort, admins, pinned, other, pinnedRoadmap, otherRoadmap };
  }

  function bulkForm(cohortId: string, extra?: Record<string, string>) {
    const form = new FormData();
    form.set('cohortId', cohortId);
    form.set('date', '2025-09-02');
    form.set('plannedMinutes', '90');
    form.set('strategy', 'next_topic');
    for (const [key, value] of Object.entries(extra ?? {})) form.set(key, value);
    return form;
  }

  it('skips a student whose topic was assigned by hand, and says who', async () => {
    const { cohort, admins, pinned, other, pinnedRoadmap } = await setup();

    const result = await admins.bulkAssignAction(null, bulkForm(cohort.id));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.skipped).toBe(1);
    expect(result.data.skippedNames).toEqual(['Pinned Student']);

    // The individual assignment survived untouched…
    const kept = await assignmentFor(pinned.memberId, '2025-09-02');
    expect(kept?.topicId).toBe(pinnedRoadmap.topics[2]!.id);
    expect(kept?.source).toBe('admin');

    // …while everyone else was assigned as usual.
    expect((await assignmentFor(other.memberId, '2025-09-02'))?.source).toBe('auto');
  });

  it('replaces it only when the admin confirms the overwrite', async () => {
    const { cohort, admins, pinned, pinnedRoadmap } = await setup();

    const result = await admins.bulkAssignAction(
      null,
      bulkForm(cohort.id, { overwriteIndividual: 'true' }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.skipped).toBe(0);

    const replaced = await assignmentFor(pinned.memberId, '2025-09-02');
    expect(replaced?.topicId).not.toBe(pinnedRoadmap.topics[2]!.id);
    // The stamp goes with it: this is a bulk row now, and the next bulk run may take it.
    expect(replaced?.source).toBe('auto');
    expect(replaced?.assignedByUserId).toBeNull();
  });
});

describe('what a student may do to their own topics', () => {
  it('refuses to let a student nominate the current topic', async () => {
    const { cohort } = await createTestCohort();
    const student = await createTestMember(cohort.id);
    const { topics } = await createRoadmap(student.memberId, ['Shoulder', 'Arm', 'Wrist']);

    state.user = sessionUser(student.user.id, 'student');
    const { setTopicStatusAction } = await import('@/server/actions/study');

    const result = await setTopicStatusAction(topics[2]!.id, 'in_progress');

    expect(result.ok).toBe(false);
    expect(await statusOf(topics[2]!.id)).toBe('upcoming');
  });

  it('still lets a student tick a topic off, and moves the pointer on by position', async () => {
    const { cohort } = await createTestCohort();
    const admin = await createTestMember(cohort.id, { role: 'admin' });
    const student = await createTestMember(cohort.id);
    const { topics } = await createRoadmap(student.memberId, ['Shoulder', 'Arm', 'Wrist', 'Hand']);

    // The admin drops them in at position 2, past two topics they have not done.
    state.user = sessionUser(admin.user.id, 'admin');
    const { assignIndividualTopicAction } = await import('@/server/actions/admin');
    await assignIndividualTopicAction(cohort.id, {
      memberId: student.memberId,
      topicId: topics[2]!.id,
      date: '2025-09-02',
    });

    state.user = sessionUser(student.user.id, 'student');
    const { setTopicStatusAction } = await import('@/server/actions/study');
    const result = await setTopicStatusAction(topics[2]!.id, 'completed');

    expect(result.ok).toBe(true);
    expect(await statusOf(topics[2]!.id)).toBe('completed');
    // Forward by position — not back to the first thing they skipped.
    expect(await statusOf(topics[3]!.id)).toBe('in_progress');
    expect(await statusOf(topics[0]!.id)).toBe('upcoming');
  });

  it('falls back to the topics that were skipped once the subject runs out', async () => {
    const { cohort } = await createTestCohort();
    const admin = await createTestMember(cohort.id, { role: 'admin' });
    const student = await createTestMember(cohort.id);
    const { topics } = await createRoadmap(student.memberId, ['Shoulder', 'Arm', 'Wrist']);

    state.user = sessionUser(admin.user.id, 'admin');
    const { assignIndividualTopicAction } = await import('@/server/actions/admin');
    await assignIndividualTopicAction(cohort.id, {
      memberId: student.memberId,
      topicId: topics[2]!.id,
      date: '2025-09-02',
    });

    state.user = sessionUser(student.user.id, 'student');
    const { setTopicStatusAction } = await import('@/server/actions/study');
    await setTopicStatusAction(topics[2]!.id, 'completed');

    // Nothing later in the subject, so the earliest thing still outstanding becomes current.
    const remaining = await db
      .select({ id: schema.roadmapTopics.id, status: schema.roadmapTopics.status })
      .from(schema.roadmapTopics)
      .where(eq(schema.roadmapTopics.roadmapId, topics[0]!.roadmapId))
      .orderBy(asc(schema.roadmapTopics.position));

    expect(remaining[0]?.status).toBe('in_progress');
  });
});
