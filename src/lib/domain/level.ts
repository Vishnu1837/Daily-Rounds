/**
 * Levels and ranks.
 *
 * This is a *presentation* layer over the points ledger, not a second currency. XP is
 * simply the student's lifetime point total, so a level can never disagree with the ledger
 * and there is nothing extra to store, migrate or keep in sync. Everything here is a pure
 * function of a number that already exists.
 *
 * The curve is deliberately front-loaded: the first two levels arrive inside the first
 * week, because the moment a habit product is most likely to lose someone is day three. It
 * then stretches out, so a level in the back half of a cohort still means something.
 */

export type Rank = {
  /** Clinical progression, so the ladder means something to a medical student. */
  title: string;
  /** Which accent the rank paints with. */
  tone: 'ink' | 'pulse' | 'iris' | 'flame' | 'citrus';
};

export type LevelInfo = {
  level: number;
  rank: Rank;
  /** Lifetime points. Identical to XP — there is only ever one number. */
  xp: number;
  /** XP at which this level began. */
  floor: number;
  /** XP at which the next level begins, or null once the ladder is topped out. */
  nextAt: number | null;
  /** XP earned inside the current level. */
  into: number;
  /** XP the current level spans. Never zero, so callers can divide safely. */
  span: number;
  /** Progress through the current level, 0–100. 100 at the top of the ladder. */
  pct: number;
  /** XP still needed for the next level, or null at the top. */
  remaining: number | null;
};

const RANKS: readonly Rank[] = [
  { title: 'Observer', tone: 'ink' },
  { title: 'Intern', tone: 'ink' },
  { title: 'Junior Resident', tone: 'pulse' },
  { title: 'Resident', tone: 'pulse' },
  { title: 'Senior Resident', tone: 'iris' },
  { title: 'Registrar', tone: 'iris' },
  { title: 'Senior Registrar', tone: 'iris' },
  { title: 'Chief Resident', tone: 'flame' },
  { title: 'Attending', tone: 'flame' },
  { title: 'Consultant', tone: 'citrus' },
] as const;

/**
 * Cumulative XP required to *enter* each level, level 1 being the entry point.
 *
 * Written out rather than computed so the curve is reviewable at a glance and a designer
 * can retune a single step without reasoning about an exponent.
 */
const THRESHOLDS = [
  0, 120, 320, 640, 1100, 1750, 2600, 3700, 5100, 6800, 8900, 11400, 14400, 17900, 22000,
] as const;

/** Past the table, levels cost a flat amount so the ladder never ends. */
const OVERFLOW_STEP = 5000;

function thresholdFor(level: number): number {
  if (level <= 0) return 0;
  const indexed = THRESHOLDS[level - 1];
  if (indexed !== undefined) return indexed;
  const last = THRESHOLDS[THRESHOLDS.length - 1]!;
  return last + (level - THRESHOLDS.length) * OVERFLOW_STEP;
}

export function rankFor(level: number): Rank {
  // The rank ladder is shorter than the level ladder, so high levels keep the top rank.
  const index = Math.min(RANKS.length - 1, Math.max(0, Math.floor((level - 1) / 2)));
  return RANKS[index]!;
}

/**
 * Everything a level UI needs, from a single lifetime point total.
 *
 * Negative or non-finite input is clamped rather than rejected: an admin correction can in
 * principle push a total below zero, and a student seeing "Level 1, 0 XP" is much better
 * than a screen that throws.
 */
export function levelFromPoints(points: number): LevelInfo {
  const xp = Number.isFinite(points) ? Math.max(0, Math.floor(points)) : 0;

  let level = 1;
  while (xp >= thresholdFor(level + 1)) level += 1;

  const floor = thresholdFor(level);
  const nextAt = thresholdFor(level + 1);
  const span = Math.max(1, nextAt - floor);
  const into = xp - floor;

  return {
    level,
    rank: rankFor(level),
    xp,
    floor,
    nextAt,
    into,
    span,
    pct: Math.max(0, Math.min(100, Math.round((into / span) * 100))),
    remaining: Math.max(0, nextAt - xp),
  };
}

/**
 * League bands for the leaderboard.
 *
 * Banded by consistency rather than points on purpose: points scale with how long someone
 * has been in the cohort, so ranking by them would quietly reward seniority. Consistency is
 * a rate, which means a student who joins in week four can still reach the top band.
 */
export type League = {
  key: 'diamond' | 'gold' | 'silver' | 'bronze' | 'starting';
  label: string;
  /** Inclusive lower bound of the band, in consistency percent. */
  min: number;
  tone: 'pulse' | 'flame' | 'iris' | 'ink';
};

export const LEAGUES: readonly League[] = [
  { key: 'diamond', label: 'Diamond', min: 90, tone: 'pulse' },
  { key: 'gold', label: 'Gold', min: 75, tone: 'flame' },
  { key: 'silver', label: 'Silver', min: 55, tone: 'iris' },
  { key: 'bronze', label: 'Bronze', min: 30, tone: 'ink' },
  { key: 'starting', label: 'Getting started', min: 0, tone: 'ink' },
] as const;

export function leagueFor(consistencyPct: number): League {
  const pct = Number.isFinite(consistencyPct) ? consistencyPct : 0;
  return LEAGUES.find((l) => pct >= l.min) ?? LEAGUES[LEAGUES.length - 1]!;
}

/** The next band up, and how many points of consistency away it is. Null in Diamond. */
export function nextLeague(consistencyPct: number): { league: League; gap: number } | null {
  const pct = Number.isFinite(consistencyPct) ? consistencyPct : 0;
  const currentIndex = LEAGUES.findIndex((l) => pct >= l.min);
  const index = currentIndex === -1 ? LEAGUES.length - 1 : currentIndex;
  if (index === 0) return null;
  const league = LEAGUES[index - 1]!;
  return { league, gap: Math.max(1, Math.ceil(league.min - pct)) };
}
