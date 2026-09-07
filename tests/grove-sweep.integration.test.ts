import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { SWEEP_DELAY_SECONDS } from '@/lib/domain/grove';
import { settleOverdueTrees } from '@/server/grove';

import { createTestCohort, createTestMember, db, schema } from './helpers/db';

/**
 * The grove sweep, against a real database.
 *
 * The audit found roughly 60 of 86 stumps were produced by the sweep rather than by any
 * student: it withered every overdue `growing` row on the theory that a browser which had
 * gone quiet had walked away. The tests below pin the replacement rule — a round whose
 * promised interval has elapsed on the server's clock is *grown* — and the two properties
 * that make it safe to run from both the lazy read path and a scheduled job: it never
 * touches a round that is still legitimately running, and running it twice changes nothing
 * the second time.
 */

const TODAY = '2025-09-10';
const MINUTE = 60_000;

async function plant(
  memberId: string,
  opts: { focusMinutes: number; plantedMinutesAgo: number; status?: 'growing' | 'withered' },
) {
  const plantedAt = new Date(Date.now() - opts.plantedMinutesAgo * MINUTE);
  const [row] = await db
    .insert(schema.focusTrees)
    .values({
      memberId,
      date: TODAY,
      preset: 'classic',
      focusMinutes: opts.focusMinutes,
      species: 'neem',
      status: opts.status ?? 'growing',
      plantedAt,
      dueAt: new Date(plantedAt.getTime() + opts.focusMinutes * MINUTE),
    })
    .returning();
  return row!;
}

const reload = async (id: string) =>
  (await db.select().from(schema.focusTrees).where(eq(schema.focusTrees.id, id)).limit(1))[0]!;

/** Comfortably past `due_at + SWEEP_DELAY_SECONDS` for a 25-minute round. */
const LONG_AGO = 25 + SWEEP_DELAY_SECONDS / 60 + 5;

describe('settleOverdueTrees', () => {
  it('grows a round the student sat through with the browser asleep', async () => {
    const { cohort } = await createTestCohort();
    const { memberId } = await createTestMember(cohort.id);
    const tree = await plant(memberId, { focusMinutes: 25, plantedMinutesAgo: LONG_AGO });

    expect(await settleOverdueTrees(memberId)).toBe(1);

    const settled = await reload(tree.id);
    expect(settled.status).toBe('grown');
    expect(settled.witherReason).toBeNull();
    expect(settled.settledAt).not.toBeNull();
  });

  it('never withers: an overdue round has no losing outcome', async () => {
    const { cohort } = await createTestCohort();
    const { memberId } = await createTestMember(cohort.id);
    await plant(memberId, { focusMinutes: 25, plantedMinutesAgo: LONG_AGO });
    await plant(memberId, { focusMinutes: 90, plantedMinutesAgo: 90 + 400 });

    await settleOverdueTrees(memberId);

    const rows = await db
      .select({ status: schema.focusTrees.status })
      .from(schema.focusTrees)
      .where(eq(schema.focusTrees.memberId, memberId));
    expect(rows.map((r) => r.status)).toEqual(['grown', 'grown']);
  });

  it('leaves a round that is still running alone', async () => {
    const { cohort } = await createTestCohort();
    const { memberId } = await createTestMember(cohort.id);
    const tree = await plant(memberId, { focusMinutes: 25, plantedMinutesAgo: 5 });

    expect(await settleOverdueTrees(memberId)).toBe(0);
    expect((await reload(tree.id)).status).toBe('growing');
  });

  it('leaves a just-finished round to the browser for the length of the delay', async () => {
    const { cohort } = await createTestCohort();
    const { memberId } = await createTestMember(cohort.id);
    // Due a minute ago — finished, but the tab still has its window to claim it and fire
    // its own celebration.
    const tree = await plant(memberId, { focusMinutes: 25, plantedMinutesAgo: 26 });

    expect(await settleOverdueTrees(memberId)).toBe(0);
    expect((await reload(tree.id)).status).toBe('growing');
  });

  it('is idempotent: a second sweep settles nothing', async () => {
    const { cohort } = await createTestCohort();
    const { memberId } = await createTestMember(cohort.id);
    await plant(memberId, { focusMinutes: 25, plantedMinutesAgo: LONG_AGO });

    expect(await settleOverdueTrees(memberId)).toBe(1);
    expect(await settleOverdueTrees(memberId)).toBe(0);
    expect(await settleOverdueTrees(memberId)).toBe(0);
  });

  it('never revives a stump the student earned by quitting', async () => {
    const { cohort } = await createTestCohort();
    const { memberId } = await createTestMember(cohort.id);
    const [quit] = await db
      .insert(schema.focusTrees)
      .values({
        memberId,
        date: TODAY,
        preset: 'classic',
        focusMinutes: 25,
        species: 'neem',
        status: 'withered',
        witherReason: 'gave_up',
        plantedAt: new Date(Date.now() - LONG_AGO * MINUTE),
        dueAt: new Date(Date.now() - (LONG_AGO - 25) * MINUTE),
        settledAt: new Date(),
      })
      .returning();

    expect(await settleOverdueTrees(memberId)).toBe(0);
    expect((await reload(quit!.id)).status).toBe('withered');
  });

  it('scoped to one member, leaves everyone else untouched', async () => {
    const { cohort } = await createTestCohort();
    const mine = await createTestMember(cohort.id);
    const theirs = await createTestMember(cohort.id);
    await plant(mine.memberId, { focusMinutes: 25, plantedMinutesAgo: LONG_AGO });
    const other = await plant(theirs.memberId, { focusMinutes: 25, plantedMinutesAgo: LONG_AGO });

    expect(await settleOverdueTrees(mine.memberId)).toBe(1);
    expect((await reload(other.id)).status).toBe('growing');
  });

  it('unscoped, settles the whole cohort in one pass — the scheduled sweep', async () => {
    // The only test here that sweeps globally, so it starts from an empty grove: the rows
    // the tests above deliberately left `growing` are not this one's subject.
    await db.delete(schema.focusTrees);
    const { cohort } = await createTestCohort();
    const a = await createTestMember(cohort.id);
    const b = await createTestMember(cohort.id);
    await plant(a.memberId, { focusMinutes: 25, plantedMinutesAgo: LONG_AGO });
    await plant(b.memberId, { focusMinutes: 50, plantedMinutesAgo: 50 + 400 });
    await plant(b.memberId, { focusMinutes: 25, plantedMinutesAgo: 2 });

    expect(await settleOverdueTrees()).toBe(2);

    const stillGrowing = await db
      .select({ id: schema.focusTrees.id })
      .from(schema.focusTrees)
      .where(
        and(eq(schema.focusTrees.memberId, b.memberId), eq(schema.focusTrees.status, 'growing')),
      );
    expect(stillGrowing).toHaveLength(1);
  });
});
