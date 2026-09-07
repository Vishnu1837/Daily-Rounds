import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import {
  MAX_SEGMENT_SECONDS,
  MAX_SESSION_SECONDS,
  STALE_SESSION_SECONDS,
} from '@/lib/domain/study-session';
import {
  closeStaleSessions,
  latestSweepRun,
  repairImplausibleSessions,
  runSweep,
} from '@/server/sweep';

import { createTestCohort, createTestMember, db, schema } from './helpers/db';

/**
 * The background sweep, against a real database.
 *
 * Three properties are what make it safe to schedule: it closes only blocks that have
 * genuinely gone quiet, it never takes time away from a block that is still earning, and
 * running it twice does nothing the second time.
 */

const TODAY = '2025-09-10';
const HOUR = 3600;
const ago = (seconds: number) => new Date(Date.now() - seconds * 1000);

async function session(
  memberId: string,
  opts: {
    status: 'running' | 'paused' | 'completed';
    elapsedSeconds?: number;
    resumedSecondsAgo?: number | null;
    startedSecondsAgo?: number;
  },
) {
  const [row] = await db
    .insert(schema.studySessions)
    .values({
      memberId,
      date: TODAY,
      status: opts.status,
      elapsedSeconds: opts.elapsedSeconds ?? 0,
      resumedAt: opts.resumedSecondsAgo == null ? null : ago(opts.resumedSecondsAgo),
      startedAt: ago(opts.startedSecondsAgo ?? 60),
    })
    .returning();
  return row!;
}

const reload = async (id: string) =>
  (
    await db.select().from(schema.studySessions).where(eq(schema.studySessions.id, id)).limit(1)
  )[0]!;

describe('closeStaleSessions', () => {
  it('closes a running block whose laptop was shut, at the time it had earned', async () => {
    const { cohort } = await createTestCohort();
    const { memberId } = await createTestMember(cohort.id);
    const row = await session(memberId, {
      status: 'running',
      resumedSecondsAgo: 20 * HOUR,
      startedSecondsAgo: 20 * HOUR,
    });

    expect(await closeStaleSessions(memberId)).toBe(1);

    const closed = await reload(row.id);
    expect(closed.status).toBe('abandoned');
    expect(closed.autoClosedAt).not.toBeNull();
    expect(closed.endedAt).not.toBeNull();
    expect(closed.resumedAt).toBeNull();
    // The overnight gap is not study time: the segment is capped, not banked whole.
    expect(closed.elapsedSeconds).toBe(MAX_SEGMENT_SECONDS);
    expect(closed.elapsedSeconds / 60).toBeLessThan(1173);
  });

  it('closes a long-paused block without inventing time for it', async () => {
    const { cohort } = await createTestCohort();
    const { memberId } = await createTestMember(cohort.id);
    const row = await session(memberId, {
      status: 'paused',
      elapsedSeconds: 1500,
      resumedSecondsAgo: null,
      startedSecondsAgo: STALE_SESSION_SECONDS + HOUR,
    });

    expect(await closeStaleSessions(memberId)).toBe(1);

    const closed = await reload(row.id);
    expect(closed.status).toBe('abandoned');
    // Exactly what was banked before the pause. A paused block accrues nothing.
    expect(closed.elapsedSeconds).toBe(1500);
  });

  it('leaves a block someone could still be sitting at alone', async () => {
    const { cohort } = await createTestCohort();
    const { memberId } = await createTestMember(cohort.id);
    const row = await session(memberId, {
      status: 'running',
      resumedSecondsAgo: HOUR,
      startedSecondsAgo: HOUR,
    });

    expect(await closeStaleSessions(memberId)).toBe(0);
    expect((await reload(row.id)).status).toBe('running');
  });

  it('never reopens or re-closes a block the student finished themselves', async () => {
    const { cohort } = await createTestCohort();
    const { memberId } = await createTestMember(cohort.id);
    const row = await session(memberId, {
      status: 'completed',
      elapsedSeconds: 5400,
      resumedSecondsAgo: null,
      startedSecondsAgo: 40 * HOUR,
    });

    expect(await closeStaleSessions(memberId)).toBe(0);
    const untouched = await reload(row.id);
    expect(untouched.status).toBe('completed');
    expect(untouched.autoClosedAt).toBeNull();
    expect(untouched.elapsedSeconds).toBe(5400);
  });

  it('is idempotent: a second pass closes nothing', async () => {
    const { cohort } = await createTestCohort();
    const { memberId } = await createTestMember(cohort.id);
    await session(memberId, {
      status: 'running',
      resumedSecondsAgo: 30 * HOUR,
      startedSecondsAgo: 30 * HOUR,
    });

    expect(await closeStaleSessions(memberId)).toBe(1);
    expect(await closeStaleSessions(memberId)).toBe(0);
  });

  it('scoped to one member, leaves everyone else running', async () => {
    const { cohort } = await createTestCohort();
    const mine = await createTestMember(cohort.id);
    const theirs = await createTestMember(cohort.id);
    await session(mine.memberId, {
      status: 'running',
      resumedSecondsAgo: 30 * HOUR,
      startedSecondsAgo: 30 * HOUR,
    });
    const other = await session(theirs.memberId, {
      status: 'running',
      resumedSecondsAgo: 30 * HOUR,
      startedSecondsAgo: 30 * HOUR,
    });

    expect(await closeStaleSessions(mine.memberId)).toBe(1);
    expect((await reload(other.id)).status).toBe('running');
  });
});

describe('repairImplausibleSessions', () => {
  it('is dry-run by default and writes nothing', async () => {
    await db.delete(schema.studySessions);
    const { cohort } = await createTestCohort();
    const { memberId } = await createTestMember(cohort.id);
    const row = await session(memberId, {
      status: 'completed',
      elapsedSeconds: 1173 * 60,
      resumedSecondsAgo: null,
    });

    const dry = await repairImplausibleSessions();
    expect(dry).toEqual({ found: 1, repaired: 0 });
    expect((await reload(row.id)).elapsedSeconds).toBe(1173 * 60);
  });

  it('caps the row and keeps the original, so the correction can be undone', async () => {
    await db.delete(schema.studySessions);
    const { cohort } = await createTestCohort();
    const { memberId } = await createTestMember(cohort.id);
    const row = await session(memberId, {
      status: 'completed',
      elapsedSeconds: 1173 * 60,
      resumedSecondsAgo: null,
    });

    expect(await repairImplausibleSessions({ dryRun: false })).toEqual({ found: 1, repaired: 1 });

    const fixed = await reload(row.id);
    expect(fixed.elapsedSeconds).toBe(MAX_SESSION_SECONDS);
    expect(fixed.rawElapsedSeconds).toBe(1173 * 60);
  });

  it('is idempotent: a repaired row is not repaired again', async () => {
    await db.delete(schema.studySessions);
    const { cohort } = await createTestCohort();
    const { memberId } = await createTestMember(cohort.id);
    await session(memberId, {
      status: 'completed',
      elapsedSeconds: 1173 * 60,
      resumedSecondsAgo: null,
    });

    await repairImplausibleSessions({ dryRun: false });
    expect(await repairImplausibleSessions({ dryRun: false })).toEqual({ found: 0, repaired: 0 });
  });

  it('leaves a long but possible block alone', async () => {
    await db.delete(schema.studySessions);
    const { cohort } = await createTestCohort();
    const { memberId } = await createTestMember(cohort.id);
    await session(memberId, {
      status: 'completed',
      elapsedSeconds: 8 * HOUR,
      resumedSecondsAgo: null,
    });

    expect(await repairImplausibleSessions()).toEqual({ found: 0, repaired: 0 });
  });
});

describe('runSweep', () => {
  it('records what it did, so a sweep that stops running is visible', async () => {
    await db.delete(schema.focusTrees);
    await db.delete(schema.studySessions);
    await db.delete(schema.sweepRuns);

    const { cohort } = await createTestCohort();
    const { memberId } = await createTestMember(cohort.id);

    const plantedAt = ago(2 * HOUR);
    await db.insert(schema.focusTrees).values({
      memberId,
      date: TODAY,
      preset: 'classic',
      focusMinutes: 25,
      species: 'neem',
      status: 'growing',
      plantedAt,
      dueAt: new Date(plantedAt.getTime() + 25 * 60_000),
    });
    await session(memberId, {
      status: 'running',
      resumedSecondsAgo: 30 * HOUR,
      startedSecondsAgo: 30 * HOUR,
    });

    const result = await runSweep();
    expect(result.treesGrown).toBe(1);
    expect(result.sessionsClosed).toBe(1);

    const run = await latestSweepRun();
    expect(run?.ok).toBe(true);
    expect(run?.finished).toBe(true);
    expect(run?.ageMinutes).toBe(0);
    expect(run?.affected).toEqual({ trees_grown: 1, sessions_closed: 1 });
  });

  it('a second run reports zero rather than repeating the work', async () => {
    const before = await db.select({ id: schema.sweepRuns.id }).from(schema.sweepRuns);

    const result = await runSweep();
    expect(result.treesGrown).toBe(0);
    expect(result.sessionsClosed).toBe(0);

    // A new row every time — the record is of attempts, not only of changes, which is what
    // makes "the sweep stopped running" visible at all.
    const after = await db.select({ id: schema.sweepRuns.id }).from(schema.sweepRuns);
    expect(after.length).toBe(before.length + 1);
    expect((await latestSweepRun())?.ok).toBe(true);
  });
});
