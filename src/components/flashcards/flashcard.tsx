'use client';

import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  type PanInfo,
  motion,
  useMotionTemplate,
  useMotionValue,
  useMotionValueEvent,
  useSpring,
  useTransform,
} from 'framer-motion';

import { cn } from '@/lib/cn';
import type { Grade } from '@/lib/domain/flashcards';
import type { SessionCard } from '@/server/queries/flashcards';

import { CardBack, CardFront } from './card-face';

/**
 * The flashcard itself.
 *
 * Four behaviours share one element here, and the order they compose in is the whole
 * design:
 *
 *   1. **Tilt.** The card leans a couple of degrees toward the pointer. Its content sits on
 *      a `translateZ` plane above the surface, so the lean produces real parallax rather
 *      than a picture of parallax, and a highlight tracks the pointer across the face.
 *   2. **Flip.** Revealing rotates the card on Y through a spring, and the same spring
 *      drives a scale dip at the halfway point — so the card visibly compresses as it turns
 *      instead of merely spinning. That dip is what makes it read as an object.
 *   3. **Drag.** Once revealed, the card follows the finger, rotates with the throw, and
 *      commits to a grade when it passes a threshold.
 *   4. **Exit.** The chosen grade throws the card away in its own direction, and the next
 *      one springs up from the stack behind it.
 *
 * The tilt is added to the flip rather than fighting it: both are rotations about Y, so the
 * card's real Y rotation is `flip + tilt` and there is only ever one transform. Doing it any
 * other way — nested wrappers, one per rotation — produces a card that stops responding to
 * the pointer for the duration of every flip.
 *
 * Nothing here is required to read the card. With `prefers-reduced-motion` set, the tilt,
 * the highlight, the float and the drag all switch off, the flip becomes a cross-fade, and
 * the card is still a question with an answer behind a button.
 */

/**
 * The card's height, sized off the viewport rather than fixed.
 *
 * A 27rem card is right on a laptop and wrong on a short window, where it pushes the four
 * grade buttons below the fold — and a student who has to scroll to answer has been handed
 * back every millisecond the rest of this file spent making the interaction quick. The
 * clamp keeps the card as large as it can be while leaving room for the header, the
 * progress rail and the controls beneath it.
 *
 * Two clamps rather than one because the two layouts do not have the same furniture: a
 * phone additionally carries the floating bottom bar and a taller header, so roughly nine
 * more rem of the viewport is already spoken for before the card gets any. Sharing a single
 * subtrahend meant either a stunted card on the desktop or grade buttons sitting underneath
 * the navigation on a phone — which is the one place they must never be, because that is
 * exactly where the thumb is.
 *
 * Exported because the deck cover and the stack layers behind the card have to agree with
 * it exactly; a stack that is a few pixels taller than the card it sits under reads as a
 * rendering bug rather than as depth.
 */
export const CARD_HEIGHT =
  'h-[clamp(14rem,calc(100dvh-30rem),27rem)] sm:h-[clamp(15rem,calc(100dvh-21rem),27rem)]';

/** How far the card leans, in degrees, at the very corner. Small on purpose. */
const TILT = 7;

/** Drag distance, in px, at which each grade takes over. */
const THRESHOLD = { soft: 52, hard: 128 } as const;

const TILT_SPRING = { stiffness: 220, damping: 22, mass: 0.35 };
const FLIP_SPRING = { stiffness: 210, damping: 24, mass: 0.7 };

/**
 * Where the card goes when a grade is chosen.
 *
 * The direction is the vocabulary: everything the student did *not* know leaves to the
 * left and downward, everything they did leaves to the right and upward, and the distance
 * grows with confidence. After a dozen cards the hand knows which way to throw before the
 * eye has read the labels — which is the entire argument for gesture control over four
 * buttons that all look the same.
 */
const EXIT: Record<Grade, { x: number; y: number; scale: number }> = {
  again: { x: -460, y: 130, scale: 0.9 },
  hard: { x: -340, y: 44, scale: 0.94 },
  good: { x: 360, y: -78, scale: 0.96 },
  easy: { x: 520, y: -190, scale: 1.02 },
};

/** The grade a horizontal offset currently means, or null inside the dead zone. */
export function gradeForOffset(offset: number): Grade | null {
  if (offset <= -THRESHOLD.hard) return 'again';
  if (offset <= -THRESHOLD.soft) return 'hard';
  if (offset >= THRESHOLD.hard) return 'easy';
  if (offset >= THRESHOLD.soft) return 'good';
  return null;
}

export function Flashcard({
  card,
  revealed,
  chosen,
  onChoose,
  onReveal,
  onGrade,
  onDragGrade,
  exitGrade,
  reduce,
  swipeEnabled,
}: {
  card: SessionCard;
  revealed: boolean;
  chosen: number | null;
  onChoose: (index: number) => void;
  onReveal: () => void;
  onGrade: (grade: Grade) => void;
  /** Fires as the drag crosses zones, so the outcome rail can light up in step. */
  onDragGrade: (grade: Grade | null) => void;
  exitGrade: Grade | null;
  reduce: boolean;
  swipeEnabled: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const surfaceRef = useRef<HTMLDivElement>(null);

  /*
   * A card never un-flips.
   *
   * The parent resets its `revealed` flag the instant a grade is chosen, because the *next*
   * card must arrive face down. But this instance is still on screen at that moment, sailing
   * off to the left or right, and it was showing an answer — so honouring that reset makes
   * the card turn back to its question mid-throw, which reads as the app changing its mind.
   * Latching it here keeps the reset where it belongs (the next card) without the parent
   * having to know that a card outlives its own turn.
   *
   * Safe because the instance is keyed on the card id: the next card is a new component with
   * this latch back at false.
   */
  const [latched, setLatched] = useState(revealed);
  // Adjusted during render rather than in an effect: React re-runs this component
  // immediately with the new value, so the card never paints a frame face-down after it
  // has been revealed. An effect would let that frame through.
  if (revealed && !latched) setLatched(true);
  const faceUp = revealed || latched;

  /* ------------------------------------------------------------- pointer */

  // 0..1 across the card. Centred, so an untouched card sits perfectly flat.
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);

  const tiltX = useSpring(useTransform(py, [0, 1], [TILT, -TILT]), TILT_SPRING);
  const tiltY = useSpring(useTransform(px, [0, 1], [-TILT, TILT]), TILT_SPRING);

  const highlightX = useTransform(px, (v) => `${v * 100}%`);
  const highlightY = useTransform(py, (v) => `${v * 100}%`);
  const highlight = useMotionTemplate`radial-gradient(420px circle at ${highlightX} ${highlightY}, oklch(1 0 0 / 0.16), transparent 62%)`;

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      // Coarse pointers have no hover, so a "position" only exists mid-tap — tilting from it
      // makes the card kick sideways the instant a thumb lands on it.
      if (reduce || event.pointerType !== 'mouse') return;
      const rect = surfaceRef.current?.getBoundingClientRect();
      if (!rect) return;
      px.set((event.clientX - rect.left) / rect.width);
      py.set((event.clientY - rect.top) / rect.height);
    },
    [px, py, reduce],
  );

  const resetTilt = useCallback(() => {
    px.set(0.5);
    py.set(0.5);
  }, [px, py]);

  /* ---------------------------------------------------------------- flip */

  /*
   * A spring on a plain number rather than a variant, because two other things have to be
   * derived from *where the flip currently is*: which face may receive clicks, and the
   * scale dip. A variant animation knows only its start and end.
   */
  const flip = useSpring(0, FLIP_SPRING);
  useEffect(() => {
    flip.set(faceUp ? 180 : 0);
  }, [flip, faceUp]);

  const rotateY = useTransform([flip, tiltY], ([f, t]: number[]) => (f ?? 0) + (t ?? 0));
  // Compresses through the turn and comes back — the card's own weight.
  const flipScale = useTransform(flip, [0, 90, 180], [1, 0.955, 1]);

  /* ---------------------------------------------------------------- drag */

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  // Rotation follows the throw rather than being animated separately, so a card released
  // mid-gesture unwinds its rotation and its position together.
  const rotate = useTransform(x, [-320, 0, 320], [-14, 0, 14]);

  /*
   * Zones are reported only while a finger is actually down.
   *
   * `x` is not driven by the drag alone — the exit animation throws the card 500px sideways
   * through exactly the same motion value, which sailed it through the Good and Easy zones
   * on the way out and left the verdict chip lit above the *next* card. A ref rather than
   * the `dragging` state because this fires on animation frames, and reading render state
   * there is reading a value that is one commit behind.
   */
  const draggingRef = useRef(false);
  const lastZone = useRef<Grade | null>(null);
  useMotionValueEvent(x, 'change', (value) => {
    if (!draggingRef.current) return;
    const zone = gradeForOffset(value);
    if (zone === lastZone.current) return;
    lastZone.current = zone;
    onDragGrade(zone);
  });

  const canDrag = swipeEnabled && faceUp && !reduce;

  const handleDragEnd = useCallback(
    (_: unknown, info: PanInfo) => {
      draggingRef.current = false;
      setDragging(false);
      /*
       * Velocity is folded into the offset rather than tested separately. A quick flick
       * that only travels 60px is unambiguously a throw, and requiring it to also cross a
       * fixed distance is what makes gesture interfaces feel like they are ignoring you.
       */
      const projected = info.offset.x + info.velocity.x * 0.12;
      const grade = gradeForOffset(projected);
      if (grade) {
        onGrade(grade);
        return;
      }
      onDragGrade(null);
      lastZone.current = null;
    },
    [onGrade, onDragGrade],
  );

  /* --------------------------------------------------------------- click */

  const handleSurfaceClick = useCallback(() => {
    if (faceUp) return;
    // A choice card is answered by choosing; flipping it early would skip the question.
    if (card.correctOption !== null && chosen === null) return;
    onReveal();
  }, [faceUp, card.correctOption, chosen, onReveal]);

  return (
    <motion.div
      // `key` lives on the caller's AnimatePresence; this element owns only the throw.
      drag={canDrag ? 'x' : false}
      dragSnapToOrigin
      dragElastic={0.5}
      dragConstraints={{ left: 0, right: 0 }}
      onDragStart={() => {
        draggingRef.current = true;
        setDragging(true);
      }}
      onDragEnd={handleDragEnd}
      style={{ x, y, rotate, touchAction: canDrag ? 'pan-y' : 'auto' }}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 40, scale: 0.93 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
      exit={
        exitGrade && !reduce
          ? {
              ...EXIT[exitGrade],
              opacity: 0,
              transition: { duration: 0.34, ease: [0.32, 0, 0.67, 0] },
            }
          : { opacity: 0, scale: 0.96, transition: { duration: reduce ? 0.12 : 0.2 } }
      }
      transition={reduce ? { duration: 0.15 } : { type: 'spring', stiffness: 260, damping: 26 }}
      className={cn('absolute inset-x-0 top-0', canDrag && 'cursor-grab active:cursor-grabbing')}
    >
      <div
        ref={surfaceRef}
        onPointerMove={onPointerMove}
        onPointerLeave={resetTilt}
        className={cn('[perspective:1600px]', !reduce && !dragging && !faceUp && 'animate-float')}
      >
        <motion.div
          style={{
            rotateX: reduce ? 0 : tiltX,
            rotateY: reduce ? 0 : rotateY,
            scale: reduce ? 1 : flipScale,
            transformStyle: 'preserve-3d',
          }}
          className="relative"
        >
          {/*
            Both faces are always mounted and the back is pre-rotated, so the flip is one
            transform on one element. Cross-fading two absolutely-positioned divs is the
            usual shortcut and it is exactly what makes a flip read as a slideshow.

            Under reduced motion there is no rotation to hide a face behind, so the faces
            are toggled with `hidden` instead of backface culling.
          */}
          <Face
            hidden={reduce && faceUp}
            aria-hidden={faceUp}
            reduce={reduce}
            highlight={highlight}
          >
            <CardFront card={card} chosen={chosen} onChoose={onChoose} disabled={faceUp} />
          </Face>

          <Face
            back
            hidden={reduce && !faceUp}
            aria-hidden={!faceUp}
            reduce={reduce}
            highlight={highlight}
          >
            <CardBack card={card} chosen={chosen} />
          </Face>
        </motion.div>
      </div>

      {/*
        The reveal control is a real button covering the card rather than a click handler on
        a div: it is focusable, it is announced, and Space and Enter work on it for free.
        It leaves the DOM once the card is revealed so the answer's own content — links,
        scrolling, the choice buttons' disabled state — is reachable underneath.
      */}
      {!faceUp && (
        <button
          type="button"
          onClick={handleSurfaceClick}
          className="rounded-hero absolute inset-0 z-10 cursor-pointer"
          // Choice cards keep their own buttons clickable through this overlay.
          style={{ pointerEvents: card.correctOption !== null ? 'none' : 'auto' }}
        >
          <span className="sr-only">Reveal the answer to: {card.front}</span>
        </button>
      )}

      {/* Announced to screen readers the moment the answer becomes available. */}
      <div aria-live="polite" className="sr-only">
        {faceUp ? `Answer: ${card.back}${card.explanation ? `. ${card.explanation}` : ''}` : ''}
      </div>

      <span className="sr-only" aria-hidden={!canDrag}>
        {canDrag
          ? 'You can also swipe this card: left to mark it forgotten, right to mark it known.'
          : ''}
      </span>
    </motion.div>
  );
}

/**
 * One face of the card.
 *
 * The layering is four flat passes rather than a texture: a tinted gradient ground, a
 * pointer-tracked highlight, a hairline inner ring that catches the "light" at the top
 * edge, and the content plane floating above all of it. Together they read as a physical
 * card under a light source, and none of them is an image that can fail to load or a blur
 * that costs a repaint.
 */
function Face({
  children,
  back,
  reduce,
  highlight,
  hidden,
  ...props
}: {
  children: React.ReactNode;
  back?: boolean;
  reduce: boolean;
  highlight: ReturnType<typeof useMotionTemplate>;
  hidden?: boolean;
  'aria-hidden'?: boolean;
}) {
  return (
    <div
      {...props}
      hidden={hidden}
      style={{
        backfaceVisibility: reduce ? 'visible' : 'hidden',
        WebkitBackfaceVisibility: reduce ? 'visible' : 'hidden',
        transform: back ? 'rotateY(180deg)' : undefined,
        ...(back && !reduce ? { position: 'absolute', inset: 0 } : {}),
      }}
      className={cn(
        'rounded-hero border-border bg-bg-elevated shadow-float relative flex flex-col overflow-hidden border',
        CARD_HEIGHT,
      )}
    >
      {/* Ground: a barely-there wash so the card is not flat white on a flat canvas. */}
      <div
        className={cn(
          'pointer-events-none absolute inset-0',
          back
            ? 'from-pulse-500/7 to-iris-500/8 bg-linear-to-br via-transparent'
            : 'from-iris-500/5 to-pulse-500/7 bg-linear-to-br via-transparent',
        )}
        aria-hidden
      />

      {/* The pointer highlight. Purely decorative; switched off under reduced motion. */}
      {!reduce && (
        <motion.div
          style={{ background: highlight }}
          className="pointer-events-none absolute inset-0 opacity-70 mix-blend-plus-lighter dark:opacity-40"
          aria-hidden
        />
      )}

      {/* The lit top edge. One pixel, and it is what sells the card as having thickness. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-white/70 to-transparent dark:via-white/25"
        aria-hidden
      />

      <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
