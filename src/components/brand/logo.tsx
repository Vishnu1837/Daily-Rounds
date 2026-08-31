import { cn } from '@/lib/cn';

/**
 * The Daily Rounds mark: a rounded tile carrying an ECG trace — one continuous line that
 * never lifts, which is the habit the product is about.
 *
 * Drawn rather than imported so it inherits the theme's own gradient stops, stays crisp at
 * 20px in a nav bar and 64px on a sign-in screen, and cannot fail to load.
 */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      width={size}
      height={size}
      className={cn('shrink-0', className)}
      role="img"
      aria-label="Daily Rounds"
    >
      <defs>
        <linearGradient id="dr-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--color-pulse-400)" />
          <stop offset="55%" stopColor="var(--color-pulse-600)" />
          <stop offset="100%" stopColor="var(--color-iris-600)" />
        </linearGradient>
        <linearGradient id="dr-mark-sheen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="white" stopOpacity="0.28" />
          <stop offset="60%" stopColor="white" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="12.5" fill="url(#dr-mark)" />
      <rect width="40" height="40" rx="12.5" fill="url(#dr-mark-sheen)" />
      <path
        d="M6 22h5.5l2.6-7.2 3.4 13.4 3.3-9.4 2.2 3.2H34"
        fill="none"
        stroke="white"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({
  size = 32,
  className,
  showWordmark = true,
}: {
  size?: number;
  className?: string;
  showWordmark?: boolean;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark size={size} />
      {showWordmark && (
        <span className="font-display text-fg text-lg leading-none font-extrabold tracking-[-0.03em]">
          Daily
          <span className="from-pulse-600 to-iris-500 dark:from-pulse-300 dark:to-iris-300 bg-linear-to-r bg-clip-text text-transparent">
            Rounds
          </span>
        </span>
      )}
    </span>
  );
}
