import { describe, expect, it } from 'vitest';

import {
  AWAY_GRACE_SECONDS,
  FOCUS_PRESETS,
  GROWTH_STAGES,
  GROWTH_TOLERANCE_SECONDS,
  type TreeRecord,
  breakAfterRound,
  formatFocusMinutes,
  groveStats,
  growthStage,
  hasRunFullRound,
  isAbandoned,
  plantingStreak,
  presetByKey,
  speciesFor,
} from '@/lib/domain/grove';

const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000);

function tree(overrides: Partial<TreeRecord> = {}): TreeRecord {
  return {
    id: Math.random().toString(36).slice(2),
    date: '2026-09-02',
    status: 'grown',
    species: 'neem',
    focusMinutes: 25,
    earnedMinutes: 25,
    witherReason: null,
    ...overrides,
  };
}

describe('presets', () => {
  it('falls back to the first preset for anything unknown', () => {
    expect(presetByKey('deep').focusMinutes).toBe(50);
    expect(presetByKey('nonsense').key).toBe(FOCUS_PRESETS[0]!.key);
    expect(presetByKey(null).key).toBe(FOCUS_PRESETS[0]!.key);
  });

  it('gives a long break only on the cadence round', () => {
    const classic = presetByKey('classic');
    expect(breakAfterRound(classic, 1)).toBe(classic.breakMinutes);
    expect(breakAfterRound(classic, 3)).toBe(classic.breakMinutes);
    expect(breakAfterRound(classic, 4)).toBe(classic.longBreakMinutes);
    expect(breakAfterRound(classic, 8)).toBe(classic.longBreakMinutes);
  });

  it('never treats round zero as a long break', () => {
    expect(breakAfterRound(presetByKey('deep'), 0)).toBe(presetByKey('deep').breakMinutes);
  });
});

describe('speciesFor', () => {
  it('grows a bigger species for a longer promise', () => {
    expect(speciesFor(10)).toBe('sprout');
    expect(speciesFor(20)).toBe('fern');
    expect(speciesFor(25)).toBe('neem');
    expect(speciesFor(50)).toBe('banyan');
    expect(speciesFor(90)).toBe('deodar');
  });

  it('gives every preset a species', () => {
    for (const preset of FOCUS_PRESETS) {
      expect(speciesFor(preset.focusMinutes)).toBeTruthy();
    }
  });
});

describe('growthStage', () => {
  it('holds the final stage back until the round actually completes', () => {
    expect(growthStage(0.97)).toBeLessThan(GROWTH_STAGES - 1);
    expect(growthStage(0.999)).toBeLessThan(GROWTH_STAGES - 1);
    expect(growthStage(1)).toBe(GROWTH_STAGES - 1);
  });

  it('clamps rather than throwing on nonsense progress', () => {
    expect(growthStage(-4)).toBe(0);
    expect(growthStage(12)).toBe(GROWTH_STAGES - 1);
  });

  it('never goes backwards as progress rises', () => {
    let last = -1;
    for (let p = 0; p <= 1.0001; p += 0.02) {
      const stage = growthStage(p);
      expect(stage).toBeGreaterThanOrEqual(last);
      last = stage;
    }
  });
});

describe('hasRunFullRound', () => {
  it('refuses a round that has not run its length', () => {
    expect(hasRunFullRound({ plantedAt: at(10), focusMinutes: 25 })).toBe(false);
    expect(hasRunFullRound({ plantedAt: at(24.5), focusMinutes: 25 })).toBe(false);
  });

  it('accepts a completed round, and one that is a few seconds short', () => {
    expect(hasRunFullRound({ plantedAt: at(25), focusMinutes: 25 })).toBe(true);
    expect(hasRunFullRound({ plantedAt: at(60), focusMinutes: 25 })).toBe(true);
    const nearly = new Date(Date.now() - (25 * 60 - (GROWTH_TOLERANCE_SECONDS - 1)) * 1000);
    expect(hasRunFullRound({ plantedAt: nearly, focusMinutes: 25 })).toBe(true);
  });

  it('leaves less slack than the away grace, so walking away can never buy a tree', () => {
    expect(GROWTH_TOLERANCE_SECONDS).toBeLessThan(AWAY_GRACE_SECONDS);
  });
});

describe('isAbandoned', () => {
  it('leaves a round alone while it could still be running', () => {
    expect(isAbandoned({ plantedAt: at(10), focusMinutes: 25 })).toBe(false);
    expect(isAbandoned({ plantedAt: at(25.5), focusMinutes: 25 })).toBe(false);
  });

  it('sweeps a round that is well past due', () => {
    expect(isAbandoned({ plantedAt: at(40), focusMinutes: 25 })).toBe(true);
  });
});

describe('groveStats', () => {
  it('counts only grown trees towards focus time', () => {
    const stats = groveStats([
      tree({ focusMinutes: 25, earnedMinutes: 25 }),
      tree({ focusMinutes: 50, earnedMinutes: 50 }),
      tree({ status: 'withered', earnedMinutes: 0, witherReason: 'left' }),
    ]);
    expect(stats.grown).toBe(2);
    expect(stats.withered).toBe(1);
    expect(stats.focusMinutes).toBe(75);
    expect(stats.survivalPct).toBe(67);
  });

  it('reports a full survival rate before anything has been planted', () => {
    expect(groveStats([]).survivalPct).toBe(100);
    expect(groveStats([]).bestDay).toBeNull();
  });

  it('breaks a best-day tie towards the earlier day', () => {
    const stats = groveStats([
      tree({ date: '2026-08-30' }),
      tree({ date: '2026-08-30' }),
      tree({ date: '2026-09-01' }),
      tree({ date: '2026-09-01' }),
    ]);
    expect(stats.bestDay).toEqual({ date: '2026-08-30', trees: 2 });
  });

  it('ignores rounds still in the ground', () => {
    const stats = groveStats([tree({ status: 'growing', earnedMinutes: 0 })]);
    expect(stats.grown).toBe(0);
    expect(stats.withered).toBe(0);
    expect(stats.focusMinutes).toBe(0);
  });
});

describe('plantingStreak', () => {
  it('counts back from today', () => {
    expect(plantingStreak(['2026-09-02', '2026-09-01', '2026-08-31'], '2026-09-02')).toBe(3);
  });

  it('does not break a run just because today is still empty', () => {
    expect(plantingStreak(['2026-09-01', '2026-08-31'], '2026-09-02')).toBe(2);
  });

  it('breaks on a genuinely missed day', () => {
    expect(plantingStreak(['2026-09-02', '2026-08-31'], '2026-09-02')).toBe(1);
    expect(plantingStreak(['2026-08-28'], '2026-09-02')).toBe(0);
  });

  it('is unbothered by duplicates and an empty history', () => {
    expect(plantingStreak(['2026-09-02', '2026-09-02'], '2026-09-02')).toBe(1);
    expect(plantingStreak([], '2026-09-02')).toBe(0);
  });

  it('crosses a month boundary', () => {
    expect(plantingStreak(['2026-09-01', '2026-08-31', '2026-08-30'], '2026-09-01')).toBe(3);
  });
});

describe('formatFocusMinutes', () => {
  it('reads as a duration a student would say out loud', () => {
    expect(formatFocusMinutes(0)).toBe('0m');
    expect(formatFocusMinutes(45)).toBe('45m');
    expect(formatFocusMinutes(60)).toBe('1h');
    expect(formatFocusMinutes(85)).toBe('1h 25m');
  });
});
