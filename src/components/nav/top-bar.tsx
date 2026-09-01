'use client';

import { useCallback, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { Moon, Sun } from 'lucide-react';

import { Logo } from '@/components/brand/logo';
import { Avatar } from '@/components/ui/avatar';
import { StreakFlame } from '@/components/gamification/streak-flame';
import { cn } from '@/lib/cn';

/**
 * The theme lives on `<html>` (set by an inline script before first paint, so there is no
 * flash of the wrong scheme). This subscribes to that element rather than mirroring it into
 * React state, which keeps the button correct even if the class is changed elsewhere.
 */
function subscribeToTheme(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}

export function ThemeToggle({ className }: { className?: string }) {
  const dark = useSyncExternalStore(
    subscribeToTheme,
    () => document.documentElement.classList.contains('dark'),
    () => false, // the server has no theme; the inline script settles it before paint
  );

  const toggle = useCallback(() => {
    const next = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('dr-theme', next ? 'dark' : 'light');
    } catch {
      /* storage unavailable — the toggle still works for this session */
    }
  }, []);

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={cn(
        'tap rounded-field text-fg-muted hover:bg-bg-sunken hover:text-fg grid size-9.5 place-items-center transition-colors',
        className,
      )}
    >
      {dark ? (
        <Moon className="size-[18px]" aria-hidden />
      ) : (
        <Sun className="size-[18px]" aria-hidden />
      )}
    </button>
  );
}

/**
 * The header.
 *
 * It carries the two numbers a student should never have to navigate to find — the live
 * streak and the XP total — because both are the reason to come back tomorrow, and burying
 * them one tap deep is how a habit product loses the habit.
 */
export function TopBar({
  name,
  streak,
  xp,
  level,
  href = '/profile',
  left,
  right,
  subtitle,
}: {
  name: string;
  streak?: number;
  xp?: number;
  level?: number;
  href?: string;
  /** Sits beside the wordmark — on mobile this is the overflow menu. */
  left?: React.ReactNode;
  right?: React.ReactNode;
  /** Small line under the wordmark on desktop — usually the date and cohort. */
  subtitle?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--nav-border)] bg-[var(--nav-bg)] backdrop-blur-xl">
      <div className="mx-auto flex h-15 max-w-7xl items-center justify-between gap-3 px-4 lg:px-8">
        <div className="flex items-center gap-1 lg:hidden">
          {left}
          <Link href="/" aria-label="Daily Rounds home">
            <Logo size={30} />
          </Link>
        </div>

        <div className="hidden min-w-0 lg:block">
          {subtitle && <p className="text-fg-muted truncate text-sm font-medium">{subtitle}</p>}
        </div>

        <div className="flex items-center gap-1.5">
          {right}

          {typeof level === 'number' && typeof xp === 'number' && (
            <span
              className="rounded-pill bg-bg-sunken hidden items-center gap-2 py-1 pr-3 pl-1 sm:inline-flex"
              title={`Level ${level} · ${xp.toLocaleString()} XP`}
            >
              <span
                className="stat-num from-citrus-300 to-citrus-500 text-2xs text-ink-950 grid size-7 place-items-center rounded-full bg-linear-to-br"
                aria-hidden
              >
                {level}
              </span>
              <span className="text-fg text-sm font-bold tabular-nums">
                {xp.toLocaleString()}
                <span className="text-2xs text-fg-subtle ml-1 font-bold">XP</span>
              </span>
            </span>
          )}

          {typeof streak === 'number' && (
            <span
              className={cn(
                'rounded-pill inline-flex items-center gap-1 py-1 pr-3 pl-2 text-sm font-bold tabular-nums',
                streak > 0
                  ? 'bg-flame-500/12 text-flame-700 dark:text-flame-300'
                  : 'bg-bg-sunken text-fg-subtle',
              )}
              title={`${streak} study-day streak`}
            >
              <StreakFlame streak={streak} size="sm" />
              {streak}
            </span>
          )}

          <ThemeToggle />

          <Link href={href} aria-label="Your profile" className="tap ml-0.5">
            <Avatar name={name} size="sm" ring />
          </Link>
        </div>
      </div>
    </header>
  );
}
