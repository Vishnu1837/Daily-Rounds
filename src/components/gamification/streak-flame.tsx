'use client';

import { cn } from '@/lib/cn';

/**
 * The streak flame. It grows with the streak and only animates when the streak is alive —
 * a dormant streak shows a cold, still flame, which is the point.
 */
export function StreakFlame({
  streak,
  size = 'md',
  className,
  animated = true,
}: {
  streak: number;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  animated?: boolean;
}) {
  const dimension = { sm: 18, md: 24, lg: 36, xl: 56 }[size];
  const alive = streak > 0;
  // Intensity ramps to full at a 20-day streak.
  const intensity = Math.min(1, streak / 20);

  return (
    <span
      className={cn(
        'inline-grid shrink-0 place-items-center',
        alive && animated && 'animate-flicker',
        className,
      )}
      style={{ width: dimension, height: dimension }}
      aria-hidden
    >
      <svg viewBox="0 0 24 28" width={dimension} height={dimension}>
        <defs>
          <linearGradient id={`flame-${size}-${alive ? 'on' : 'off'}`} x1="0" y1="1" x2="0" y2="0">
            {alive ? (
              <>
                <stop offset="0%" stopColor="var(--color-flame-600)" />
                <stop offset="55%" stopColor="var(--color-flame-500)" />
                <stop offset="100%" stopColor="var(--color-flame-300)" />
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
          fill={`url(#flame-${size}-${alive ? 'on' : 'off'})`}
          opacity={alive ? 0.55 + intensity * 0.45 : 0.5}
        />
        {alive && streak >= 10 && (
          <circle cx="12" cy="20" r="3.4" fill="var(--color-flame-300)" opacity="0.55" />
        )}
      </svg>
    </span>
  );
}

export function StreakBadge({
  streak,
  label = 'Study-Day Streak',
  className,
}: {
  streak: number;
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 rounded-pill px-3 py-1.5 ring-1 ring-inset',
        streak > 0
          ? 'bg-flame-500/12 ring-flame-500/25'
          : 'bg-bg-sunken ring-border',
        className,
      )}
    >
      <StreakFlame streak={streak} size="sm" />
      <span
        className={cn(
          'text-sm font-bold',
          streak > 0 ? 'text-flame-600 dark:text-flame-300' : 'text-fg-subtle',
        )}
      >
        {streak} {label}
      </span>
    </div>
  );
}
