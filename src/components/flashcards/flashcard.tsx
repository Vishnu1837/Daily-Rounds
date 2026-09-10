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
 * The card's box: a floor, and a ceiling sized off the viewport.
 *
 * The card is as tall as the thing written on it. A fixed height meant every card was the
 * height of the longest one it might ever have to hold — a two-word definition floated in a
 * field of white, and, worse, a five-option question on a short window was handed a box it
 * did not fit in and had its prompt scrolled out of sight above the first option. Sizing to
 * content fixes both ends of that: the short card shrinks, the long one grows.
 *
 * The floor stops a one-word answer from collapsing into a chip — it still has to read as a
 * card. The ceiling is what keeps the grade buttons above the fold: a 34rem card is right on
 * a laptop and wrong on a short window, where it pushes the four buttons below it off the
 * screen — and a student who has to scroll to answer has been handed back every millisecond
 * the rest of this file spent making the interaction quick. Only a card that would exceed
 * that ceiling scrolls internally, and by then scrolling is the honest answer.
 *
 * Two clamps rather than one because the two layouts do not have the same furniture: a
 * phone additionally carries the floating bottom bar and a taller header, so several more
 * rem of the viewport is already spoken for before the card gets any. Sharing a single
 * subtrahend meant either a stunted card on the desktop or grade buttons sitting underneath
 * the navigation on a phone — which is the one place they must never be, because that is
 * exactly where the thumb is.
 *
 * The phone's subtrahend is measured rather than guessed, and it is what everything above
 * and below the card actually occupies on a 375×812 viewport: the header and the deck's own
 * title and progress rail above (13rem), the gap and the grade buttons below (8.75rem), and
 * the floating bottom bar (5rem), with a little over a rem left so a deck title that wraps
 * to two lines does not spend the card's height.
 *
 * `--viewing-as-height` is the one piece of that furniture which is neither constant nor
 * known here: the bar an admin gets while viewing the app as a student, which is absent for
 * every ordinary student, one line tall on a desktop and three on a phone. It resolves to
 * `0px` from `globals.css` when there is no bar, and the bar publishes its own height when
 * there is. Without it, the height the card claims is height the window does not have, and
 * the grade buttons end up underneath the bottom bar for exactly the people whose job is to
 * check that they are not.
 *
 * Exported because the stack layers behind the card are sized from the live card rather than
 * from this, and the stage needs the same floor before the first card has been measured.
 */
export const CARD_BOX = [
  'min-h-[14rem] sm:min-h-[15rem]',
  'max-h-[clamp(14rem,calc(100dvh-27.5rem-var(--viewing-as-height)),34rem)]',
  'sm:max-h-[clamp(15rem,calc(100dvh-21rem-var(--viewing-as-height)),34rem)]',
].join(' ');

/** The stage's height before a card has been measured, and while the cover is still on. */
export const CARD_FALLBACK_HEIGHT = 'min-h-[24rem] sm:min-h-[27rem]';

/** How far the card leans, in degrees, at the very corner. Small on purpose. */
const TILT = 7;

/** Drag distance, in px, at which each grade takes over. */
const THRESHOLD = { soft: 52, hard: 128 } as const;

/**
 * How far a face-down card must be thrown — in any direction, velocity folded in — before
 * it counts as a skip and loops to the back of the deck. The card-stack "send to back"
 * gesture; kept well clear of an accidental nudge.
 */
const SKIP_SENSITIVITY = 120;

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

/**
 * Where a card goes as it leaves, by intent.
 *
 * A `Grade` throws it away in that grade's own direction and distance; `'skip'` settles it
 * straight down and a touch smaller, so it reads as tucking back under the deck rather than
 * being discarded; anything else is a plain fade. Resolved dynamically from the caller's
 * `AnimatePresence` `custom`, so the outgoing card uses the intent from the moment it left.
 */
export function exitTarget(intent: Grade | 'skip' | null, reduce: boolean) {
  if (reduce) return { opacity: 0, transition: { duration: 0.12 } };
  if (intent === 'skip') {
    return {
      x: 0,
      y: 16,
      scale: 0.95,
      opacity: 0,
      transition: { type: 'spring' as const, stiffness: 300, damping: 30 },
    };
  }
  if (intent) {
    return {
      ...EXIT[intent],
      opacity: 0,
      transition: { duration: 0.34, ease: [0.32, 0, 0.67, 0] as const },
    };
  }
  return { opacity: 0, scale: 0.96, transition: { duration: 0.2 } };
}

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
  onSkip,
  reduce,
  swipeEnabled,
  skipEnabled,
  onMeasure,
}: {
  card: SessionCard;
  revealed: boolean;
  chosen: number | null;
  onChoose: (index: number) => void;
  onReveal: () => void;
  onGrade: (grade: Grade) => void;
  /** Fires as the drag crosses zones, so the outcome rail can light up in step. */
  onDragGrade: (grade: Grade | null) => void;
  /** Fires when a face-down card is thrown far enough to send it to the back of the deck. */
  onSkip: () => void;
  reduce: boolean;
  swipeEnabled: boolean;
  /** Whether the face-down skip throw is available (off for the last remaining card). */
  skipEnabled: boolean;
  /**
   * Reports the card's laid-out height, tagged with the card it belongs to, whenever that
   * height changes — on mount, on flip, on a choice that grows the face, on a resize.
   *
   * Tagged because a graded card is still mounted and still being measured while it sails
   * off the stage; the caller keys on the id so the outgoing card cannot resize the stage
   * out from under the one that has replaced it.
   */
  onMeasure?: (cardId: string, height: number) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const surfaceRef = useRef<HTMLDivElement>(null);

  /*
   * The card is absolutely positioned inside the stage, so it cannot push the stage to its
   * own size the way a card in flow would — the stage has to be told. A ResizeObserver
   * rather than a measurement on render because most of what changes the height happens
   * after a commit: a web font landing, an image decoding, the answer side turning up.
   *
   * `contentRect` is a layout box, so none of this file's transforms — the tilt, the scale
   * dip through the flip, the throw — perturb it. The observed element is the untransformed
   * wrapper for the same reason.
   */
  useEffect(() => {
    const element = surfaceRef.current;
    if (!element || !onMeasure) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const height = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
      if (height > 0) onMeasure(card.id, height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [card.id, onMeasure]);

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

  /*
   * Two throws share the one draggable element, and which one is live depends only on
   * whether the card is face up:
   *   - face up  → drag left/right to grade (`canGrade`), x-axis only so the page can still
   *     scroll vertically under a thumb.
   *   - face down → throw in any direction to skip (`canSkip`), the card-stack send-to-back.
   */
  const canGrade = swipeEnabled && faceUp && !reduce;
  const canSkip = skipEnabled && !faceUp && !reduce;
  const canDrag = canGrade || canSkip;

  // Set the moment a real drag begins; read by the reveal click so a throw never also flips.
  const didDragRef = useRef(false);

  const handleDragEnd = useCallback(
    (_: unknown, info: PanInfo) => {
      draggingRef.current = false;
      setDragging(false);

      if (!faceUp) {
        /*
         * Skip: any direction, velocity folded in the same way the grade throw folds it, so
         * a fast flick counts even if it did not travel the full distance. Under the
         * threshold, `dragSnapToOrigin` carries the card back on its own.
         */
        const projectedX = info.offset.x + info.velocity.x * 0.08;
        const projectedY = info.offset.y + info.velocity.y * 0.08;
        if (Math.hypot(projectedX, projectedY) > SKIP_SENSITIVITY) onSkip();
        window.setTimeout(() => {
          didDragRef.current = false;
        }, 0);
        return;
      }

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
    [faceUp, onGrade, onSkip, onDragGrade],
  );

  /* --------------------------------------------------------------- click */

  const handleSurfaceClick = useCallback(() => {
    if (faceUp) return;
    // A throw that fell short still fires a click on release; it must not also flip the card.
    if (didDragRef.current) return;
    // A choice card is answered by choosing; flipping it early would skip the question.
    if (card.correctOption !== null && chosen === null) return;
    onReveal();
  }, [faceUp, card.correctOption, chosen, onReveal]);

  return (
    <motion.div
      // `key` lives on the caller's AnimatePresence; this element owns only the throw.
      drag={canGrade ? 'x' : canSkip ? true : false}
      dragSnapToOrigin
      dragElastic={0.5}
      dragConstraints={canSkip ? { top: 0, right: 0, bottom: 0, left: 0 } : { left: 0, right: 0 }}
      onDragStart={() => {
        draggingRef.current = true;
        didDragRef.current = true;
        setDragging(true);
      }}
      onDragEnd={handleDragEnd}
      style={{
        x,
        y,
        rotate,
        touchAction: canSkip ? 'none' : canGrade ? 'pan-y' : 'auto',
      }}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 40, scale: 0.93 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
      /*
        The exit is a dynamic variant so framer resolves it against the `custom` on the
        caller's `AnimatePresence`: the card that is leaving reads the intent set at the
        instant it left — `'skip'` settles it back down toward the deck, a `Grade` throws it
        away in that grade's direction, anything else is a plain fade.
      */
      variants={{ exit: (intent: Grade | 'skip' | null) => exitTarget(intent, reduce) }}
      exit="exit"
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
          className="relative grid"
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
        {canGrade
          ? 'You can also swipe this card: left to mark it forgotten, right to mark it known.'
          : canSkip
            ? 'You can throw this card away in any direction to skip it for now; it comes back later this session. Or press S.'
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
      }}
      /*
        Both faces occupy the same grid cell — `col-start-1 row-start-1` — rather than the
        back being taken out of flow with `position: absolute`. That is what lets the card
        size to its content: an absolutely positioned back is measured against the front and
        so contributes nothing, which means a long answer behind a short question would have
        been clipped the moment the card turned. Sharing a cell makes the card as tall as the
        taller of its two faces, so the height is settled before the flip starts and the card
        does not resize halfway through turning.
      */
      className={cn(
        'rounded-hero border-border bg-bg-elevated shadow-float relative col-start-1 row-start-1 flex flex-col overflow-hidden border',
        CARD_BOX,
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

      {/* `flex-auto`, not `flex-1`: see the note in `FaceShell`. A zero flex basis here
          would report the face as wanting no height, and the card would size to its floor
          no matter what was written on it. */}
      <div className="relative flex min-h-0 flex-auto flex-col">{children}</div>
    </div>
  );
}
