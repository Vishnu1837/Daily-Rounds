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
        'tap grid size-10 place-items-center rounded-xl text-fg-muted transition-colors hover:bg-bg-sunken hover:text-fg',
        className,
      )}
    >
      {dark ? <Moon className="size-[18px]" aria-hidden /> : <Sun className="size-[18px]" aria-hidden />}
    </button>
  );
}

export function TopBar({
  name,
  streak,
  href = '/profile',
  right,
}: {
  name: string;
  streak?: number;
  href?: string;
  right?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-[var(--nav-bg)] backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-2xl items-center justify-between gap-3 px-4 lg:max-w-none lg:px-6">
        <Link href="/" className="lg:hidden" aria-label="Daily Rounds home">
          <Logo size={28} />
        </Link>
        <div className="hidden lg:block" />

        <div className="flex items-center gap-1">
          {right}
          {typeof streak === 'number' && (
            <span
              className={cn(
                'mr-1 inline-flex items-center gap-1 rounded-pill px-2.5 py-1 text-sm font-bold',
                streak > 0
                  ? 'bg-flame-500/12 text-flame-600 dark:text-flame-300'
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
            <Avatar name={name} size="sm" />
          </Link>
        </div>
      </div>
    </header>
  );
}
