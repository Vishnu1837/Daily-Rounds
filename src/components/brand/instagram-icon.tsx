import { cn } from '@/lib/cn';

/**
 * Instagram glyph.
 *
 * Drawn here because lucide-react v1 removed its brand icons, and the founder section needs
 * one. Traced to match lucide's own conventions — 24-unit box, 2px stroke, round caps — so
 * it sits correctly alongside the icons around it and inherits `currentColor` and sizing
 * from a `className` the same way they do.
 */
export function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('shrink-0', className)}
      aria-hidden
    >
      <rect width="20" height="20" x="2" y="2" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1.0" fill="currentColor" stroke="none" />
    </svg>
  );
}
