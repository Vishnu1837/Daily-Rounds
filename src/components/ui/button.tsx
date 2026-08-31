'use client';

import { type ButtonHTMLAttributes, forwardRef } from 'react';
import Link from 'next/link';

import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger' | 'flame';
type Size = 'sm' | 'md' | 'lg' | 'xl' | 'icon';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-pulse-600 text-white shadow-soft hover:bg-pulse-500 active:bg-pulse-700 dark:bg-pulse-500 dark:text-ink-950 dark:hover:bg-pulse-400',
  secondary:
    'bg-ink-900 text-white hover:bg-ink-800 active:bg-ink-950 dark:bg-ink-100 dark:text-ink-950 dark:hover:bg-white',
  outline:
    'border border-border-strong bg-bg-elevated text-fg hover:bg-bg-sunken active:bg-bg-sunken',
  ghost: 'text-fg-muted hover:bg-bg-sunken hover:text-fg active:bg-bg-sunken',
  danger: 'bg-danger text-white hover:opacity-90 active:opacity-100',
  flame:
    'bg-linear-to-r from-flame-500 to-flame-400 text-white shadow-soft hover:from-flame-400 hover:to-flame-300',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-sm gap-1.5 rounded-xl',
  md: 'h-11 px-5 text-sm gap-2 rounded-2xl',
  lg: 'h-13 px-6 text-base gap-2.5 rounded-2xl',
  xl: 'h-15 px-7 text-lg gap-3 rounded-[1.25rem]',
  icon: 'h-10 w-10 rounded-xl',
};

const BASE =
  'tap relative inline-flex select-none items-center justify-center font-semibold ' +
  'transition-[transform,background-color,opacity,box-shadow] duration-150 ease-out ' +
  'active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 ' +
  'motion-reduce:active:scale-100';

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
