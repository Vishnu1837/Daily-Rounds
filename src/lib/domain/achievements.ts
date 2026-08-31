/**
 * Achievement engine.
 *
 * Achievements are declarative: each one is a catalog entry plus a pure predicate over an
 * evaluation context. Adding a new achievement means adding one entry to `ACHIEVEMENTS` —
 * nothing else in the app changes.
 */
import type { CohortCalendar, ISODate } from './calendar';
import { addDays, weekStart } from './calendar';
import { type DayLookup, calculateConsistency, calculateImprovement, calculateWeeklyProgress } from './consistency';
import { type ShowedUp, calculateBestStreak, calculateCurrentStreak } from './streak';

export type AchievementTier = 'bronze' | 'silver' | 'gold';

export type AchievementContext = {
  calendar: CohortCalendar;
  lookup: DayLookup;
  showedUp: ShowedUp;
  today: ISODate;
  totalCheckIns: number;
  totalStudyMinutes: number;
  quizAttempts: number;
  comebackDays: number;
};

export type AchievementDefinition = {
  code: string;
  name: string;
  description: string;
  emoji: string;
  tier: AchievementTier;
  /** Evaluated server-side after each scoring event. */
  earned: (ctx: AchievementContext) => boolean;
};

const currentStreak = (ctx: AchievementContext) =>
  calculateCurrentStreak(ctx.calendar, ctx.showedUp, ctx.today).length;

const bestStreak = (ctx: AchievementContext) =>
  calculateBestStreak(ctx.calendar, ctx.showedUp, ctx.today).length;

const anyPerfectWeek = (ctx: AchievementContext) =>
  calculateWeeklyProgress(ctx.calendar, ctx.lookup, ctx.today).some(
    (w) => w.activeDays > 0 && w.completedDays === w.activeDays,
  );

export const ACHIEVEMENTS: AchievementDefinition[] = [
  {
    code: 'first_round',
    name: 'First Round',
    description: 'Complete your first study day.',
    emoji: '🩺',
    tier: 'bronze',
    earned: (ctx) => bestStreak(ctx) >= 1,
  },
  {
    code: 'streak_3',
    name: 'Three in a Row',
    description: 'Maintain a 3-day active streak.',
    emoji: '✨',
    tier: 'bronze',
    earned: (ctx) => bestStreak(ctx) >= 3,
  },
  {
    code: 'streak_5',
    name: '5-Day Grind',
    description: 'Maintain a 5-day active streak.',
    emoji: '🔥',
    tier: 'silver',
    earned: (ctx) => bestStreak(ctx) >= 5,
  },
  {
    code: 'streak_10',
    name: '10-Day Streak',
    description: 'Maintain a 10-day active streak.',
    emoji: '🔥',
    tier: 'silver',
    earned: (ctx) => bestStreak(ctx) >= 10,
  },
  {
    code: 'streak_20',
    name: '20-Day Streak',
    description: 'Maintain a 20-day active streak.',
    emoji: '🏅',
    tier: 'gold',
    earned: (ctx) => bestStreak(ctx) >= 20,
  },
  {
    code: 'perfect_week',
    name: 'Perfect Week',
    description: 'Complete every active study day in a week.',
    emoji: '⭐',
    tier: 'gold',
    earned: anyPerfectWeek,
  },
  {
    code: 'back_on_rounds',
    name: 'Back on Rounds',
    description: 'Return the very next study day after breaking a streak.',
    emoji: '💪',
    tier: 'silver',
    earned: (ctx) => ctx.comebackDays > 0,
  },
  {
    code: 'most_improved',
    name: 'Climbing',
    description: 'Improve your weekly consistency by 15 points or more.',
    emoji: '📈',
    tier: 'silver',
    earned: (ctx) =>
      calculateImprovement(calculateWeeklyProgress(ctx.calendar, ctx.lookup, ctx.today))
        .deltaPct >= 15,
  },
  {
    code: 'ten_check_ins',
    name: 'Reliable Reporter',
    description: 'Submit 10 daily check-ins.',
    emoji: '📝',
    tier: 'bronze',
    earned: (ctx) => ctx.totalCheckIns >= 10,
  },
  {
    code: 'twenty_hours',
    name: '20 Hours Deep',
    description: 'Log 20 hours of study time.',
    emoji: '⏱️',
    tier: 'silver',
    earned: (ctx) => ctx.totalStudyMinutes >= 20 * 60,
  },
  {
    code: 'fifty_hours',
    name: '50 Hours Deep',
    description: 'Log 50 hours of study time.',
    emoji: '🧠',
    tier: 'gold',
    earned: (ctx) => ctx.totalStudyMinutes >= 50 * 60,
  },
  {
    code: 'curious_mind',
    name: 'Curious Mind',
    description: 'Attempt 5 knowledge checks.',
    emoji: '🔬',
    tier: 'bronze',
    earned: (ctx) => ctx.quizAttempts >= 5,
  },
  {
    code: 'full_fortnight',
    name: 'Full Fortnight',
    description: 'Show up for every active study day across two consecutive weeks.',
    emoji: '🏆',
    tier: 'gold',
    earned: (ctx) => {
      const thisWeek = weekStart(ctx.today);
      const lastWeek = addDays(thisWeek, -7);
      const a = calculateConsistency(ctx.calendar, ctx.lookup, lastWeek, addDays(lastWeek, 6));
      const b = calculateConsistency(ctx.calendar, ctx.lookup, thisWeek, ctx.today);
      return a.activeDays > 0 && a.missedDays === 0 && b.activeDays > 0 && b.missedDays === 0;
    },
  },
];

export const ACHIEVEMENTS_BY_CODE = new Map(ACHIEVEMENTS.map((a) => [a.code, a]));

/** Codes newly earned in this evaluation (already-earned codes are passed in and skipped). */
export function evaluateAchievements(
  ctx: AchievementContext,
  alreadyEarned: ReadonlySet<string>,
): AchievementDefinition[] {
  return ACHIEVEMENTS.filter((a) => !alreadyEarned.has(a.code) && a.earned(ctx));
}

export function achievementPoints(tier: AchievementTier): number {
  return tier === 'gold' ? 50 : tier === 'silver' ? 25 : 10;
}

/** Live streak length, exported for the celebration flow. */
export function liveStreak(ctx: AchievementContext): number {
  return currentStreak(ctx);
}
