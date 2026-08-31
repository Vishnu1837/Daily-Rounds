import { cn } from '@/lib/cn';

/**
 * The Daily Rounds mark: a stethoscope-derived circle with an ECG trace running through
 * it — one continuous line, like the habit it stands for.
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
          <stop offset="100%" stopColor="var(--color-iris-500)" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="12" fill="url(#dr-mark)" />
      <path
        d="M6 22h5.5l2.6-7.2 3.4 13.4 3.3-9.4 2.2 3.2H34"
        fill="none"
        stroke="white"
        strokeWidth="2.6"
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
        <span className="font-display text-lg leading-none font-extrabold tracking-tight text-fg">
          Daily<span className="text-pulse-600 dark:text-pulse-400">Rounds</span>
        </span>
      )}
    </span>
  );
}
