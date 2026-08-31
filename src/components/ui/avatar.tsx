import { cn } from '@/lib/cn';

const PALETTES = [
  'from-pulse-400 to-pulse-600',
  'from-iris-400 to-iris-600',
  'from-flame-400 to-flame-600',
  'from-sky-400 to-sky-600',
  'from-emerald-400 to-emerald-600',
  'from-rose-400 to-rose-600',
  'from-amber-400 to-amber-600',
  'from-violet-400 to-violet-600',
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
  size = 'md',
  className,
  ring,
}: {
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
  ring?: boolean;
}) {
  const dims = {
    xs: 'size-7 text-2xs',
    sm: 'size-9 text-xs',
    md: 'size-11 text-sm',
    lg: 'size-16 text-lg',
  }[size];

  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center rounded-full bg-linear-to-br font-bold text-white select-none',
        paletteFor(name),
        dims,
        ring && 'ring-2 ring-bg-elevated',
        className,
      )}
      aria-hidden
    >
      {initialsOf(name)}
    </span>
  );
}
