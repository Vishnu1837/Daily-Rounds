import { describe, expect, it } from 'vitest';

import {
  CURRICULUM,
  CURRICULUM_SUBJECTS,
  curriculumSection,
  curriculumSubject,
  curriculumTotals,
  nodeCount,
  searchCurriculum,
  topicCount,
} from '@/lib/curriculum';
import { ROADMAP_TEMPLATES, templateForSubject, templateList } from '@/lib/roadmap-templates';
import { SUBJECTS, subjectsByPhase } from '@/lib/subjects';

describe('curriculum tree', () => {
  it('covers the whole MBBS course', () => {
    expect(CURRICULUM).toHaveLength(4);
    expect(CURRICULUM_SUBJECTS).toHaveLength(19);
    expect(CURRICULUM_SUBJECTS.map((s) => s.number)).toEqual(
      Array.from({ length: 19 }, (_, i) => i + 1),
    );
  });

  it('has unique slugs at every level', () => {
    const subjectSlugs = CURRICULUM_SUBJECTS.map((s) => s.slug);
    expect(new Set(subjectSlugs).size).toBe(subjectSlugs.length);

    for (const subject of CURRICULUM_SUBJECTS) {
      const sectionSlugs = subject.sections.map((s) => s.slug);
      expect(new Set(sectionSlugs).size, subject.slug).toBe(sectionSlugs.length);

      for (const section of subject.sections) {
        const topicSlugs = section.topics.map((t) => t.slug);
        expect(new Set(topicSlugs).size, `${subject.slug}/${section.slug}`).toBe(topicSlugs.length);
      }
    }
  });

  it('never carries an empty branch', () => {
    for (const subject of CURRICULUM_SUBJECTS) {
      expect(subject.sections.length, subject.slug).toBeGreaterThan(0);
      for (const section of subject.sections) {
        expect(section.topics.length, `${subject.slug}/${section.slug}`).toBeGreaterThan(0);
      }
    }
  });

  it('resolves subjects and sections by slug', () => {
    const anatomy = curriculumSubject('anatomy');
    expect(anatomy?.name).toBe('Anatomy');
    expect(anatomy?.phaseLabel).toBe('Phase I');
    expect(curriculumSubject('not-a-subject')).toBeNull();

    const upperLimb = curriculumSection('anatomy', 'upper-limb');
    expect(upperLimb?.section.title).toBe('Upper Limb');
    expect(curriculumSection('anatomy', 'not-a-section')).toBeNull();
  });

  it('counts topics and nodes', () => {
    const totals = curriculumTotals();
    expect(totals.subjects).toBe(19);
    expect(totals.topics).toBeGreaterThan(400);
    expect(totals.nodes).toBeGreaterThan(2000);

    const anatomy = curriculumSubject('anatomy')!;
    expect(topicCount(anatomy)).toBe(anatomy.sections.reduce((n, s) => n + s.topics.length, 0));
    expect(nodeCount(anatomy)).toBeGreaterThan(topicCount(anatomy));
  });
});

describe('searchCurriculum', () => {
  it('ignores queries that are too short to be useful', () => {
    expect(searchCurriculum('a')).toEqual([]);
    expect(searchCurriculum(' ')).toEqual([]);
  });

  it('finds a topic by title', () => {
    const hits = searchCurriculum('brachial plexus');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.subject.slug).toBe('anatomy');
    expect(hits[0]!.section.title).toBe('Upper Limb');
  });

  it('finds a detail node and reports which node matched', () => {
    const hit = searchCurriculum('urea cycle')[0];
    expect(hit?.subject.slug).toBe('biochemistry');
    expect(hit?.node).toBe('Urea cycle');
  });

  it('reports a topic once rather than once per matching node', () => {
    const hits = searchCurriculum('brachial plexus');
    const topics = hits.filter((h) => h.topic.title === 'Brachial Plexus');
    expect(topics.length).toBeLessThanOrEqual(1);
  });

  it('respects the limit', () => {
    expect(searchCurriculum('a', 5)).toHaveLength(0); // too short, not limited
    expect(searchCurriculum('an', 5).length).toBeLessThanOrEqual(5);
  });
});

describe('subject catalogue', () => {
  it('mirrors the curriculum exactly', () => {
    expect(SUBJECTS.map((s) => s.slug)).toEqual(CURRICULUM_SUBJECTS.map((s) => s.slug));
  });

  it('groups by phase in course order', () => {
    const groups = subjectsByPhase();
    expect(groups.map((g) => g.phaseLabel)).toEqual([
      'Phase I',
      'Phase II',
      'Phase III · Part I',
      'Phase III · Part II',
    ]);
    expect(groups.flatMap((g) => g.subjects)).toHaveLength(19);
  });
});

describe('roadmap templates', () => {
  it('offers a template for every subject in the course', () => {
    for (const subject of SUBJECTS) {
      const template = templateForSubject(subject.slug);
      expect(template, subject.slug).not.toBeNull();
      expect(template!.subject).toBe(subject.slug);
      expect(template!.weeks.length).toBeGreaterThan(0);
    }
  });

  it('builds one curriculum template per section, keyed subject:section', () => {
    const sections = CURRICULUM_SUBJECTS.reduce((n, s) => n + s.sections.length, 0);
    const curriculumTemplates = templateList().filter((t) => t.source === 'curriculum');
    expect(curriculumTemplates).toHaveLength(sections);
    expect(ROADMAP_TEMPLATES['anatomy:upper-limb']?.track).toBe('Upper Limb');
  });

  it('turns curriculum topics into weeks and detail nodes into roadmap topics', () => {
    const template = ROADMAP_TEMPLATES['anatomy:upper-limb']!;
    const section = curriculumSection('anatomy', 'upper-limb')!.section;

    expect(template.weeks.map((w) => w.title)).toEqual(section.topics.map((t) => t.title));
    expect(template.weeks[0]!.topics).toEqual(section.topics[0]!.nodes);
  });

  it('never produces an empty week', () => {
    for (const template of Object.values(ROADMAP_TEMPLATES)) {
      for (const week of template.weeks) {
        expect(week.topics.length, `${template.title} / ${week.title}`).toBeGreaterThan(0);
      }
    }
  });

  it('prefers a curated template when one exists for the subject', () => {
    expect(templateForSubject('pathology')!.track).toBe('General Pathology');
    // No curated plan for Radiodiagnosis, so the course's own first section stands in.
    expect(templateForSubject('radiodiagnosis')!.track).toBe('Imaging Principles & Safety');
  });
});
