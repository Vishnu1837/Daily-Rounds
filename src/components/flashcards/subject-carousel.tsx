'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Flame, Layers, Sparkles } from 'lucide-react';

import { cn } from '@/lib/cn';
import { haptic } from '@/lib/haptics';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';

/**
 * The subject shelf, drawn as a gradient card carousel.
 *
 * Flashcards open onto *subjects* now, not a flat list of every deck on the roadmap. Each
 * subject is one large gradient card — its colour taken from the subject's own accent token
 * so Anatomy is always the same red wherever it appears — and the deck list for a subject
 * only unfolds once its card is chosen.
 *
 * The carousel is a real 3D rail rather than a row of tiles: the centred card sits flat and
 * full size, its neighbours tilt away on the Y axis and dim, so at a glance there is exactly
 * one subject you are "on". With a single subject the rail collapses to that one card with
 * no chevrons or dots — nothing to page through.
 *
 * Everything a student reads (the counts, the subject name) is in the DOM from the first
 * paint; the rotation and scale only decorate which card is active, and `prefers-reduced-motion`
 * drops them to a plain opacity change.
 */

export type SubjectCard = {
  slug: string;
  name: string;
  /** Accent token from the subject catalogue (`rose`, `indigo`, …). Drives the gradient. */
  accent: string;
  /** Course position 1–19, shown as a faint watermark. Null for an unfiled bucket. */
  number: number | null;
  deckCount: number;
  cardCount: number;
  dueCount: number;
  /** The student's current study streak, surfaced once on the leading card. */
  studyStreak: number;
};

/**
 * Accent token → gradient stops. Plain Tailwind palette on purpose: these are decorative
 * subject skins, not semantic UI colour, and a self-describing `from-rose-500` is easier to
 * retune than a second layer of indirection. The strings are written out in full so the JIT
 * keeps every class.
 */
const ACCENT_GRADIENT: Record<string, string> = {
  rose: 'from-rose-500 via-rose-600 to-pink-700',
  orange: 'from-orange-400 via-orange-500 to-amber-600',
  amber: 'from-amber-400 via-orange-500 to-orange-600',
  lime: 'from-lime-400 via-lime-500 to-emerald-600',
  emerald: 'from-emerald-400 via-emerald-500 to-teal-600',
  teal: 'from-teal-400 via-teal-500 to-cyan-600',
  cyan: 'from-cyan-400 via-cyan-500 to-sky-600',
  sky: 'from-sky-400 via-sky-500 to-blue-600',
  blue: 'from-blue-400 via-blue-500 to-indigo-600',
  indigo: 'from-indigo-400 via-indigo-500 to-violet-600',
  violet: 'from-violet-500 via-violet-600 to-fuchsia-700',
  fuchsia: 'from-fuchsia-500 via-fuchsia-600 to-pink-700',
  slate: 'from-slate-500 via-slate-600 to-slate-800',
};

const FALLBACK_GRADIENT = 'from-pulse-500 via-pulse-600 to-iris-600';

export function SubjectCarousel({
  subjects,
  onOpen,
}: {
  subjects: SubjectCard[];
  onOpen: (slug: string) => void;
}) {
  const reduce = usePrefersReducedMotion();
  const [active, setActive] = useState(0);
  const many = subjects.length > 1;

  function step(dir: -1 | 1) {
    setActive((i) => {
      const next = Math.min(subjects.length - 1, Math.max(0, i + dir));
      if (next !== i) haptic('tap');
      return next;
    });
  }

  function open(slug: string) {
    haptic('commit');
    onOpen(slug);
  }

  return (
    <div
      className="relative"
      role="group"
      aria-roledescription="carousel"
      aria-label="Subjects"
      onKeyDown={(e) => {
        if (!many) return;
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          step(-1);
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          step(1);
        }
      }}
    >
      <div className="flex items-stretch justify-center gap-4 overflow-hidden py-3 [perspective:1600px]">
        {subjects.map((subject, i) => {
          const offset = i - active;
          const isActive = offset === 0;

          // Only the active card and its close neighbours are worth mounting on a long rail.
          if (many && Math.abs(offset) > 2) return null;

          return (
            <motion.button
              key={subject.slug}
              type="button"
              onClick={() => (isActive ? open(subject.slug) : setActive(i))}
              onPointerEnter={() => !isActive && setActive(i)}
              initial={false}
              animate={
                reduce
                  ? { opacity: isActive ? 1 : 0.45 }
                  : {
                      rotateY: many ? offset * -20 : 0,
                      scale: isActive ? 1 : 0.84,
                      x: many ? offset * 14 : 0,
                      opacity: isActive ? 1 : 0.45,
                      filter: isActive ? 'saturate(1)' : 'saturate(0.7)',
                    }
              }
              transition={{ type: 'spring', stiffness: 260, damping: 30 }}
              style={{ transformStyle: 'preserve-3d' }}
              className={cn(
                'tap rounded-hero shadow-lift relative aspect-[4/5] w-[min(80vw,20rem)] shrink-0 origin-center cursor-pointer overflow-hidden p-6 text-left text-white',
                'bg-linear-to-br',
                ACCENT_GRADIENT[subject.accent] ?? FALLBACK_GRADIENT,
                isActive
                  ? 'ring-2 ring-white/25 ring-offset-2 ring-offset-transparent'
                  : 'pointer-events-auto',
              )}
              aria-current={isActive || undefined}
              aria-label={
                `${subject.name}. ${subject.deckCount} ${subject.deckCount === 1 ? 'deck' : 'decks'}, ` +
                `${subject.cardCount} cards` +
                (subject.dueCount > 0 ? `, ${subject.dueCount} due today` : '') +
                (isActive ? '. Press to open.' : '')
              }
              tabIndex={isActive ? 0 : -1}
            >
              {/* Corner light + a floor of shade so white text holds on the pale gradients. */}
              <span
                className="pointer-events-none absolute -top-10 -right-10 size-44 rounded-full bg-white/25 blur-3xl"
                aria-hidden
              />
              <span
                className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/40 via-transparent to-white/10"
                aria-hidden
              />

              {subject.number != null && (
                <span
                  className="pointer-events-none absolute -right-2 -bottom-7 text-[8rem] leading-none font-black text-white/10 tabular-nums"
                  aria-hidden
                >
                  {String(subject.number).padStart(2, '0')}
                </span>
              )}

              <div className="relative flex h-full flex-col">
                <span className="text-2xs font-bold tracking-[0.2em] text-white/75 uppercase">
                  Subject
                </span>
                <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-balance">
                  {subject.name}
                </h2>

                <div className="mt-auto space-y-2.5">
                  <div className="flex flex-wrap gap-1.5">
                    {subject.dueCount > 0 && (
                      <span className="rounded-pill inline-flex items-center gap-1.5 bg-white/20 px-2.5 py-1 text-xs font-bold backdrop-blur-sm">
                        <Sparkles className="size-3.5" aria-hidden />
                        {subject.dueCount} due today
                      </span>
                    )}
                    {subject.studyStreak >= 2 && (
                      <span className="rounded-pill inline-flex items-center gap-1.5 bg-white/20 px-2.5 py-1 text-xs font-bold tabular-nums backdrop-blur-sm">
                        <Flame className="size-3.5" aria-hidden />
                        {subject.studyStreak} day run
                      </span>
                    )}
                  </div>

                  <p className="flex items-center gap-2 text-sm font-semibold text-white/85 tabular-nums">
                    <Layers className="size-4" aria-hidden />
                    {subject.deckCount} {subject.deckCount === 1 ? 'deck' : 'decks'}
                    <span className="size-1 rounded-full bg-white/40" aria-hidden />
                    {subject.cardCount} cards
                  </p>

                  <p
                    className={cn(
                      'text-xs font-bold text-white/80 transition-opacity duration-200',
                      isActive ? 'opacity-100' : 'opacity-0',
                    )}
                    aria-hidden
                  >
                    Tap to open &rarr;
                  </p>
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>

      {many && (
        <div className="mt-4 flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => step(-1)}
            disabled={active === 0}
            aria-label="Previous subject"
            className="tap rounded-pill border-border bg-bg-elevated shadow-soft text-fg-muted hover:text-fg inline-flex size-9 items-center justify-center border transition-colors disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronLeft className="size-5" aria-hidden />
          </button>

          <div className="flex items-center gap-1.5" role="tablist" aria-label="Subjects">
            {subjects.map((subject, i) => (
              <button
                key={subject.slug}
                type="button"
                role="tab"
                aria-selected={i === active}
                aria-label={subject.name}
                onClick={() => setActive(i)}
                className={cn(
                  'ease-out-soft h-1.5 rounded-full transition-all duration-200',
                  i === active ? 'bg-pulse-500 w-6' : 'bg-border hover:bg-fg-subtle w-1.5',
                )}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={() => step(1)}
            disabled={active === subjects.length - 1}
            aria-label="Next subject"
            className="tap rounded-pill border-border bg-bg-elevated shadow-soft text-fg-muted hover:text-fg inline-flex size-9 items-center justify-center border transition-colors disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronRight className="size-5" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
