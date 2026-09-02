import 'server-only';

import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { cohortMembers, focusTrees, users } from '@/db/schema';
import { type ISODate, addDays, datesBetween } from '@/lib/domain/calendar';
import {
  type TreeRecord,
  type WitherReason,
  groveStats,
  plantingStreak,
  presetByKey,
} from '@/lib/domain/grove';
import type { MemberContext } from '@/server/context';
import { sweepAbandonedTrees } from '@/server/grove';

/**
 * How far back the grove goes.
 *
 * A fortnight, so the whole wall fits on one screen without scrolling. A longer window looked
 * more impressive and read worse: half of it sat off the edge of the card, which meant the
 * columns a student actually needed — the last few days — were the ones they could not see.
 */
const HISTORY_DAYS = 14;

export type GroveDay = {
  date: ISODate;
  grown: number;
  withered: number;
  focusMinutes: number;
};

export type LiveTree = {
  id: string;
  preset: string;
  focusMinutes: number;
  species: TreeRecord['species'];
  plantedAt: string;
  dueAt: string;
};

export type CohortPlanter = {
  name: string;
  avatarUrl: string | null;
  trees: number;
  /** True for the student looking at the screen. */
  isYou: boolean;
};

export type GroveData = {
  today: TreeRecord[];
  /** Every settled round in the window, newest first. Drives the withered log. */
  recent: TreeRecord[];
  /** Oldest first, one entry per calendar day, including empty ones. */
  days: GroveDay[];
  stats: ReturnType<typeof groveStats>;
  streak: number;
  /** A round still running — the study screen resumes it rather than starting a new one. */
  live: LiveTree | null;
  cohort: {
    treesToday: number;
    studentsPlantingToday: number;
    /** Today's planters, most trees first. Capped for the card. */
    top: CohortPlanter[];
  };
};

/**
 * Everything the grove screen needs, plus the live round.
 *
 * Reads settle the student's own abandoned rounds first (see `sweepAbandonedTrees`), so the
 * grove can never show a tree that has been "growing" since last Tuesday.
 */
export async function getGroveData(ctx: MemberContext): Promise<GroveData> {
  const since = addDays(ctx.today, -(HISTORY_DAYS - 1));

  /*
   * The sweep only ever moves this student's own rows from `growing` to `withered`, and the
   * cohort card counts `grown` rows across everyone else — so the two cannot affect each
   * other and there is no reason for the cohort read to wait behind the write.
   */
  const [, cohortRows] = await Promise.all([
    sweepAbandonedTrees(ctx.memberId),
    cohortPlantersToday(ctx),
  ]);

  const [rows, live] = await Promise.all([
    db
      .select()
      .from(focusTrees)
      .where(and(eq(focusTrees.memberId, ctx.memberId), gte(focusTrees.date, since)))
      .orderBy(desc(focusTrees.plantedAt)),
    db
      .select()
      .from(focusTrees)
      .where(and(eq(focusTrees.memberId, ctx.memberId), eq(focusTrees.status, 'growing')))
      .orderBy(desc(focusTrees.plantedAt))
      .limit(1),
  ]);

  const trees = rows.map(toRecord);

  const byDay = new Map<ISODate, GroveDay>();
  for (const date of datesBetween(since, ctx.today)) {
    byDay.set(date, { date, grown: 0, withered: 0, focusMinutes: 0 });
  }
  for (const tree of trees) {
    const day = byDay.get(tree.date);
    if (!day) continue;
    if (tree.status === 'grown') {
      day.grown += 1;
      day.focusMinutes += tree.earnedMinutes;
    } else if (tree.status === 'withered') {
      day.withered += 1;
    }
  }

  const plantedDays = trees.filter((t) => t.status === 'grown').map((t) => t.date);

  return {
    // Oldest first for the plot, so the strip reads left to right as the day went.
    today: trees.filter((t) => t.date === ctx.today && t.status !== 'growing').reverse(),
    recent: trees.filter((t) => t.status !== 'growing'),
    days: [...byDay.values()],
    stats: groveStats(trees),
    streak: plantingStreak(plantedDays, ctx.today),
    live: live[0] ? toLive(live[0]) : null,
    cohort: cohortRows,
  };
}

/**
 * Who else in the cohort has grown a tree today.
 *
 * This is the accountability half of the feature. A grove that only ever shows your own
 * trees is a private toy; seeing that four people have already planted this morning is what
 * makes an empty patch of soil uncomfortable. Only grown trees appear here — nobody's
 * withered rounds are published to the cohort, because a failure shown to yourself is a
 * correction and a failure shown to everyone else is just a punishment.
 */
async function cohortPlantersToday(ctx: MemberContext): Promise<GroveData['cohort']> {
  /*
   * One grouped join rather than "fetch the roster, then count against it".
   *
   * Only members who actually grew something today can appear here, so joining the counts
   * to the roster inside the database returns exactly the rows this card renders — and
   * saves the round trip that fetching the roster first cost, on a screen where it was a
   * third of the total time.
   */
  const counts = await db
    .select({
      memberId: focusTrees.memberId,
      name: users.fullName,
      avatarUrl: users.avatarUrl,
      trees: sql<number>`count(*)::int`,
    })
    .from(focusTrees)
    .innerJoin(cohortMembers, eq(cohortMembers.id, focusTrees.memberId))
    .innerJoin(users, eq(users.id, cohortMembers.userId))
    .where(
      and(
        eq(cohortMembers.cohortId, ctx.cohort.id),
        eq(cohortMembers.status, 'active'),
        eq(focusTrees.date, ctx.today),
        eq(focusTrees.status, 'grown'),
      ),
    )
    .groupBy(focusTrees.memberId, users.fullName, users.avatarUrl);

  const top = counts
    .map((c) => ({
      name: c.name,
      avatarUrl: c.avatarUrl,
      trees: c.trees,
      isYou: c.memberId === ctx.memberId,
    }))
    .sort((a, b) => b.trees - a.trees || a.name.localeCompare(b.name))
    .slice(0, 6);

  return {
    treesToday: counts.reduce((sum, c) => sum + c.trees, 0),
    studentsPlantingToday: counts.length,
    top,
  };
}

export type StudyGrove = {
  live: LiveTree | null;
  /** Today's plot, oldest first — the strip of trees under the timer. */
  todayTrees: { id: string; species: TreeRecord['species']; status: TreeRecord['status'] }[];
  streak: number;
};

/** The small slice the study screen needs before it draws its first frame. */
export async function getStudyGrove(ctx: MemberContext): Promise<StudyGrove> {
  await sweepAbandonedTrees(ctx.memberId);

  const since = addDays(ctx.today, -(HISTORY_DAYS - 1));
  const [todayRows, historyRows, live] = await Promise.all([
    db
      .select({ id: focusTrees.id, species: focusTrees.species, status: focusTrees.status })
      .from(focusTrees)
      .where(and(eq(focusTrees.memberId, ctx.memberId), eq(focusTrees.date, ctx.today)))
      .orderBy(focusTrees.plantedAt),
    db
      .select({ date: focusTrees.date })
      .from(focusTrees)
      .where(
        and(
          eq(focusTrees.memberId, ctx.memberId),
          eq(focusTrees.status, 'grown'),
          gte(focusTrees.date, since),
        ),
      ),
    db
      .select()
      .from(focusTrees)
      .where(and(eq(focusTrees.memberId, ctx.memberId), eq(focusTrees.status, 'growing')))
      .orderBy(desc(focusTrees.plantedAt))
      .limit(1),
  ]);

  return {
    live: live[0] ? toLive(live[0]) : null,
    // The round still in the ground is not part of the plot yet — it has not survived.
    todayTrees: todayRows.filter((r) => r.status !== 'growing'),
    streak: plantingStreak(
      historyRows.map((r) => r.date),
      ctx.today,
    ),
  };
}

function toRecord(row: typeof focusTrees.$inferSelect): TreeRecord {
  return {
    id: row.id,
    date: row.date,
    status: row.status,
    species: row.species,
    focusMinutes: row.focusMinutes,
    // A withered round earns nothing. The minutes sat before quitting are deliberately not
    // credited: partial credit for a broken promise is what makes a promise cheap.
    earnedMinutes: row.status === 'grown' ? row.focusMinutes : 0,
    witherReason: (row.witherReason as WitherReason | null) ?? null,
  };
}

function toLive(row: typeof focusTrees.$inferSelect): LiveTree {
  return {
    id: row.id,
    preset: presetByKey(row.preset).key,
    focusMinutes: row.focusMinutes,
    species: row.species,
    plantedAt: row.plantedAt.toISOString(),
    dueAt: row.dueAt.toISOString(),
  };
}
