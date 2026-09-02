import { cn } from '@/lib/cn';
import { GROWTH_STAGES, type TreeSpecies, type TreeStatus } from '@/lib/domain/grove';

/**
 * A tree, drawn from two numbers: which species and how far through the round it is.
 *
 * Inline SVG rather than an illustration set, for three reasons. It scales from the 20px
 * tile on the grove wall to the 180px centrepiece of a running round without a second asset;
 * it can be animated mid-growth without shipping a sprite sheet; and the palette is fixed
 * mid-tone, so the same drawing sits correctly on a light card and on the dark surface the
 * timer switches to while a session runs.
 *
 * Growth is one uniform scale about the base of the trunk rather than a different drawing per
 * stage. A sapling that is visibly *the same tree, smaller* is what makes the last stage feel
 * like an arrival.
 */

type Palette = { canopy: string; canopyDeep: string; trunk: string };

const PALETTES: Record<TreeSpecies, Palette> = {
  sprout: {
    canopy: 'oklch(0.8 0.16 145)',
    canopyDeep: 'oklch(0.68 0.16 150)',
    trunk: 'oklch(0.62 0.06 120)',
  },
  fern: {
    canopy: 'oklch(0.78 0.15 155)',
    canopyDeep: 'oklch(0.63 0.14 158)',
    trunk: 'oklch(0.55 0.05 110)',
  },
  neem: {
    canopy: 'oklch(0.74 0.16 148)',
    canopyDeep: 'oklch(0.58 0.15 152)',
    trunk: 'oklch(0.5 0.055 65)',
  },
  banyan: {
    canopy: 'oklch(0.7 0.15 152)',
    canopyDeep: 'oklch(0.53 0.14 155)',
    trunk: 'oklch(0.46 0.05 60)',
  },
  deodar: {
    canopy: 'oklch(0.66 0.14 160)',
    canopyDeep: 'oklch(0.5 0.13 163)',
    trunk: 'oklch(0.44 0.05 55)',
  },
};

const DEAD: Palette = {
  canopy: 'oklch(0.72 0.02 80)',
  canopyDeep: 'oklch(0.6 0.025 75)',
  trunk: 'oklch(0.52 0.025 70)',
};

/** Canopy geometry per species, drawn around a trunk that rises from (32, 72) to (32, 34). */
function Canopy({ species, palette }: { species: TreeSpecies; palette: Palette }) {
  switch (species) {
    case 'sprout':
      return (
        <>
          <path d="M32 48 C22 46 18 38 20 32 C28 32 33 39 32 48 Z" fill={palette.canopy} />
          <path d="M32 50 C42 48 46 40 44 34 C36 34 31 41 32 50 Z" fill={palette.canopyDeep} />
        </>
      );
    case 'fern':
      return (
        <>
          <path d="M32 52 C18 48 12 36 16 24 C26 28 33 40 32 52 Z" fill={palette.canopy} />
          <path d="M32 52 C46 48 52 36 48 24 C38 28 31 40 32 52 Z" fill={palette.canopyDeep} />
          <path d="M32 50 C30 38 32 26 32 18 C34 26 34 38 32 50 Z" fill={palette.canopy} />
        </>
      );
    case 'neem':
      return (
        <>
          <circle cx="32" cy="30" r="17" fill={palette.canopy} />
          <circle cx="22" cy="38" r="11" fill={palette.canopyDeep} />
          <circle cx="43" cy="37" r="12" fill={palette.canopy} />
          <circle cx="34" cy="22" r="10" fill={palette.canopyDeep} />
        </>
      );
    case 'banyan':
      return (
        <>
          <ellipse cx="32" cy="30" rx="26" ry="16" fill={palette.canopy} />
          <ellipse cx="18" cy="34" rx="12" ry="10" fill={palette.canopyDeep} />
          <ellipse cx="46" cy="34" rx="12" ry="10" fill={palette.canopyDeep} />
          <ellipse cx="32" cy="21" rx="15" ry="10" fill={palette.canopy} />
          {/* Aerial roots — the banyan is the only species that reaches back to the ground. */}
          <path d="M17 42 L16 68" stroke={palette.trunk} strokeWidth="2.5" strokeLinecap="round" />
          <path d="M47 42 L49 68" stroke={palette.trunk} strokeWidth="2.5" strokeLinecap="round" />
        </>
      );
    case 'deodar':
      return (
        <>
          <path d="M32 6 L48 32 L16 32 Z" fill={palette.canopyDeep} />
          <path d="M32 18 L52 46 L12 46 Z" fill={palette.canopy} />
          <path d="M32 30 L56 58 L8 58 Z" fill={palette.canopyDeep} />
        </>
      );
  }
}

export function Tree({
  species,
  status = 'grown',
  /** 0 … GROWTH_STAGES - 1. Ignored for a withered tree, which is always drawn full size. */
  stage = GROWTH_STAGES - 1,
  size = 64,
  className,
  /** Adds a slow sway. Only worth it on the big timer tree. */
  sway = false,
  title,
}: {
  species: TreeSpecies;
  status?: TreeStatus;
  stage?: number;
  size?: number;
  className?: string;
  sway?: boolean;
  title?: string;
}) {
  const withered = status === 'withered';
  const palette = withered ? DEAD : PALETTES[species];

  const g = Math.min(1, Math.max(0, stage / (GROWTH_STAGES - 1)));
  // The floor is high enough to read as a seedling rather than a speck. A round spends its
  // first fifth at stage zero, and an invisible tree for six minutes reads as "nothing is
  // running" — which is the one thing the screen must never say while a round is live.
  const scale = withered ? 1 : 0.38 + 0.62 * g;
  const trunkTop = 72 - 38 * (withered ? 1 : Math.max(0.25, g));

  return (
    <svg
      viewBox="0 0 64 80"
      width={size}
      height={size * (80 / 64)}
      className={cn('overflow-visible', className)}
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {/* soil */}
      <ellipse cx="32" cy="73" rx="18" ry="4" fill="currentColor" opacity="0.12" />

      {/*
        Two nested groups on purpose. The sway animation and the growth scale are both
        transforms, and a CSS animation on one element would simply overwrite the other — so
        the wrapper owns the sway and the inner group owns the scale. The scale is set in CSS
        rather than as an SVG `transform` attribute because only the CSS property transitions.
      */}
      <g
        className={cn(sway && !withered && 'animate-sway')}
        style={{ transformOrigin: '32px 72px' }}
      >
        <g
          className="transition-transform duration-1000 ease-out motion-reduce:transition-none"
          style={{ transform: `scale(${scale.toFixed(3)})`, transformOrigin: '32px 72px' }}
        >
          <path
            d={`M29.5 72 L30.6 ${trunkTop.toFixed(1)} L33.4 ${trunkTop.toFixed(1)} L34.5 72 Z`}
            fill={palette.trunk}
          />
          {withered ? (
            <>
              {/* Bare branches. A stump has to be readable at 20px, so this is four strokes. */}
              <path
                d="M32 46 L20 32 M32 42 L44 30 M32 52 L24 44 M32 38 L38 26"
                stroke={palette.trunk}
                strokeWidth="2.6"
                strokeLinecap="round"
                fill="none"
              />
              <path
                d="M22 60 C26 58 30 60 28 64"
                stroke={palette.canopyDeep}
                strokeWidth="2"
                strokeLinecap="round"
                fill="none"
              />
            </>
          ) : (
            <Canopy species={species} palette={palette} />
          )}
        </g>
      </g>
    </svg>
  );
}

/** The bare patch shown before a round starts. */
export function EmptyPlot({ size = 64, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 64 80"
      width={size}
      height={size * (80 / 64)}
      className={className}
      aria-hidden
    >
      <ellipse cx="32" cy="73" rx="18" ry="4" fill="currentColor" opacity="0.12" />
      <ellipse cx="32" cy="70" rx="7" ry="2.5" fill="currentColor" opacity="0.18" />
    </svg>
  );
}
