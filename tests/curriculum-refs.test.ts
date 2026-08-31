import { describe, expect, it } from 'vitest';

import {
  ancestorRefs,
  bestRefMatch,
  buildRef,
  isAncestorRef,
  isSameBranch,
  refOptionsForSubject,
  resolveRef,
} from '@/lib/curriculum';
import { ROADMAP_TEMPLATES } from '@/lib/roadmap-templates';
import { materialSchema } from '@/lib/validation';

const TOPIC = 'anatomy/upper-limb/wrist-and-hand';
const SECTION = 'anatomy/upper-limb';
const SUBJECT = 'anatomy';

describe('buildRef and resolveRef', () => {
  it('builds a path from the parts it is given', () => {
    expect(buildRef('anatomy')).toBe(SUBJECT);
    expect(buildRef('anatomy', 'upper-limb')).toBe(SECTION);
    expect(buildRef('anatomy', 'upper-limb', 'wrist-and-hand')).toBe(TOPIC);
  });

  it('resolves each depth to its own label and breadcrumb', () => {
    expect(resolveRef(SUBJECT)).toMatchObject({ depth: 1, label: 'Anatomy', path: ['Anatomy'] });
    expect(resolveRef(SECTION)).toMatchObject({
      depth: 2,
      label: 'Upper Limb',
      path: ['Anatomy', 'Upper Limb'],
    });
    expect(resolveRef(TOPIC)).toMatchObject({
      depth: 3,
      label: 'Wrist & Hand',
      path: ['Anatomy', 'Upper Limb', 'Wrist & Hand'],
    });
  });

  it('rejects anything that is not a place in the tree', () => {
    expect(resolveRef(null)).toBeNull();
    expect(resolveRef('')).toBeNull();
    expect(resolveRef('nope')).toBeNull();
    expect(resolveRef('anatomy/nope')).toBeNull();
    expect(resolveRef('anatomy/upper-limb/nope')).toBeNull();
    // Nothing is addressable below a topic, so a fourth segment is not a ref.
    expect(resolveRef(`${TOPIC}/carpal-tunnel`)).toBeNull();
  });
});

describe('branch matching', () => {
  it('walks up the path', () => {
    expect(ancestorRefs(TOPIC)).toEqual([SUBJECT, SECTION, TOPIC]);
    expect(ancestorRefs(SUBJECT)).toEqual([SUBJECT]);
  });

  it('treats a ref as its own ancestor but not its sibling', () => {
    expect(isAncestorRef(SECTION, TOPIC)).toBe(true);
    expect(isAncestorRef(TOPIC, TOPIC)).toBe(true);
    expect(isAncestorRef(TOPIC, SECTION)).toBe(false);
    expect(isAncestorRef('anatomy/upper', TOPIC)).toBe(false); // not a segment boundary
  });

  it('matches a branch in both directions', () => {
    expect(isSameBranch(SECTION, TOPIC)).toBe(true);
    expect(isSameBranch(TOPIC, SECTION)).toBe(true);
    expect(isSameBranch(TOPIC, 'anatomy/thorax')).toBe(false);
    expect(isSameBranch(TOPIC, 'physiology')).toBe(false);
  });
});

describe('bestRefMatch', () => {
  const exact = { curriculumRef: TOPIC, id: 'exact' };
  const section = { curriculumRef: SECTION, id: 'section' };
  const subject = { curriculumRef: SUBJECT, id: 'subject' };
  const child = { curriculumRef: 'anatomy/upper-limb/shoulder-and-arm', id: 'sibling' };

  it('prefers the exact ref', () => {
    expect(bestRefMatch(TOPIC, [subject, section, exact])?.id).toBe('exact');
  });

  it('falls back to the nearest ancestor', () => {
    expect(bestRefMatch(TOPIC, [subject, section])?.id).toBe('section');
    expect(bestRefMatch(TOPIC, [subject])?.id).toBe('subject');
  });

  it('prefers any ancestor over a descendant', () => {
    const deeper = { curriculumRef: TOPIC, id: 'deeper' };
    expect(bestRefMatch(SECTION, [subject, deeper])?.id).toBe('subject');
  });

  it('ignores refs on another branch', () => {
    expect(bestRefMatch(TOPIC, [child])).toBeNull();
    expect(bestRefMatch(TOPIC, [{ curriculumRef: null, id: 'unfiled' }])).toBeNull();
    expect(bestRefMatch(null, [exact])).toBeNull();
  });

  it('breaks a tie between different refs on the ref itself, not on order', () => {
    const thorax = { curriculumRef: 'anatomy/thorax', id: 'thorax' };
    const upper = { curriculumRef: SECTION, id: 'upper' };
    // Both are sections of Anatomy, so both are equally close to the subject-level ref.
    expect(bestRefMatch(SUBJECT, [thorax, upper])?.id).toBe('thorax');
    expect(bestRefMatch(SUBJECT, [upper, thorax])?.id).toBe('thorax');
  });

  it('takes the first of two candidates filed at the same place', () => {
    const a = { curriculumRef: SECTION, id: 'a' };
    const b = { curriculumRef: SECTION, id: 'b' };
    expect(bestRefMatch(TOPIC, [a, b])?.id).toBe('a');
    expect(bestRefMatch(TOPIC, [b, a])?.id).toBe('b');
  });
});

describe('refOptionsForSubject', () => {
  it('offers the subject, then each section with its topics beneath', () => {
    const options = refOptionsForSubject('anatomy');
    expect(options[0]).toEqual({ ref: 'anatomy', label: 'All of Anatomy', depth: 1 });
    expect(options.filter((o) => o.depth === 2)).toHaveLength(8);
    expect(options.some((o) => o.ref === TOPIC && o.depth === 3)).toBe(true);
    expect(options.every((o) => o.ref.startsWith('anatomy'))).toBe(true);
  });

  it('is empty for a subject that does not exist', () => {
    expect(refOptionsForSubject('astrology')).toEqual([]);
  });
});

describe('template refs', () => {
  it('files every week at a real place in its own subject', () => {
    for (const [key, template] of Object.entries(ROADMAP_TEMPLATES)) {
      for (const week of template.weeks) {
        const resolved = resolveRef(week.ref);
        expect(resolved, `${key} / ${week.title}`).not.toBeNull();
        expect(resolved!.subjectSlug, `${key} / ${week.title}`).toBe(template.subject);
      }
    }
  });

  it('gives a curriculum template the exact topic it was built from', () => {
    expect(ROADMAP_TEMPLATES['anatomy:upper-limb']!.weeks[4]!.ref).toBe(TOPIC);
  });
});

describe('materialSchema', () => {
  const base = {
    cohortId: '00000000-0000-4000-8000-000000000000',
    title: 'Wrist and hand — annotated atlas',
    url: 'https://example.com/atlas',
    type: 'pdf' as const,
  };

  it('accepts a real curriculum place', () => {
    const parsed = materialSchema.safeParse({ ...base, curriculumRef: SECTION });
    expect(parsed.success).toBe(true);
  });

  it('accepts a material filed nowhere', () => {
    expect(materialSchema.safeParse({ ...base, curriculumRef: '' }).success).toBe(true);
    expect(materialSchema.safeParse(base).success).toBe(true);
  });

  it('rejects a ref that is not in the tree', () => {
    const parsed = materialSchema.safeParse({ ...base, curriculumRef: 'anatomy/made-up' });
    expect(parsed.success).toBe(false);
  });
});
