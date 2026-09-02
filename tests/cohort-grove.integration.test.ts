import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

import { buildCalendar } from '@/lib/domain/calendar';
import { DEFAULT_POINT_RULES } from '@/lib/domain/points';
import { DEFAULT_RISK_THRESHOLDS } from '@/lib/domain/risk';
import type { MemberContext } from '@/server/context';
import { getCohortGroves, getPeerGrove } from '@/server/queries/grove';

import { createTestCohort, createTestMember, db, schema } from './helpers/db';

/**
 * Cohort-visible groves.
 *
 * Two properties matter more than the numbers: a student can only ever reach a grove
 * belonging to their own cohort, and a round that was not sat through is never published to
 * anyone. Both are enforced in SQL, so both are tested against a real database rather than
 * asserted about the screen that renders them.
 */

const TODAY = '2025-09-10';

type Cohort = typeof schema.cohorts.$inferSelect;

function contextFor(cohort: Cohort, memberId: string): MemberContext {
  return {
    user: {
      id: 'irrelevant',
      email: 'irrelevant@test.local',
      fullName: 'Irrelevant',
      role: 'student',
      timezone: 'Asia/Kolkata',
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

async function plant(
  memberId: string,
  input: {
    date: string;
    focusMinutes: number;
    species: 'sprout' | 'fern' | 'neem' | 'banyan' | 'deodar';
    status: 'growing' | 'grown' | 'withered';
  },
) {
  await db.insert(schema.focusTrees).values({
    memberId,
    date: input.date,
    focusMinutes: input.focusMinutes,
    species: input.species,
    status: input.status,
    plantedAt: new Date(`${input.date}T09:00:00Z`),
    dueAt: new Date(`${input.date}T10:00:00Z`),
  });
}

describe('getCohortGroves', () => {
  it('counts only completed rounds, and only for this cohort', async () => {
    const mine = await createTestCohort();
    const theirs = await createTestCohort();

    const me = await createTestMember(mine.cohort.id, { fullName: 'Me' });
    const peer = await createTestMember(mine.cohort.id, { fullName: 'Peer' });
    const stranger = await createTestMember(theirs.cohort.id, { fullName: 'Stranger' });

    await plant(peer.memberId, {
      date: TODAY,
      focusMinutes: 50,
      species: 'banyan',
      status: 'grown',
    });
    await plant(peer.memberId, { date: TODAY, focusMinutes: 25, species: 'neem', status: 'grown' });
    // Neither of these may count: one was walked out on, one is still in the ground.
    await plant(peer.memberId, {
      date: TODAY,
      focusMinutes: 90,
      species: 'deodar',
      status: 'withered',
    });
    await plant(peer.memberId, {
      date: TODAY,
      focusMinutes: 90,
      species: 'deodar',
      status: 'growing',
    });
    await plant(stranger.memberId, {
      date: TODAY,
      focusMinutes: 90,
      species: 'deodar',
      status: 'grown',
    });

    const rows = await getCohortGroves(contextFor(mine.cohort, me.memberId));

    expect(rows.map((r) => r.name)).toEqual(['Peer', 'Me']);

    const peerRow = rows.find((r) => r.name === 'Peer')!;
    expect(peerRow.trees).toBe(2);
    expect(peerRow.focusMinutes).toBe(75);
    expect(peerRow.species).toMatchObject({ banyan: 1, neem: 1, deodar: 0 });

    // Someone who has never planted still appears, with a bare plot.
    expect(rows.find((r) => r.name === 'Me')).toMatchObject({
      trees: 0,
      focusMinutes: 0,
      isYou: true,
      lastPlantedOn: null,
    });
  });

  it('exposes a name and a picture, and nothing that could contact anyone', async () => {
    const { cohort } = await createTestCohort();
    const me = await createTestMember(cohort.id);

    const [row] = await getCohortGroves(contextFor(cohort, me.memberId));

    expect(Object.keys(row!).sort()).toEqual([
      'avatarUrl',
      'focusMinutes',
      'isYou',
      'lastPlantedOn',
      'memberId',
      'name',
      'species',
      'trees',
    ]);
  });
});

describe('getPeerGrove', () => {
  it('returns a classmate’s grown trees only', async () => {
    const { cohort } = await createTestCohort();
    const me = await createTestMember(cohort.id);
    const peer = await createTestMember(cohort.id, { fullName: 'Peer' });

    await plant(peer.memberId, { date: TODAY, focusMinutes: 25, species: 'neem', status: 'grown' });
    await plant(peer.memberId, {
      date: TODAY,
      focusMinutes: 90,
      species: 'deodar',
      status: 'withered',
    });

    const grove = await getPeerGrove(contextFor(cohort, me.memberId), peer.memberId);

    expect(grove).not.toBeNull();
    expect(grove!.name).toBe('Peer');
    expect(grove!.trees).toBe(1);
    expect(grove!.focusMinutes).toBe(25);
    expect(grove!.todayTrees).toHaveLength(1);
    expect(grove!.isYou).toBe(false);
    // The same fortnight the student's own grove shows.
    expect(grove!.days).toHaveLength(14);
    expect(grove!.days.at(-1)).toMatchObject({ date: TODAY, grown: 1, withered: 0 });
  });

  it('refuses a member from another cohort', async () => {
    const mine = await createTestCohort();
    const theirs = await createTestCohort();
    const me = await createTestMember(mine.cohort.id);
    const stranger = await createTestMember(theirs.cohort.id);

    expect(await getPeerGrove(contextFor(mine.cohort, me.memberId), stranger.memberId)).toBeNull();
  });

  it('refuses a member who has left the cohort', async () => {
    const { cohort } = await createTestCohort();
    const me = await createTestMember(cohort.id);
    const gone = await createTestMember(cohort.id);

    await db
      .update(schema.cohortMembers)
      .set({ status: 'left' })
      .where(eq(schema.cohortMembers.id, gone.memberId));

    expect(await getPeerGrove(contextFor(cohort, me.memberId), gone.memberId)).toBeNull();
  });
});
