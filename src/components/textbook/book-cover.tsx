import { cn } from '@/lib/cn';

/**
 * A textbook's cover, drawn rather than fetched.
 *
 * The real cover is page one of a private PDF, and rendering it would mean a range request
 * and a canvas for every book on the shelf — paid on a screen whose whole job is to let
 * someone pick one. So a book gets a title card instead: a spine, the title set large, and
 * a tint chosen from the title itself.
 *
 * Deriving the tint from the name rather than storing one means the same book is the same
 * colour on the shelf, on its own page and inside the continue card, without an admin ever
 * being asked to pick a colour — and two books in a cohort are rarely close enough in name
 * to collide.
 */

const TINTS = [
  'from-pulse-500 to-pulse-700',
  'from-flame-400 to-flame-600',
  'from-iris-500 to-iris-700',
  'from-aqua-400 to-aqua-500',
  'from-citrus-400 to-citrus-600',
  'from-danger to-flame-600',
] as const;

const SIZES = {
  sm: { box: 'w-10 rounded-md', title: 'text-[7px] leading-[1.15] p-1 pt-1.5', spine: 'w-[3px]' },
  md: { box: 'w-16 rounded-lg', title: 'text-[10px] leading-tight p-1.5 pt-2', spine: 'w-1' },
  lg: { box: 'w-28 rounded-xl', title: 'text-sm leading-tight p-3 pt-3.5', spine: 'w-1.5' },
} as const;

export function BookCover({
  title,
  size = 'md',
  className,
}: {
  title: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  // A cheap stable hash: the same title always lands on the same tint.
  let hash = 0;
  for (let i = 0; i < title.length; i += 1) hash = (hash * 31 + title.charCodeAt(i)) % 100000;
  const tint = TINTS[hash % TINTS.length]!;
  const s = SIZES[size];

  return (
    <div
      className={cn(
        'relative aspect-[3/4] shrink-0 overflow-hidden bg-linear-to-br shadow-md',
        tint,
        s.box,
        className,
      )}
      aria-hidden
    >
      <span className={cn('absolute inset-y-0 left-0 bg-black/20', s.spine)} />
      <p
        className={cn(
          'line-clamp-4 font-extrabold tracking-tight text-balance text-white/95',
          s.title,
        )}
      >
        {title}
      </p>
    </div>
  );
}
