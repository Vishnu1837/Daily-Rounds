'use client';

import { cn } from '@/lib/cn';

/**
 * The streak flame. It grows with the streak and only animates when the streak is alive —
 * a dormant streak shows a cold, still flame, which is the point. The halo only appears
 * once a streak is long enough to be worth protecting, so it stays meaningful.
 */
export function StreakFlame({
  streak,
  size = 'md',
  className,
  animated = true,
}: {
  streak: number;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  className?: string;
  animated?: boolean;
}) {
  const dimension = { sm: 18, md: 24, lg: 36, xl: 56, '2xl': 76 }[size];
  const alive = streak > 0;
  // Intensity ramps to full at a 20-day streak.
  const intensity = Math.min(1, streak / 20);
  const gradientId = `flame-${size}-${alive ? 'on' : 'off'}`;

  return (
    <span
      className={cn('relative inline-grid shrink-0 place-items-center', className)}
      style={{ width: dimension, height: dimension }}
      aria-hidden
    >
      {alive && streak >= 7 && (
        <span
          className="bg-flame-500/35 absolute inset-0 rounded-full blur-xl"
          style={{ opacity: 0.35 + intensity * 0.45 }}
        />
      )}
      <svg
        viewBox="0 0 24 28"
        width={dimension}
        height={dimension}
        className={cn('relative', alive && animated && 'animate-flicker')}
        style={{ transformOrigin: '50% 80%' }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="1" x2="0" y2="0">
            {alive ? (
              <>
                <stop offset="0%" stopColor="var(--color-flame-600)" />
                <stop offset="52%" stopColor="var(--color-flame-500)" />
                <stop offset="100%" stopColor="var(--color-citrus-300)" />
              </>
            ) : (
              <>
                <stop offset="0%" stopColor="var(--color-ink-400)" />
                <stop offset="100%" stopColor="var(--color-ink-300)" />
              </>
            )}
          </linearGradient>
        </defs>
        <path
          d="M12 0.8c2.9 4.4 1.2 6.6-.4 8.6-1.3 1.6-2.5 3-1.9 5.3.3 1.1 1.1 2 2.1 2.3-.5-1.6.1-3.2 1.4-4.3.4 2.3 1.7 3.4 3 4.7 1.8 1.8 2.6 3.9 2 6.2-.9 3.3-4.1 4.6-6.9 4.6-4.5 0-8.4-2.7-8.4-7.6 0-3.3 1.7-5.8 3.3-8C8.4 9.4 10.6 6.3 12 .8Z"
          fill={`url(#${gradientId})`}
          opacity={alive ? 0.6 + intensity * 0.4 : 0.5}
        />
        {alive && streak >= 10 && (
          <circle cx="12" cy="20" r="3.4" fill="var(--color-citrus-300)" opacity="0.6" />
        )}
      </svg>
    </span>
  );
}

export function StreakBadge({
  streak,
  label = 'day streak',
  className,
}: {
  streak: number;
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-pill inline-flex items-center gap-2 px-3 py-1.5 ring-1 ring-inset',
        streak > 0 ? 'bg-flame-500/12 ring-flame-500/28' : 'bg-bg-sunken ring-border',
        className,
      )}
    >
      <StreakFlame streak={streak} size="sm" />
      <span
        className={cn(
          'text-sm font-bold tabular-nums',
          streak > 0 ? 'text-flame-700 dark:text-flame-300' : 'text-fg-subtle',
        )}
      >
        {streak} {label}
      </span>
    </div>
  );
}

/**
 * The seven-day strip.
 *
 * Rest days are drawn as a hollow ring rather than an empty slot, so a weekend never looks
 * like a failure. Missed *active* days are the only cells that read as negative, which is
 * the only place the distinction actually matters.
 */
export function WeekStrip({
  days,
  className,
}: {
  days: { label: string; state: 'done' | 'missed' | 'rest' | 'today' | 'future' }[];
  className?: string;
}) {
  return (
    <ol className={cn('flex items-end justify-between gap-1.5', className)}>
      {days.map((day, i) => (
        <li key={i} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
          <span
            className={cn(
              'text-2xs grid aspect-square w-full max-w-9 place-items-center rounded-xl font-bold transition-transform duration-200',
              day.state === 'done' &&
                'from-flame-400 to-flame-600 shadow-soft bg-linear-to-br text-white',
              day.state === 'today' &&
                'bg-pulse-500/14 text-pulse-700 ring-pulse-500 dark:text-pulse-200 ring-2',
              day.state === 'missed' && 'bg-danger/8 text-danger ring-danger/40 ring-1 ring-inset',
              day.state === 'rest' && 'border-border text-fg-subtle/60 border border-dashed',
              day.state === 'future' && 'bg-bg-sunken text-fg-subtle',
            )}
            aria-hidden
          >
            {day.state === 'done' ? '✓' : day.state === 'missed' ? '·' : ''}
          </span>
          <span className="text-2xs text-fg-subtle font-semibold">{day.label}</span>
        </li>
      ))}
    </ol>
  );
}
