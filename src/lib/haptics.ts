'use client';

/**
 * Haptic feedback.
 *
 * The product's whole loop is a phone in a student's hand at 9pm: plant a round, sit it out,
 * check in. Every one of those moments already has a visual reward — a tree that grows, a
 * counter that climbs, a confetti burst. On a phone, none of them are *felt*. A vibration is
 * the one channel that reaches the student while they are looking at the page rather than at
 * the moment the animation happens to fire, and it is the difference between a button that
 * responds and a button that merely repaints.
 *
 * Three rules hold this module together:
 *
 *   1. **A pattern means something.** The vocabulary below is the same vocabulary the colours
 *      use: `commit` is what a promise feels like, `wither` is what losing one feels like, and
 *      they are never swapped for variety. A haptic that fires differently for the same event
 *      teaches the hand nothing, which is the same argument the celebration colours make.
 *
 *   2. **Silence is always a valid outcome.** `navigator.vibrate` is unimplemented on iOS
 *      Safari and on every desktop browser, and is ignored inside a tab that has never been
 *      tapped. So this can never be the only feedback an interaction gives — it decorates the
 *      visual response, exactly as `Reveal` decorates content that is already on screen.
 *
 *   3. **Reduced motion silences it.** Vestibular sensitivity and vibration sensitivity are
 *      not the same thing, but `prefers-reduced-motion` is the only signal a browser gives us
 *      and a student who has asked the product to calm down has asked once, not per channel.
 */

/** How strong a moment is, in the product's own terms. */
export type Haptic =
  /** A control accepted the press. The lightest thing in the vocabulary. */
  | 'tap'
  /** A step gave way to the next one — check-in questions, a segmented control. */
  | 'advance'
  /** A promise was made: a round planted, a check-in submitted. Deliberately weightier. */
  | 'commit'
  /** A round survived, a milestone paid, a level turned over. */
  | 'celebrate'
  /** Something was lost. The only pattern in the set that does not feel good on purpose. */
  | 'wither';

/*
 * Durations are in milliseconds, alternating vibrate/pause. They are short on purpose: a
 * phone buzzing for a third of a second reads as a notification from another app, not as this
 * one answering. `celebrate` is the only ascending pattern and `wither` the only descending
 * one, so the two cannot be confused through a pocket.
 */
const PATTERNS: Record<Haptic, number | number[]> = {
  tap: 8,
  advance: 12,
  commit: [14, 40, 22],
  celebrate: [12, 36, 18, 36, 34],
  wither: [34, 44, 12],
};

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/**
 * Whether this device can vibrate and the visitor has not asked us not to.
 *
 * Read at call time rather than cached: a student can change the OS preference while the tab
 * is open, and the check is two property lookups and a media query — far cheaper than the
 * subscription it would take to keep a cached copy honest.
 */
function allowed(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  if (typeof navigator.vibrate !== 'function') return false;
  if (window.matchMedia?.(REDUCED_MOTION).matches) return false;
  return true;
}

/**
 * Fire a haptic. Safe to call from anywhere, including a server-rendered module's event
 * handler and a browser that has never heard of the Vibration API.
 */
export function haptic(kind: Haptic): void {
  if (!allowed()) return;
  try {
    navigator.vibrate(PATTERNS[kind]);
  } catch {
    /*
     * `vibrate` throws in a few embedded webviews and inside cross-origin iframes that were
     * not granted the feature policy. There is nothing to recover — the interaction has
     * already given its visual answer — and an exception escaping an onClick would take the
     * real work down with it.
     */
  }
}

/** Stop any vibration in progress. Used when a screen unmounts mid-pattern. */
export function cancelHaptics(): void {
  if (!allowed()) return;
  try {
    navigator.vibrate(0);
  } catch {
    /* See `haptic`. */
  }
}
