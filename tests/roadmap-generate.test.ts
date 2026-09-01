import { describe, expect, it } from 'vitest';

import { CURRICULUM_SUBJECTS, resolveRef } from '@/lib/curriculum';
import {
  generateRoadmapForSubject,
  generatedTopicsInOrder,
  progressPct,
  trackableUnitCount,
} from '@/lib/roadmap/generate';

describe('generateRoadmapForSubject', () => {
  it('returns null for a subject that is not in the curriculum', () => {
    expect(generateRoadmapForSubject('astrology')).toBeNull();
    expect(generateRoadmapForSubject('')).toBeNull();
  });

  it('covers every section of the subject, not just the first', () => {
    // The bug this replaces returned only the first section's topics.
    for (const subject of CURRICULUM_SUBJECTS) {
      const roadmap = generateRoadmapForSubject(subject.slug);
      expect(roadmap, subject.slug).not.toBeNull();
      expect(roadmap!.weeks).toHaveLength(subject.sections.length);
    }
  });

  it('generates a roadmap for all 19 subjects with a non-empty topic list', () => {
    expect(CURRICULUM_SUBJECTS).toHaveLength(19);
    for (const subject of CURRICULUM_SUBJECTS) {
      const roadmap = generateRoadmapForSubject(subject.slug)!;
      expect(roadmap.totalTopics, subject.slug).toBeGreaterThan(0);
    }
  });

  it('preserves curriculum order — positions ascend, gap-free, from zero', () => {
    const roadmap = generateRoadmapForSubject('anatomy')!;
    const positions = generatedTopicsInOrder(roadmap).map((t) => t.topic.position);

    expect(positions[0]).toBe(0);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(positions).toEqual(positions.map((_, i) => i));
  });

  it('keeps foundational topics ahead of later ones (order is not reversed)', () => {
    // Regression guard for the "roadmap ordering reversed" bug in the brief.
    const roadmap = generateRoadmapForSubject('anatomy')!;
    const flat = generatedTopicsInOrder(roadmap);

    const anatomy = CURRICULUM_SUBJECTS.find((s) => s.slug === 'anatomy')!;
    const expectedFirst = anatomy.sections[0]!.topics[0]!.title;
    const lastSection = anatomy.sections[anatomy.sections.length - 1]!;
    const expectedLast = lastSection.topics[lastSection.topics.length - 1]!.title;

    expect(flat[0]!.topic.title).toBe(expectedFirst);
    expect(flat[flat.length - 1]!.topic.title).toBe(expectedLast);
  });

  it('gives every topic a resolvable three-segment curriculum ref', () => {
    for (const subject of CURRICULUM_SUBJECTS) {
      const roadmap = generateRoadmapForSubject(subject.slug)!;
      for (const { topic } of generatedTopicsInOrder(roadmap)) {
        const resolved = resolveRef(topic.ref);
        expect(resolved, topic.ref).not.toBeNull();
        expect(resolved!.depth).toBe(3);
        expect(resolved!.subjectSlug).toBe(subject.slug);
      }
    }
  });

  it('gives every week a resolvable two-segment ref matching its topics', () => {
    const roadmap = generateRoadmapForSubject('physiology')!;
    for (const week of roadmap.weeks) {
      expect(resolveRef(week.ref)!.depth).toBe(2);
      for (const topic of week.topics) {
        expect(topic.ref.startsWith(`${week.ref}/`)).toBe(true);
      }
    }
  });

  it('carries the curriculum detail nodes onto the topic description', () => {
    const anatomy = CURRICULUM_SUBJECTS.find((s) => s.slug === 'anatomy')!;
    const sourceTopic = anatomy.sections[0]!.topics[0]!;
    const generated = generateRoadmapForSubject('anatomy')!.weeks[0]!.topics[0]!;

    expect(sourceTopic.nodes.length).toBeGreaterThan(0);
    expect(generated.description).toBe(sourceTopic.nodes.join(' · '));
  });

  it('numbers weeks from one in curriculum order', () => {
    const roadmap = generateRoadmapForSubject('pathology')!;
    expect(roadmap.weeks.map((w) => w.weekNumber)).toEqual(roadmap.weeks.map((_, i) => i + 1));
  });

  it('reports totalTopics equal to the number of trackable units emitted', () => {
    for (const subject of CURRICULUM_SUBJECTS) {
      const roadmap = generateRoadmapForSubject(subject.slug)!;
      expect(generatedTopicsInOrder(roadmap)).toHaveLength(roadmap.totalTopics);
      expect(trackableUnitCount(subject.slug)).toBe(roadmap.totalTopics);
    }
  });
});

describe('trackableUnitCount', () => {
  it('is zero for an unknown subject', () => {
    expect(trackableUnitCount('nope')).toBe(0);
  });
});

describe('progressPct', () => {
  it('is 0 for an empty or untouched roadmap', () => {
    expect(progressPct(0, 0)).toBe(0);
    expect(progressPct(0, 47)).toBe(0);
  });

  it('is 100 only when every unit is complete', () => {
    expect(progressPct(47, 47)).toBe(100);
    expect(progressPct(46, 47)).toBe(98);
  });

  it('never rounds a started roadmap down to zero', () => {
    expect(progressPct(1, 1000)).toBe(1);
  });

  it('never rounds an unfinished roadmap up to a hundred', () => {
    expect(progressPct(999, 1000)).toBe(99);
  });

  it('rounds normally in between', () => {
    expect(progressPct(10, 47)).toBe(21);
    expect(progressPct(7, 42)).toBe(17);
  });

  it('tolerates nonsense input rather than returning NaN', () => {
    expect(progressPct(5, 0)).toBe(0);
    expect(progressPct(-1, 10)).toBe(0);
  });
});
