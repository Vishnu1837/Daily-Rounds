import { describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import { buildCalendar } from '@/lib/domain/calendar';
import { DEFAULT_POINT_RULES } from '@/lib/domain/points';
import { DEFAULT_RISK_THRESHOLDS } from '@/lib/domain/risk';
import type { MemberContext } from '@/server/context';
import { getHomeData } from '@/server/queries/student';

import { createTestCohort, createTestMember, db, schema } from './helpers/db';

/**
 * What the home screen is told about the study room and today's topic.
 *
 * Both were wrong in ways a unit test could not catch. The room was labelled "Morning Study
 * Room" whatever hour it ran at, and every clock time on the screen was the *cohort's* wall
 * clock — so a student who changed their timezone in their profile saw no change at all.
 * And today's topic could now come from outside the student's roadmaps, which is a join
 * that either coalesces or silently shows nothing.
 */

vi.mock('next/cache', () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
  updateTag: () => {},
  cacheTag: () => {},
  cacheLife: () => {},
}));

const TODAY = '2025-09-10';

type Cohort = typeof schema.cohorts.$inferSelect;

function contextFor(cohort: Cohort, memberId: string, timezone: string): MemberContext {
  return {
    user: {
      id: 'irrelevant',
      email: 'irrelevant@test.local',
      fullName: 'Irrelevant',
      role: 'student',
      timezone,
      avatarSeed: 'test',
      avatarUrl: null,
      mbbsYear: null,
      university: null,
      whatsapp: null,
      onboardingCompletedAt: new Date('2025-08-01T00:00:00Z'),
    },
    memberId,
    cohort,
    calendar: buildCalendar({
      timezone: cohort.timezone,
      startDate: cohort.startDate,
      endDate: cohort.endDate,
      activeWeekdays: cohort.activeWeekdays,
      holidays: [],
    }),
    rules: DEFAULT_POINT_RULES,
    thresholds: DEFAULT_RISK_THRESHOLDS,
    today: TODAY,
    joinedOn: cohort.startDate,
  };
}

async function withRoom(cohortId: string, values: Partial<Cohort>) {
  const [row] = await db
    .update(schema.cohorts)
    .set(values)
    .where(eq(schema.cohorts.id, cohortId))
    .returning();
  return row!;
}

describe('the study room a student is shown', () => {
  it('translates the window into the student’s own timezone and names it after that hour', async () => {
    const { cohort } = await createTestCohort();
    const student = await createTestMember(cohort.id);
    const updated = await withRoom(cohort.id, {
      timezone: 'Asia/Kolkata',
      meetStartTime: '06:00',
      meetEndTime: '07:00',
      meetUrl: 'https://meet.google.com/abc-defg-hij',
    });

    const home = await getHomeData(contextFor(updated, student.memberId, 'Europe/London'));

    // 06:00 in Delhi is 01:30 in London — and 01:30 is not the morning session.
    expect(home.studyRoom.displayStartTime).toBe('01:30');
    expect(home.studyRoom.displayEndTime).toBe('02:30');
    expect(home.studyRoom.title).toBe('Night Study Room');
    // The cohort window travels untranslated, because attendance is judged against it.
    expect(home.studyRoom.startTime).toBe('06:00');
    expect(home.studyRoom.zoneNote).toContain('06:00–07:00 cohort time');
  });

  it('leaves the times alone, and says nothing about zones, for a student in cohort time', async () => {
    const { cohort } = await createTestCohort();
    const student = await createTestMember(cohort.id);
    const updated = await withRoom(cohort.id, {
      timezone: 'Asia/Kolkata',
      meetStartTime: '22:00',
      meetEndTime: '23:30',
    });

    const home = await getHomeData(contextFor(updated, student.memberId, 'Asia/Kolkata'));

    expect(home.studyRoom.displayStartTime).toBe('22:00');
    expect(home.studyRoom.zoneNote).toBeNull();
    expect(home.studyRoom.title).toBe('Night Study Room');
  });

  it('uses the cohort’s own name for the room whenever one is set', async () => {
    const { cohort } = await createTestCohort();
    const student = await createTestMember(cohort.id);
    const updated = await withRoom(cohort.id, {
      meetStartTime: '06:00',
      meetTitle: 'Sunrise Rounds',
    });

    const home = await getHomeData(contextFor(updated, student.memberId, 'Asia/Kolkata'));
    expect(home.studyRoom.title).toBe('Sunrise Rounds');
  });

  it('shows a topic assigned from outside the student’s roadmaps', async () => {
    const { cohort } = await createTestCohort();
    const student = await createTestMember(cohort.id);

    await db.insert(schema.dailyAssignments).values({
      memberId: student.memberId,
      date: TODAY,
      topicId: null,
      customTopicTitle: 'Pharmacokinetics',
      customTopicRef: 'pharmacology/general-pharmacology/pharmacokinetics',
      customSubjectName: 'Pharmacology',
      plannedMinutes: 60,
      source: 'admin',
    });

    const home = await getHomeData(contextFor(cohort, student.memberId, 'Asia/Kolkata'));

    expect(home.assignment?.topicTitle).toBe('Pharmacokinetics');
    expect(home.assignment?.subjectName).toBe('Pharmacology');
    // The ref is what the matching knowledge check keys off.
    expect(home.assignment?.topicRef).toBe('pharmacology/general-pharmacology/pharmacokinetics');
    expect(home.assignment?.topicId).toBeNull();
    expect(home.assignment?.plannedMinutes).toBe(60);
  });
});
