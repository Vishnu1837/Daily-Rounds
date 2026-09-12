import { describe, expect, it } from 'vitest';

import {
  FULLSCREEN_EXIT_LIMIT,
  fullscreenState,
  fullscreenWarning,
} from '@/lib/assessments/integrity';

/**
 * The full-screen rule, checked as arithmetic.
 *
 * The point of these is that the number a student is warned with and the number the server
 * voids on are the same number. A warning that said "one exit left" on the exit that
 * actually ended the attempt would be worse than no warning, so the boundary is asserted
 * from both directions.
 */

describe('fullscreenState', () => {
  it('counts down to the limit and stops there', () => {
    expect(fullscreenState(0)).toEqual({ exits: 0, remaining: 5, invalidated: false });
    expect(fullscreenState(1)).toEqual({ exits: 1, remaining: 4, invalidated: false });
    expect(fullscreenState(4)).toEqual({ exits: 4, remaining: 1, invalidated: false });
  });

  it('invalidates on the fifth exit and not the fourth', () => {
    expect(fullscreenState(FULLSCREEN_EXIT_LIMIT - 1).invalidated).toBe(false);
    expect(fullscreenState(FULLSCREEN_EXIT_LIMIT).invalidated).toBe(true);
  });

  it('never reports a negative allowance past the limit', () => {
    expect(fullscreenState(9)).toEqual({ exits: 9, remaining: 0, invalidated: true });
  });

  it('treats nonsense counts as none', () => {
    expect(fullscreenState(-3).exits).toBe(0);
    expect(fullscreenState(2.7).exits).toBe(2);
  });
});

describe('fullscreenWarning', () => {
  it('says how many are left while the attempt is alive', () => {
    expect(fullscreenWarning(fullscreenState(1))).toContain('4 more exits');
    expect(fullscreenWarning(fullscreenState(4))).toContain('1 more exit');
  });

  it('says the attempt is over once the limit is reached', () => {
    const message = fullscreenWarning(fullscreenState(FULLSCREEN_EXIT_LIMIT));
    expect(message).toContain('no longer counts');
    expect(message).not.toContain('more exits');
  });
});
