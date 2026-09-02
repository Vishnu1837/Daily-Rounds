import 'server-only';

import { and, desc, eq, gte, sql } from 'drizzle-orm';

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
  /** The cohort membership, so the card can link straight to that student's grove. */
  memberId: string;
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
      memberId: c.memberId,
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

/* ------------------------------------------------------------ the cohort */

/** Grown trees, broken down by species. Withered rounds never appear in a cohort view. */
export type SpeciesCounts = Record<TreeRecord['species'], number>;

export type CohortGroveRow = {
  memberId: string;
  name: string;
  avatarUrl: string | null;
  /** Grown trees, all time. */
  trees: number;
  species: SpeciesCounts;
  /** Minutes of verified focus — the sum of the promised lengths of grown rounds only. */
  focusMinutes: number;
  /** The most recent day this student grew something, or null if they never have. */
  lastPlantedOn: ISODate | null;
  isYou: boolean;
};

const EMPTY_SPECIES: SpeciesCounts = {
  sprout: 0,
  fern: 0,
  neem: 0,
  banyan: 0,
  deodar: 0,
};

/**
 * Every student in the cohort, with what their grove adds up to.
 *
 * Two rules are enforced here rather than in the screen, because a screen is not a security
 * boundary:
 *
 *  - Only members of the caller's own cohort are selected. There is no parameter that could
 *    widen it, so no request can ask for another cohort's groves.
 *  - Only `grown` rows are counted, and the projection carries no email, phone number or
 *    anything else private — a name and a picture are all a peer ever sees.
 *
 * The totals are read from `focus_trees` itself, not from any cached counter, so a round
 * that completed a second ago is included the next time this page is rendered.
 */
export async function getCohortGroves(
  /**
   * A member's own context, or a bare cohort — the admin console has no membership and no
   * grove of its own, but a cohort lead still needs to see the wall their students see.
   */
  ctx: MemberContext | { cohort: { id: string }; memberId?: null },
): Promise<CohortGroveRow[]> {
  const viewerId = 'memberId' in ctx ? (ctx.memberId ?? null) : null;
  const rows = await db
    .select({
      memberId: cohortMembers.id,
      name: users.fullName,
      avatarUrl: users.avatarUrl,
      trees: sql<number>`count(${focusTrees.id})::int`,
      focusMinutes: sql<number>`coalesce(sum(${focusTrees.focusMinutes}), 0)::int`,
      lastPlantedOn: sql<ISODate | null>`max(${focusTrees.date})`,
      sprout: sql<number>`count(*) FILTER (WHERE ${focusTrees.species} = 'sprout')::int`,
      fern: sql<number>`count(*) FILTER (WHERE ${focusTrees.species} = 'fern')::int`,
      neem: sql<number>`count(*) FILTER (WHERE ${focusTrees.species} = 'neem')::int`,
      banyan: sql<number>`count(*) FILTER (WHERE ${focusTrees.species} = 'banyan')::int`,
      deodar: sql<number>`count(*) FILTER (WHERE ${focusTrees.species} = 'deodar')::int`,
    })
    .from(cohortMembers)
    .innerJoin(users, eq(users.id, cohortMembers.userId))
    /*
     * A left join, so a student who has never planted anything still appears with a bare
     * plot. Hiding them would turn the page into a leaderboard of the people already doing
     * well, which is the opposite of what an accountability wall is for.
     */
    .leftJoin(
      focusTrees,
      and(eq(focusTrees.memberId, cohortMembers.id), eq(focusTrees.status, 'grown')),
    )
    .where(and(eq(cohortMembers.cohortId, ctx.cohort.id), eq(cohortMembers.status, 'active')))
    .groupBy(cohortMembers.id, users.fullName, users.avatarUrl);

  return rows
    .map((row) => ({
      memberId: row.memberId,
      name: row.name,
      avatarUrl: row.avatarUrl,
      trees: row.trees,
      species: {
        sprout: row.sprout,
        fern: row.fern,
        neem: row.neem,
        banyan: row.banyan,
        deodar: row.deodar,
      },
      focusMinutes: row.focusMinutes,
      lastPlantedOn: row.lastPlantedOn ?? null,
      isYou: row.memberId === viewerId,
    }))
    .sort((a, b) => b.trees - a.trees || a.name.localeCompare(b.name));
}

export type PeerGrove = {
  memberId: string;
  name: string;
  avatarUrl: string | null;
  isYou: boolean;
  trees: number;
  species: SpeciesCounts;
  focusMinutes: number;
  streak: number;
  /** Oldest first, one entry per day of the same fortnight the student's own grove shows. */
  days: GroveDay[];
  /** Today's grown trees, oldest first — the plot as it stands right now. */
  todayTrees: { id: string; species: TreeRecord['species']; focusMinutes: number }[];
  lastPlantedOn: ISODate | null;
};

/**
 * One classmate's grove, read-only.
 *
 * Returns null — never a partial view — when the member is not an active student in the
 * caller's own cohort. That check is the whole authorization story for this screen, and it
 * lives on the query rather than the page so no future caller can skip it.
 *
 * Withered rounds are excluded even though the owner sees their own. The grove already
 * makes that distinction deliberately: a failure you look at is a correction, and a failure
 * the whole cohort watches is just a punishment.
 */
export async function getPeerGrove(
  ctx: MemberContext,
  memberId: string,
): Promise<PeerGrove | null> {
  const [member] = await db
    .select({
      memberId: cohortMembers.id,
      name: users.fullName,
      avatarUrl: users.avatarUrl,
    })
    .from(cohortMembers)
    .innerJoin(users, eq(users.id, cohortMembers.userId))
    .where(
      and(
        eq(cohortMembers.id, memberId),
        eq(cohortMembers.cohortId, ctx.cohort.id),
        eq(cohortMembers.status, 'active'),
      ),
    )
    .limit(1);

  if (!member) return null;

  const since = addDays(ctx.today, -(HISTORY_DAYS - 1));

  const [allGrown, recent] = await Promise.all([
    db
      .select({
        species: focusTrees.species,
        focusMinutes: focusTrees.focusMinutes,
        date: focusTrees.date,
      })
      .from(focusTrees)
      .where(and(eq(focusTrees.memberId, memberId), eq(focusTrees.status, 'grown'))),
    db
      .select({
        id: focusTrees.id,
        species: focusTrees.species,
        focusMinutes: focusTrees.focusMinutes,
        date: focusTrees.date,
        plantedAt: focusTrees.plantedAt,
      })
      .from(focusTrees)
      .where(
        and(
          eq(focusTrees.memberId, memberId),
          eq(focusTrees.status, 'grown'),
          gte(focusTrees.date, since),
        ),
      )
      .orderBy(focusTrees.plantedAt),
  ]);

  const species = { ...EMPTY_SPECIES };
  let focusMinutes = 0;
  let lastPlantedOn: ISODate | null = null;
  for (const tree of allGrown) {
    species[tree.species] += 1;
    focusMinutes += tree.focusMinutes;
    if (!lastPlantedOn || tree.date > lastPlantedOn) lastPlantedOn = tree.date;
  }

  const byDay = new Map<ISODate, GroveDay>();
  for (const date of datesBetween(since, ctx.today)) {
    byDay.set(date, { date, grown: 0, withered: 0, focusMinutes: 0 });
  }
  for (const tree of recent) {
    const day = byDay.get(tree.date);
    if (!day) continue;
    day.grown += 1;
    day.focusMinutes += tree.focusMinutes;
  }

  return {
    memberId: member.memberId,
    name: member.name,
    avatarUrl: member.avatarUrl,
    isYou: member.memberId === ctx.memberId,
    trees: allGrown.length,
    species,
    focusMinutes,
    streak: plantingStreak(
      allGrown.map((t) => t.date),
      ctx.today,
    ),
    days: [...byDay.values()],
    todayTrees: recent
      .filter((t) => t.date === ctx.today)
      .map((t) => ({ id: t.id, species: t.species, focusMinutes: t.focusMinutes })),
    lastPlantedOn,
  };
}
