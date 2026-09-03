import { describe, expect, it } from 'vitest';

import { drawPaper, paperSize, shuffle } from '@/lib/assessments/draw';

/**
 * The draw's rules, exhaustively.
 *
 * This is the piece a student experiences directly — whether the questions feel fresh — and
 * the piece nobody can eyeball, because the answer is a distribution rather than a value. So
 * the randomness is injected and the properties are asserted: unseen questions come first,
 * repeats appear only when the unseen pool cannot fill the window, a paper never contains
 * the same question twice, and the repeats are not sitting in a block at the end where a
 * student could learn to recognise them.
 */

/** A fixed sequence standing in for `Math.random`, cycling so it never runs dry. */
function sequence(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length]!;
}

const bank = (n: number) => Array.from({ length: n }, (_, i) => `q${i + 1}`);

describe('paperSize', () => {
  it('serves the whole bank when no window is set', () => {
    expect(paperSize({ bankSize: 500, questionsPerAttempt: null })).toBe(500);
    expect(paperSize({ bankSize: 500, questionsPerAttempt: 0 })).toBe(500);
  });

  it('never promises more questions than have been written', () => {
    expect(paperSize({ bankSize: 12, questionsPerAttempt: 20 })).toBe(12);
  });
});

describe('drawing a paper', () => {
  it('fills the window and never repeats a question within one paper', () => {
    const paper = drawPaper({ poolIds: bank(500), seenIds: [], size: 20 });

    expect(paper).toHaveLength(20);
    expect(new Set(paper.map((q) => q.questionId)).size).toBe(20);
    expect(paper.every((q) => q.fresh)).toBe(true);
  });

  it('takes only unseen questions while there are enough of them', () => {
    const pool = bank(100);
    const seen = pool.slice(0, 70);

    const paper = drawPaper({ poolIds: pool, seenIds: seen, size: 20 });

    expect(paper).toHaveLength(20);
    expect(paper.some((q) => seen.includes(q.questionId))).toBe(false);
  });

  it('tops a short window up at random once the unseen pool runs low', () => {
    // The brief's own case: 490 of 500 answered, a window of 20.
    const pool = bank(500);
    const seen = pool.slice(0, 490);

    const paper = drawPaper({ poolIds: pool, seenIds: seen, size: 20 });

    expect(paper).toHaveLength(20);
    expect(paper.filter((q) => q.fresh)).toHaveLength(10);
    expect(paper.filter((q) => !q.fresh)).toHaveLength(10);

    // Every one of the ten unseen questions is used before any repeat is reached for.
    const unseen = pool.slice(490);
    expect(paper.filter((q) => unseen.includes(q.questionId))).toHaveLength(10);
    expect(new Set(paper.map((q) => q.questionId)).size).toBe(20);
  });

  it('keeps serving full papers once the whole bank has been seen', () => {
    const pool = bank(40);
    const paper = drawPaper({ poolIds: pool, seenIds: pool, size: 20 });

    expect(paper).toHaveLength(20);
    expect(paper.every((q) => !q.fresh)).toBe(true);
    expect(new Set(paper.map((q) => q.questionId)).size).toBe(20);
  });

  it('serves the whole bank, shuffled, when the window is larger than it', () => {
    const pool = bank(12);
    const paper = drawPaper({ poolIds: pool, seenIds: [], size: 20 });

    expect(paper).toHaveLength(12);
    expect(new Set(paper.map((q) => q.questionId))).toEqual(new Set(pool));
  });

  it('interleaves repeats rather than parking them at the end', () => {
    /*
     * A paper with its ten new questions first and its ten repeats last tells the student
     * which is which — and a student who can spot a repeat can skip the thinking. Asserted
     * across many draws rather than one, since any single shuffle may legitimately land the
     * repeats late.
     */
    const pool = bank(500);
    const seen = pool.slice(0, 490);

    let interleaved = 0;
    for (let i = 0; i < 50; i += 1) {
      const paper = drawPaper({ poolIds: pool, seenIds: seen, size: 20 });
      const firstRepeat = paper.findIndex((q) => !q.fresh);
      const lastFresh = paper.map((q) => q.fresh).lastIndexOf(true);
      if (firstRepeat < lastFresh) interleaved += 1;
    }

    expect(interleaved).toBeGreaterThan(40);
  });

  it('spreads its picks across the bank rather than favouring the front', () => {
    /*
     * The reason `shuffle` is Fisher–Yates and not `sort(() => random() - 0.5)`: the latter
     * leaves the head of the array where it started, so the same handful of questions would
     * come up sitting after sitting. Two hundred draws of one from a hundred should touch
     * most of the bank.
     */
    const pool = bank(100);
    const picked = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      const [first] = drawPaper({ poolIds: pool, seenIds: pool, size: 1 });
      picked.add(first!.questionId);
    }

    expect(picked.size).toBeGreaterThan(50);
  });

  it('has nothing to draw from an empty bank, and draws nothing for a zero window', () => {
    expect(drawPaper({ poolIds: [], seenIds: [], size: 20 })).toEqual([]);
    expect(drawPaper({ poolIds: bank(10), seenIds: [], size: 0 })).toEqual([]);
  });

  it('is deterministic for a given random sequence, so a failure can be reproduced', () => {
    const args = { poolIds: bank(50), seenIds: bank(50).slice(0, 45), size: 10 };
    const first = drawPaper({ ...args, random: sequence([0.1, 0.7, 0.3, 0.9, 0.5]) });
    const second = drawPaper({ ...args, random: sequence([0.1, 0.7, 0.3, 0.9, 0.5]) });

    expect(first).toEqual(second);
  });
});

describe('shuffle', () => {
  it('returns a permutation and leaves the original alone', () => {
    const original = bank(30);
    const copy = [...original];
    const shuffled = shuffle(original, Math.random);

    expect(original).toEqual(copy);
    expect([...shuffled].sort()).toEqual([...original].sort());
  });
});
