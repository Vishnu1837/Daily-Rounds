import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/cn';

/**
 * Cards carry the entire visual hierarchy of the product, so they are deliberately *not*
 * interchangeable. A screen made of one card variant repeated twelve times gives every
 * piece of information the same weight, which is the same as giving none of it any.
 *
 * The ladder, heaviest first:
 *
 *   solid    A saturated gradient panel with inverse text. At most one per screen — this is
 *            "the thing to do right now".
 *   wash     A tinted surface. Supporting information that belongs to a colour (a streak, a
 *            roadmap, a warning).
 *   surface  The default. Neutral, quiet, the workhorse.
 *   outline  Border only, no fill. Used for empty and optional states so they visibly sit
 *            below real content.
 *   glass    Frosted. Only for surfaces that float over other content.
 */
export type CardVariant = 'surface' | 'wash' | 'solid' | 'outline' | 'glass';
export type CardTone =
  'neutral' | 'pulse' | 'iris' | 'flame' | 'citrus' | 'success' | 'warning' | 'danger';

const WASH: Record<CardTone, string> = {
  neutral: 'bg-bg-elevated border-border',
  pulse: 'bg-pulse-500/8 border-pulse-500/22 dark:bg-pulse-500/12',
  iris: 'bg-iris-500/8 border-iris-500/22 dark:bg-iris-500/12',
  flame: 'bg-flame-500/9 border-flame-500/25 dark:bg-flame-500/12',
  citrus: 'bg-citrus-500/12 border-citrus-500/30 dark:bg-citrus-500/10',
  success: 'bg-success/9 border-success/25',
  warning: 'bg-warning/12 border-warning/30',
  danger: 'bg-danger/8 border-danger/25',
};

const SOLID: Record<CardTone, string> = {
  neutral: 'bg-linear-to-br from-ink-800 to-ink-950 text-white border-transparent',
  pulse: 'bg-linear-to-br from-pulse-600 via-pulse-700 to-iris-800 text-white border-transparent',
  iris: 'bg-linear-to-br from-iris-500 via-iris-600 to-pulse-800 text-white border-transparent',
  flame: 'bg-linear-to-br from-flame-500 via-flame-600 to-flame-800 text-white border-transparent',
  citrus:
    'bg-linear-to-br from-citrus-400 via-citrus-500 to-flame-500 text-ink-950 border-transparent',
  success: 'bg-linear-to-br from-success to-success-strong text-white border-transparent',
  warning: 'bg-linear-to-br from-warning to-flame-600 text-ink-950 border-transparent',
  danger: 'bg-linear-to-br from-danger to-danger-strong text-white border-transparent',
};

const GLOW: Partial<Record<CardTone, string>> = {
  pulse: 'shadow-glow-pulse',
  iris: 'shadow-glow-pulse',
  flame: 'shadow-glow-flame',
  success: 'shadow-glow-success',
};

const PADDING = {
  none: '',
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6 sm:p-7',
} as const;

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  variant?: CardVariant;
  tone?: CardTone;
  padding?: keyof typeof PADDING;
  interactive?: boolean;
  /** Adds a coloured cast beneath the card. Reserved for the one card that matters most. */
  glow?: boolean;
};

export function Card({
  className,
  variant = 'surface',
  tone = 'neutral',
  padding = 'none',
  interactive,
  glow,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        'rounded-card relative border',
        variant === 'surface' && 'border-border bg-bg-elevated shadow-soft',
        variant === 'wash' && WASH[tone],
        variant === 'solid' && cn(SOLID[tone], 'shadow-lift'),
        variant === 'outline' && 'border-border-strong border-dashed bg-transparent',
        variant === 'glass' && 'surface-glass shadow-lift border',
        glow && GLOW[tone],
        PADDING[padding],
        interactive &&
          cn(
            'tap ease-out-soft transition-[transform,box-shadow,border-color] duration-200',
            'hover:shadow-lift hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.995]',
            'motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100',
          ),
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  action,
  icon,
  description,
  className,
}: {
  title: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  description?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3 px-5 pt-5', className)}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="eyebrow">{title}</h2>
        </div>
        {description && <p className="text-fg-muted mt-1.5 text-sm">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5', className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('border-border border-t px-5 py-4', className)} {...props} />;
}

/** A section heading used between cards on a page. */
export function SectionTitle({
  children,
  action,
  className,
}: {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 px-1', className)}>
      <h2 className="eyebrow">{children}</h2>
      {action}
    </div>
  );
}

/**
 * The soft colour blobs behind a hero card.
 *
 * Purely decorative, and deliberately built from two absolutely-positioned blurred circles
 * rather than an image: it costs nothing to download, tints itself from the theme, and
 * cannot fail to load and leave a hole in the layout.
 */
export function CardAurora({
  tone = 'pulse',
  className,
}: {
  tone?: 'pulse' | 'iris' | 'flame' | 'citrus';
  className?: string;
}) {
  const colours = {
    pulse: ['bg-pulse-400/40', 'bg-iris-400/35'],
    iris: ['bg-iris-400/40', 'bg-blush-400/30'],
    flame: ['bg-flame-400/45', 'bg-citrus-400/30'],
    citrus: ['bg-citrus-300/50', 'bg-flame-300/35'],
  }[tone];

  return (
    <div
      className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}
      aria-hidden
    >
      <span
        className={cn(
          'animate-drift absolute -top-16 -right-10 size-52 rounded-full blur-3xl',
          colours[0],
        )}
      />
      <span
        className={cn(
          'animate-drift absolute -bottom-20 -left-12 size-56 rounded-full blur-3xl [animation-delay:-6s]',
          colours[1],
        )}
      />
    </div>
  );
}
