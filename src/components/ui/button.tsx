'use client';

import { type ButtonHTMLAttributes, forwardRef } from 'react';
import Link from 'next/link';

import { cn } from '@/lib/cn';

/*
 * `inverse*` are the variants for buttons sitting *on* a saturated surface — the hero card,
 * the celebration panel, the running timer.
 *
 * They exist as real variants rather than as a `className` override on `primary` because
 * the primary skin is a gradient: a passed-in `bg-white` only replaces the background
 * *colour*, leaving the gradient image painted on top of it. That produced a washed-out
 * lavender button on every dark hero — the kind of bug that only a variant can actually fix.
 */
type Variant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'outline'
  | 'soft'
  | 'danger'
  | 'flame'
  | 'success'
  | 'inverse'
  | 'inverse-soft'
  | 'inverse-ghost';
type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'icon' | 'icon-lg';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-linear-to-b from-pulse-500 to-pulse-600 text-white shadow-glow-pulse ' +
    'hover:from-pulse-400 hover:to-pulse-500 active:from-pulse-600 active:to-pulse-700',
  secondary:
    'bg-ink-900 text-white hover:bg-ink-800 active:bg-ink-950 ' +
    'dark:bg-ink-50 dark:text-ink-950 dark:hover:bg-white',
  outline:
    'border border-border-strong bg-bg-elevated text-fg shadow-xs hover:border-pulse-400 hover:bg-pulse-500/6 active:bg-pulse-500/10',
  soft: 'bg-pulse-500/12 text-pulse-700 hover:bg-pulse-500/18 dark:text-pulse-200',
  ghost: 'text-fg-muted hover:bg-bg-sunken hover:text-fg active:bg-bg-inset',
  danger: 'bg-danger text-white shadow-soft hover:opacity-90 active:opacity-100',
  flame:
    'bg-linear-to-b from-flame-400 to-flame-600 text-white shadow-glow-flame hover:from-flame-300 hover:to-flame-500',
  success:
    'bg-linear-to-b from-success to-success-strong text-white shadow-glow-success hover:opacity-95',

  inverse:
    'bg-white text-ink-900 shadow-lift hover:bg-white/92 active:bg-white/85 dark:bg-white dark:text-ink-900',
  'inverse-soft':
    'bg-white/14 text-white ring-1 ring-white/25 ring-inset hover:bg-white/22 active:bg-white/28',
  'inverse-ghost': 'text-white/75 hover:bg-white/10 hover:text-white active:bg-white/15',
};

const SIZES: Record<Size, string> = {
  xs: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
  sm: 'h-9.5 px-4 text-sm gap-1.5 rounded-field',
  md: 'h-11 px-5 text-sm gap-2 rounded-field',
  lg: 'h-13 px-6 text-base gap-2.5 rounded-panel',
  xl: 'h-15 px-7 text-base gap-3 rounded-panel',
  icon: 'h-10 w-10 rounded-field',
  'icon-lg': 'h-12 w-12 rounded-panel',
};

/*
 * `translate-y` on press rather than `scale`: a button that scales blurs its own label for
 * the length of the animation, which is exactly when someone is looking at it.
 */
const BASE =
  'tap relative inline-flex select-none items-center justify-center overflow-hidden font-semibold ' +
  'transition-[transform,background-color,opacity,box-shadow,border-color] duration-150 ease-out-soft ' +
  'active:translate-y-px disabled:pointer-events-none disabled:opacity-50 ' +
  'motion-reduce:active:translate-y-0';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', loading, fullWidth, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(BASE, VARIANTS[variant], SIZES[size], fullWidth && 'w-full', className)}
      {...props}
    >
      {loading && <Spinner />}
      <span className={cn('inline-flex items-center gap-2', loading && 'opacity-0')}>
        {children}
      </span>
    </button>
  );
});

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'absolute inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent',
        className,
      )}
      aria-hidden
    />
  );
}

export function LinkButton({
  href,
  className,
  variant = 'primary',
  size = 'md',
  fullWidth,
  children,
  external,
  ...rest
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  className?: string;
  external?: boolean;
  children: React.ReactNode;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  const classes = cn(BASE, VARIANTS[variant], SIZES[size], fullWidth && 'w-full', className);

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={classes} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={classes} {...rest}>
      {children}
    </Link>
  );
}

/**
 * A quiet text action — "View all", "Edit", "See the ledger".
 *
 * Exists so those links stop being re-invented with slightly different colours on every
 * screen, which is how a product ends up with four shades of "clickable".
 */
export function TextAction({
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        'tap text-pulse-700 hover:text-pulse-500 dark:text-pulse-300 dark:hover:text-pulse-200 inline-flex items-center gap-1 rounded-lg text-sm font-semibold transition-colors',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
