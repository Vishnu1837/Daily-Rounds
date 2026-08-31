'use client';

import { cn } from '@/lib/cn';
import type { LevelInfo, League } from '@/lib/domain/level';

import { AnimatedCounter } from '@/components/ui/counter';
import { ProgressBar } from '@/components/ui/progress';

const RANK_TONE = {
  ink: 'from-ink-400 to-ink-600 text-white',
  pulse: 'from-pulse-400 to-pulse-600 text-white',
  iris: 'from-iris-400 to-iris-600 text-white',
  flame: 'from-flame-400 to-flame-600 text-white',
  citrus: 'from-citrus-300 to-citrus-500 text-ink-950',
} as const;

/**
 * The level chip: a gradient tile with the number, and the rank title beside it.
 *
 * The number is the loud part and the rank is the quiet part, because the number is what
 * changes and the title is what it means.
 */
export function LevelBadge({
  info,
  size = 'md',
  showTitle = true,
  className,
}: {
  info: LevelInfo;
  size?: 'sm' | 'md' | 'lg';
  showTitle?: boolean;
  className?: string;
}) {
  const tile = {
    sm: 'size-8 text-xs rounded-lg',
    md: 'size-11 text-base rounded-xl',
    lg: 'size-14 text-xl rounded-2xl',
  }[size];

  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <span
        className={cn(
          'stat-num shadow-soft grid shrink-0 place-items-center bg-linear-to-br',
          RANK_TONE[info.rank.tone],
          tile,
        )}
        aria-hidden
      >
        {info.level}
      </span>
      {showTitle && (
        <span className="min-w-0">
          <span className="eyebrow block">Level {info.level}</span>
          <span className="text-fg block truncate text-sm font-bold">{info.rank.title}</span>
        </span>
      )}
      <span className="sr-only">
        Level {info.level}, {info.rank.title}
      </span>
    </span>
  );
}

/**
 * XP toward the next level.
 *
 * Shows the remaining amount rather than the earned amount on purpose: "340 XP to Resident"
 * is a next action, where "1,410 XP" is only a fact.
 */
export function XPBar({ info, className }: { info: LevelInfo; className?: string }) {
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="eyebrow">
          {info.remaining === null
            ? 'Top of the ladder'
            : `${info.remaining.toLocaleString()} XP to level ${info.level + 1}`}
        </span>
        <span className="text-2xs text-fg-muted font-bold tabular-nums">
          {info.into.toLocaleString()}/{info.span.toLocaleString()}
        </span>
      </div>
      <ProgressBar
        value={info.pct}
        tone="citrus"
        height="sm"
        className="mt-2"
        label={`Progress to level ${info.level + 1}`}
      />
    </div>
  );
}

/** The full level panel — used on the dashboard and the profile. */
export function LevelCard({
  info,
  className,
  compact,
}: {
  info: LevelInfo;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <div className="flex items-center justify-between gap-3">
        <LevelBadge info={info} size={compact ? 'md' : 'lg'} />
        <div className="text-right">
          <p className="stat-num text-citrus-700 dark:text-citrus-300 text-xl">
            <AnimatedCounter value={info.xp} />
          </p>
          <p className="eyebrow">Total XP</p>
        </div>
      </div>
      <XPBar info={info} />
    </div>
  );
}

/** League chip for the leaderboard. */
export function LeagueBadge({ league, className }: { league: League; className?: string }) {
  const tone = {
    pulse: 'bg-pulse-500/14 text-pulse-700 ring-pulse-500/28 dark:text-pulse-300',
    flame: 'bg-flame-500/16 text-flame-700 ring-flame-500/30 dark:text-flame-300',
    iris: 'bg-iris-500/14 text-iris-700 ring-iris-500/28 dark:text-iris-300',
    ink: 'bg-bg-sunken text-fg-muted ring-border',
  }[league.tone];

  return (
    <span
      className={cn(
        'rounded-pill inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold ring-1 ring-inset',
        tone,
        className,
      )}
    >
      <ShieldGlyph className="size-3.5" />
      {league.label}
    </span>
  );
}

function ShieldGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path
        d="M12 2.2 4.6 5v6.4c0 4.6 3.1 8.8 7.4 10.4 4.3-1.6 7.4-5.8 7.4-10.4V5L12 2.2Z"
        opacity="0.9"
      />
    </svg>
  );
}
