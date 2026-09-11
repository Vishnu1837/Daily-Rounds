import { describe, expect, it } from 'vitest';

import {
  type TopicDraft,
  nextUnstudiedTopic,
  summariseTopicProgress,
  topicPageCount,
  validateTopicPlan,
} from '@/lib/domain/textbook-topics';

/**
 * The rules a chapter list has to obey.
 *
 * These matter more than their size suggests: a bad range is not a cosmetic bug but a
 * student opening chapter 9 and being shown chapter 8, or a reader asked for page 4,000 of
 * a 900-page book. The editor and the server both run this, so it is the only thing
 * standing between a generated mapping and what students read.
 */

function topic(overrides: Partial<TopicDraft> & { position: number }): TopicDraft {
  return {
    title: `Chapter ${overrides.position}`,
    startPage: overrides.position,
    endPage: overrides.position,
    ...overrides,
  };
}

describe('validateTopicPlan', () => {
  const good: TopicDraft[] = [
    { position: 1, title: 'Introduction Upper Limb', startPage: 1, endPage: 4 },
    { position: 2, title: 'Bones', startPage: 5, endPage: 30 },
    { position: 3, title: 'Pectoral Region', startPage: 30, endPage: 48 },
  ];

  it('accepts a contiguous plan that fits the book', () => {
    expect(validateTopicPlan(good, 100)).toEqual([]);
  });

  it('accepts chapters that share a boundary page', () => {
    // Chapter 2 ends and chapter 3 begins on page 30 — a chapter ending mid-page is normal.
    expect(validateTopicPlan(good, 48)).toEqual([]);
  });

  it('rejects an empty plan with something actionable', () => {
    expect(validateTopicPlan([], 100)).toHaveLength(1);
  });

  it('catches a chapter that runs past the end of the book', () => {
    const problems = validateTopicPlan(good, 40);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('the book has 40 pages');
  });

  it('skips the length check when the book has not loaded', () => {
    expect(validateTopicPlan(good, null)).toEqual([]);
  });

  it('catches a backwards range', () => {
    const problems = validateTopicPlan([topic({ position: 1, startPage: 9, endPage: 4 })], 100);
    expect(problems.some((p) => p.includes('before it starts'))).toBe(true);
  });

  it('catches page zero', () => {
    const problems = validateTopicPlan([topic({ position: 1, startPage: 0, endPage: 3 })], 100);
    expect(problems.some((p) => p.includes('pages start at 1'))).toBe(true);
  });

  it('catches a fractional page', () => {
    const problems = validateTopicPlan([topic({ position: 1, startPage: 1.5, endPage: 3 })], 100);
    expect(problems.some((p) => p.includes('not a whole number'))).toBe(true);
  });

  it('catches an empty title', () => {
    const problems = validateTopicPlan([topic({ position: 1, title: '   ' })], 100);
    expect(problems.some((p) => p.includes('no title'))).toBe(true);
  });

  it('catches positions that skip', () => {
    const problems = validateTopicPlan([topic({ position: 1 }), topic({ position: 3 })], 100);
    expect(problems.some((p) => p.includes('Positions must run 1 to 2'))).toBe(true);
  });

  it('catches chapters that go backwards through the book', () => {
    const problems = validateTopicPlan(
      [
        { position: 1, title: 'Two', startPage: 40, endPage: 60 },
        { position: 2, title: 'One', startPage: 10, endPage: 39 },
      ],
      100,
    );
    expect(problems.some((p) => p.includes('before topic 1'))).toBe(true);
  });

  it('catches a chapter swallowed inside the previous one', () => {
    const problems = validateTopicPlan(
      [
        { position: 1, title: 'Long', startPage: 10, endPage: 60 },
        { position: 2, title: 'Inside', startPage: 20, endPage: 30 },
      ],
      100,
    );
    expect(problems.some((p) => p.includes('inside topic 1'))).toBe(true);
  });

  it('reports every problem at once rather than the first', () => {
    const problems = validateTopicPlan(
      [
        { position: 1, title: '', startPage: 0, endPage: 3 },
        { position: 5, title: 'Two', startPage: 9, endPage: 4 },
      ],
      100,
    );
    expect(problems.length).toBeGreaterThanOrEqual(4);
  });
});

describe('topicPageCount', () => {
  it('counts both ends', () => {
    expect(topicPageCount({ startPage: 5, endPage: 30 })).toBe(26);
  });

  it('counts a one-page chapter as one page', () => {
    expect(topicPageCount({ startPage: 7, endPage: 7 })).toBe(1);
  });
});

describe('summariseTopicProgress', () => {
  const topics = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];

  it('counts and rounds', () => {
    expect(summariseTopicProgress(topics, new Set(['a']))).toEqual({
      studied: 1,
      total: 4,
      percent: 25,
    });
  });

  it('is zero, not NaN, for a book with no chapters', () => {
    expect(summariseTopicProgress([], new Set())).toEqual({ studied: 0, total: 0, percent: 0 });
  });

  it('ignores marks for chapters that are no longer in the book', () => {
    expect(summariseTopicProgress(topics, new Set(['a', 'gone'])).studied).toBe(1);
  });

  it('reaches exactly 100 when everything is read', () => {
    expect(summariseTopicProgress(topics, new Set(['a', 'b', 'c', 'd'])).percent).toBe(100);
  });
});

describe('nextUnstudiedTopic', () => {
  const topics = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('offers the first chapter of an untouched book', () => {
    expect(nextUnstudiedTopic(topics, new Set())?.id).toBe('a');
  });

  it('offers the earliest gap, not the one after the furthest read', () => {
    // Someone who dipped into chapter 3 has not finished chapters 1 and 2.
    expect(nextUnstudiedTopic(topics, new Set(['c']))?.id).toBe('a');
  });

  it('offers nothing once the book is finished', () => {
    expect(nextUnstudiedTopic(topics, new Set(['a', 'b', 'c']))).toBeNull();
  });
});
