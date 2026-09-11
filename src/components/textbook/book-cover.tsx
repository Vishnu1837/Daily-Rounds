import { cn } from '@/lib/cn';

/**
 * A textbook's cover: the image an admin uploaded, or a title card drawn from its name.
 *
 * The uploaded one is the point — a shelf a student recognises by sight is faster to use
 * than a shelf they have to read — and it comes from `/api/textbooks/[id]/cover`, which
 * checks cohort membership the same way the book's pages do. `coverVersion` changes when
 * the image does, so replacing a cover replaces what a browser already cached.
 *
 * The drawn card is not a placeholder to be ashamed of. A cohort lead adding twelve books
 * in an evening should not have to find twelve images first, and the tint is derived from
 * the title rather than stored, so the same book is the same colour on the shelf, on its own
 * page and inside the continue card without anyone choosing a colour.
 *
 * Plain `<img>` rather than `next/image`: the route is private, per-user and already
 * cache-controlled, so an optimiser in front of it would be a second access-control story
 * for no gain in bytes.
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
  /** The shelf, where the cover is the whole cell and sizes itself to the grid. */
  shelf: { box: 'w-full rounded-xl', title: 'text-base leading-tight p-3.5 pt-4', spine: 'w-1.5' },
} as const;

export function BookCover({
  title,
  materialId,
  coverVersion,
  size = 'md',
  className,
}: {
  title: string;
  /** Needed only to fetch an uploaded cover; a drawn card does not have a book to ask about. */
  materialId?: string;
  /** Non-null exactly when this book has an uploaded cover. */
  coverVersion?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const s = SIZES[size];
  const box = cn(
    'relative aspect-[3/4] shrink-0 overflow-hidden shadow-md',
    s.box,
    size === 'shelf' && 'shrink',
    className,
  );

  if (materialId && coverVersion) {
    return (
      <div className={cn(box, 'bg-bg-sunken')}>
        {/* eslint-disable-next-line @next/next/no-img-element -- private, per-user route */}
        <img
          src={`/api/textbooks/${materialId}/cover?v=${coverVersion}`}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
        />
      </div>
    );
  }

  // A cheap stable hash: the same title always lands on the same tint.
  let hash = 0;
  for (let i = 0; i < title.length; i += 1) hash = (hash * 31 + title.charCodeAt(i)) % 100000;
  const tint = TINTS[hash % TINTS.length]!;

  return (
    <div className={cn(box, 'bg-linear-to-br', tint)} aria-hidden>
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
