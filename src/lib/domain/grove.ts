/**
 * The Grove — a Pomodoro round that plants a tree.
 *
 * The scoring system already answers "did you do the work today?". It cannot answer the
 * question a student actually struggles with at 9pm with a phone in reach: *stay in this
 * chair for the next twenty-five minutes*. The grove is that second layer, and it is
 * deliberately not a second currency:
 *
 *   - A round is a contract. You name a length, a sapling goes in the ground, and it only
 *     becomes a tree if you sit the whole length out. Leaving early kills it.
 *   - A killed tree is *kept*. The grove shows withered stumps next to grown trees, because
 *     a forest that quietly deletes your failures cannot hold you to anything. This mirrors
 *     how the rest of the product already treats a too-short study block.
 *   - Nothing here pays XP. Points come from the study block and the check-in, as before.
 *     The tree is the reward, and keeping the two economies separate means a student can
 *     never farm the ledger by starting timers.
 *
 * Everything in this module is a pure function of numbers and dates, so that the server
 * (which decides whether a tree survived) and the browser (which draws it growing) reach the
 * same answer from the same inputs.
 */

import type { ISODate } from './calendar';

/* ------------------------------------------------------------------ presets */

export type FocusPresetKey = 'classic' | 'deep' | 'marathon';

export type FocusPreset = {
  key: FocusPresetKey;
  label: string;
  /** Minutes of unbroken focus in one round. */
  focusMinutes: number;
  /** The short break offered after a round. */
  breakMinutes: number;
  /** Rounds before the preset suggests a longer stop. */
  roundsBeforeLongBreak: number;
  longBreakMinutes: number;
  blurb: string;
};

export const FOCUS_PRESETS: readonly FocusPreset[] = [
  {
    key: 'classic',
    label: 'Classic',
    focusMinutes: 25,
    breakMinutes: 5,
    roundsBeforeLongBreak: 4,
    longBreakMinutes: 15,
    blurb: '25 on, 5 off. The default when your attention is fragile.',
  },
  {
    key: 'deep',
    label: 'Deep',
    focusMinutes: 50,
    breakMinutes: 10,
    roundsBeforeLongBreak: 3,
    longBreakMinutes: 20,
    blurb: '50 on, 10 off. Long enough to get properly into a chapter.',
  },
  {
    key: 'marathon',
    label: 'Marathon',
    focusMinutes: 90,
    breakMinutes: 20,
    roundsBeforeLongBreak: 2,
    longBreakMinutes: 30,
    blurb: '90 on, 20 off. One round is a whole study block.',
  },
];

export const DEFAULT_PRESET: FocusPresetKey = 'classic';

export function presetByKey(key: string | null | undefined): FocusPreset {
  return FOCUS_PRESETS.find((p) => p.key === key) ?? FOCUS_PRESETS[0]!;
}

/** The break that follows a round: longer every `roundsBeforeLongBreak` rounds. */
export function breakAfterRound(preset: FocusPreset, roundNumber: number): number {
  if (roundNumber > 0 && roundNumber % preset.roundsBeforeLongBreak === 0) {
    return preset.longBreakMinutes;
  }
  return preset.breakMinutes;
}

/* ----------------------------------------------------------------- species */

/**
 * What grows is decided by how long you committed to, not by how long you managed. A
 * fifty-minute round always plants a banyan; quitting it leaves a banyan-sized stump. Tying
 * the species to the promise rather than the outcome is what makes the stump legible.
 */
export type TreeSpecies = 'sprout' | 'fern' | 'neem' | 'banyan' | 'deodar';

export const SPECIES_NAMES: Record<TreeSpecies, string> = {
  sprout: 'Sprout',
  fern: 'Fern',
  neem: 'Neem',
  banyan: 'Banyan',
  deodar: 'Deodar',
};

export function speciesFor(focusMinutes: number): TreeSpecies {
  if (focusMinutes < 15) return 'sprout';
  if (focusMinutes < 25) return 'fern';
  if (focusMinutes < 50) return 'neem';
  if (focusMinutes < 90) return 'banyan';
  return 'deodar';
}

/* ------------------------------------------------------------------ growth */

/** How many drawing stages a round passes through. 0 = bare soil, 4 = full tree. */
export const GROWTH_STAGES = 5;

export function growthStage(progress: number): number {
  const p = Math.min(1, Math.max(0, progress));
  // Held one stage short until the round genuinely completes: a tree that looks finished at
  // 97% invites the student to stop forty seconds early, which is exactly the habit this is
  // meant to break.
  if (p >= 1) return GROWTH_STAGES - 1;
  return Math.min(GROWTH_STAGES - 2, Math.floor(p * (GROWTH_STAGES - 1)));
}

/* --------------------------------------------------------------- the rules */

/**
 * How long you may be away from the tab before the tree dies.
 *
 * Forest can be absolute about this because it owns the phone. A browser tab cannot: a
 * notification or a misfired alt-tab would otherwise read as quitting. Twenty seconds is long
 * enough to dismiss an interruption and too short to go and read something else.
 *
 * A locked screen is not "away" and never starts this clock — the study screen decides which
 * of the two a hidden page is before it arms anything.
 */
export const AWAY_GRACE_SECONDS = 20;

/**
 * Slack allowed when checking a finished round against the wall clock.
 *
 * The browser asks the server to grow the tree the instant its own countdown hits zero, and
 * the two clocks are never exactly aligned. This absorbs the difference without opening a
 * hole big enough to matter.
 */
export const GROWTH_TOLERANCE_SECONDS = 5;

/**
 * A tree still growing this long past its due time is treated as abandoned.
 *
 * Wide on purpose. The common way to sit out a round is to put the phone face down, which
 * means the browser is frozen when the countdown runs out and cannot claim the tree until
 * the student picks the phone back up. Ten minutes covers "the round ended, I finished my
 * paragraph, then I looked at my phone" without covering "I went to dinner".
 */
export const ABANDON_SWEEP_SECONDS = 600;

export type WitherReason = 'left' | 'gave_up' | 'abandoned';

export const WITHER_REASONS: Record<WitherReason, string> = {
  left: 'Left the session',
  gave_up: 'Gave up early',
  abandoned: 'Never came back',
};

/**
 * Did this round genuinely run its full length?
 *
 * Decided from the two server timestamps only. The browser's countdown is a drawing, not
 * evidence — the same rule the study block already applies to its elapsed seconds.
 */
export function hasRunFullRound(input: {
  plantedAt: Date;
  focusMinutes: number;
  now?: Date;
}): boolean {
  const now = input.now ?? new Date();
  const elapsed = (now.getTime() - input.plantedAt.getTime()) / 1000;
  return elapsed >= input.focusMinutes * 60 - GROWTH_TOLERANCE_SECONDS;
}

/** True once a still-growing tree is so overdue that nobody can still be sitting with it. */
export function isAbandoned(input: { plantedAt: Date; focusMinutes: number; now?: Date }): boolean {
  const now = input.now ?? new Date();
  const elapsed = (now.getTime() - input.plantedAt.getTime()) / 1000;
  return elapsed > input.focusMinutes * 60 + ABANDON_SWEEP_SECONDS;
}

/* ------------------------------------------------------------------ groves */

export type TreeStatus = 'growing' | 'grown' | 'withered';

export type TreeRecord = {
  id: string;
  date: ISODate;
  status: TreeStatus;
  species: TreeSpecies;
  focusMinutes: number;
  /** Minutes actually sat through. Equals `focusMinutes` for a grown tree. */
  earnedMinutes: number;
  witherReason: WitherReason | null;
};

export type GroveStats = {
  grown: number;
  withered: number;
  /** Focus minutes from grown trees only. A withered round bought you nothing. */
  focusMinutes: number;
  /** Grown as a percentage of everything planted. 100 when nothing has been planted. */
  survivalPct: number;
  /** The best single day, in grown trees. */
  bestDay: { date: ISODate; trees: number } | null;
};

export function groveStats(trees: readonly TreeRecord[]): GroveStats {
  let grown = 0;
  let withered = 0;
  let focusMinutes = 0;
  const perDay = new Map<ISODate, number>();

  for (const tree of trees) {
    if (tree.status === 'grown') {
      grown += 1;
      focusMinutes += tree.earnedMinutes;
      perDay.set(tree.date, (perDay.get(tree.date) ?? 0) + 1);
    } else if (tree.status === 'withered') {
      withered += 1;
    }
  }

  let bestDay: GroveStats['bestDay'] = null;
  for (const [date, trees_] of perDay) {
    // Ties go to the earlier day, so the record does not shuffle about as the term goes on.
    if (!bestDay || trees_ > bestDay.trees || (trees_ === bestDay.trees && date < bestDay.date)) {
      bestDay = { date, trees: trees_ };
    }
  }

  const planted = grown + withered;
  return {
    grown,
    withered,
    focusMinutes,
    survivalPct: planted === 0 ? 100 : Math.round((grown / planted) * 100),
    bestDay,
  };
}

/**
 * Consecutive days ending today (or yesterday) on which at least one tree survived.
 *
 * Unlike the cohort streak this counts plain calendar days and ignores holidays: the grove is
 * a personal habit rather than a cohort obligation, and a student who plants a tree on a rest
 * day should not be told it did not count.
 */
export function plantingStreak(days: readonly ISODate[], today: ISODate): number {
  const set = new Set(days);
  if (set.size === 0) return 0;

  const cursor = new Date(`${today}T00:00:00Z`);
  if (Number.isNaN(cursor.getTime())) return 0;

  // A day that is still in progress must not break the run, so start counting from yesterday
  // when nothing has been planted yet today.
  if (!set.has(today)) cursor.setUTCDate(cursor.getUTCDate() - 1);

  let streak = 0;
  for (;;) {
    const key = cursor.toISOString().slice(0, 10);
    if (!set.has(key)) break;
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

/** `1h 25m`, `45m`, `0m` — for grove totals, which are usually hours. */
export function formatFocusMinutes(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total}m`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
