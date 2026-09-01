import { cn } from '@/lib/cn';

/**
 * An avatar is either an uploaded photograph or a generated monogram — nobody is required
 * to have a picture, and the fallback has to look deliberate rather than like a gap.
 *
 * The monogram gradient is chosen deterministically from the name, so a given person is the
 * same colour on the leaderboard, in the admin console and on their own profile. Palettes
 * are drawn from the brand ramps rather than random hues so a list of thirty students still
 * looks like one product.
 */
const PALETTES = [
  'from-pulse-400 to-iris-600',
  'from-iris-400 to-blush-500',
  'from-flame-400 to-flame-600',
  'from-aqua-400 to-pulse-600',
  'from-success to-aqua-500',
  'from-blush-400 to-iris-600',
  'from-citrus-400 to-flame-500',
  'from-pulse-500 to-aqua-400',
];

function paletteFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTES[h % PALETTES.length]!;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function Avatar({
  name,
  src,
  size = 'md',
  className,
  ring,
  /** A coloured halo behind the avatar. Used to mark the viewer in a list of other people. */
  glow,
}: {
  name: string;
  /** An uploaded picture. Falls back to the monogram when absent. */
  src?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  ring?: boolean;
  glow?: boolean;
}) {
  const dims = {
    xs: 'size-7 text-2xs',
    sm: 'size-9 text-xs',
    md: 'size-11 text-sm',
    lg: 'size-16 text-lg',
    xl: 'size-20 text-2xl',
  }[size];

  return (
    <span
      className={cn(
        'relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-linear-to-br font-bold text-white select-none',
        paletteFor(name),
        dims,
        ring && 'ring-bg-elevated ring-2',
        glow && 'shadow-glow-pulse',
        className,
      )}
      aria-hidden
    >
      {src ? (
        /*
         * Uploaded pictures are stored as inline data URLs, already downscaled to a square
         * on the client, so there is nothing for the image optimiser to do here.
         */
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="absolute inset-0 size-full object-cover" />
      ) : (
        initialsOf(name)
      )}
    </span>
  );
}

/**
 * Overlapping avatars for "these people did this". Caps the visible faces and shows the
 * remainder as a count, so the row cannot grow unbounded on a large cohort.
 */
export function AvatarStack({
  people,
  max = 4,
  size = 'sm',
  className,
}: {
  people: { name: string; avatarUrl?: string | null }[];
  max?: number;
  size?: 'xs' | 'sm';
  className?: string;
}) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  const dims = size === 'xs' ? 'size-7 text-2xs' : 'size-9 text-xs';

  return (
    <div className={cn('flex items-center', className)}>
      {shown.map((person, i) => (
        <Avatar
          key={`${person.name}-${i}`}
          name={person.name}
          src={person.avatarUrl}
          size={size}
          ring
          className={i > 0 ? '-ml-2.5' : undefined}
        />
      ))}
      {rest > 0 && (
        <span
          className={cn(
            'bg-bg-inset text-fg-muted ring-bg-elevated -ml-2.5 grid shrink-0 place-items-center rounded-full font-bold ring-2',
            dims,
          )}
        >
          +{rest}
        </span>
      )}
    </div>
  );
}
