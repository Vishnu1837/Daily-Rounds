/**
 * The full-screen rule, as arithmetic.
 *
 * An assessment is sat in full screen, and dropping out of it is counted. The count is the
 * whole of the rule, so it lives here as a pure function rather than inside the action that
 * writes the row: what a student is warned about, what the server decides, and what the
 * cohort lead reads afterwards are then the same three numbers, derived once.
 *
 * Like the focus detection beside it, this is a deterrent rather than proctoring. Full
 * screen cannot stop a second device and does not pretend to; what it does is make the
 * ordinary ways of reading something else — another window, another tab, the desktop —
 * impossible to do silently.
 */

/**
 * Exits allowed before the sitting stops counting.
 *
 * Five, not one: full screen is left by accident often enough that a single strike would
 * void honest attempts — an OS dialog, a screen share prompt, a stray Escape while
 * answering. Five is past the point of accident.
 */
export const FULLSCREEN_EXIT_LIMIT = 5;

export type FullscreenState = {
  /** Exits recorded against this sitting, including the one just seen. */
  exits: number;
  /** Exits still available before the attempt is void. Never negative. */
  remaining: number;
  /** True once the limit is reached: the attempt no longer counts. */
  invalidated: boolean;
};

/** What a given number of exits means for the attempt. */
export function fullscreenState(exits: number, limit = FULLSCREEN_EXIT_LIMIT): FullscreenState {
  const counted = Math.max(0, Math.trunc(exits));
  return {
    exits: counted,
    remaining: Math.max(0, limit - counted),
    invalidated: counted >= limit,
  };
}

/**
 * The sentence a student sees when they come back to full screen.
 *
 * Written here so the warning and the consequence cannot drift apart — a dialog that said
 * "two warnings left" while the server was about to void the attempt would be worse than no
 * dialog at all.
 */
export function fullscreenWarning(state: FullscreenState, limit = FULLSCREEN_EXIT_LIMIT): string {
  if (state.invalidated) {
    return `You left full screen ${state.exits} times. ${limit} exits void an attempt, so this sitting no longer counts — your cohort lead can see it.`;
  }
  const nth = state.exits === 1 ? 'once' : `${state.exits} times`;
  return `You have left full screen ${nth}. ${state.remaining} more ${
    state.remaining === 1 ? 'exit' : 'exits'
  } and this attempt stops counting.`;
}
