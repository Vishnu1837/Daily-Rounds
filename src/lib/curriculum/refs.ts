/**
 * Curriculum references.
 *
 * A ref is a slug path into the tree, 1–3 segments deep:
 *
 *   anatomy                                  a whole subject
 *   anatomy/upper-limb                       a section
 *   anatomy/upper-limb/wrist-and-hand        a topic
 *
 * This is the join key that replaced free-text topic titles. A quiz, a material and a
 * roadmap topic all point at the tree with one, which means content attaches to a *place in
 * the curriculum* rather than to a string that has to be typed identically in two places.
 *
 * Matching is by branch, not by equality, because the three things do not naturally live at
 * the same depth: a quiz is usually written for a topic, a reading list is often useful for
 * a whole section, and a roadmap topic may sit at either grain depending on the template it
 * came from. `isSameBranch` treats a ref and any of its ancestors or descendants as related,
 * and `bestRefMatch` picks the closest one when several apply.
 */
import { CURRICULUM_SUBJECTS, curriculumSubject } from './index';

/** A slug path of 1–3 segments: `subject`, `subject/section` or `subject/section/topic`. */
export type CurriculumRef = string;

export type ResolvedRef = {
  ref: CurriculumRef;
  depth: 1 | 2 | 3;
  subjectSlug: string;
  subjectName: string;
  sectionTitle: string | null;
  topicTitle: string | null;
  /** The deepest named level — what a badge or a group heading should say. */
  label: string;
  /** Every level, outermost first — what a breadcrumb should say. */
  path: string[];
};

export function buildRef(subjectSlug: string, sectionSlug?: string, topicSlug?: string): string {
  return [subjectSlug, sectionSlug, topicSlug].filter(Boolean).join('/');
}

/** Resolves a ref against the tree. Returns null for anything that no longer exists. */
export function resolveRef(ref: string | null | undefined): ResolvedRef | null {
  if (!ref) return null;
  const [subjectSlug, sectionSlug, topicSlug, ...rest] = ref.split('/');
  if (!subjectSlug || rest.length > 0) return null;

  const subject = curriculumSubject(subjectSlug);
  if (!subject) return null;
  if (!sectionSlug) {
    return {
      ref,
      depth: 1,
      subjectSlug,
      subjectName: subject.name,
      sectionTitle: null,
      topicTitle: null,
      label: subject.name,
      path: [subject.name],
    };
  }

  const section = subject.sections.find((s) => s.slug === sectionSlug);
  if (!section) return null;
  if (!topicSlug) {
    return {
      ref,
      depth: 2,
      subjectSlug,
      subjectName: subject.name,
      sectionTitle: section.title,
      topicTitle: null,
      label: section.title,
      path: [subject.name, section.title],
    };
  }

  const topic = section.topics.find((t) => t.slug === topicSlug);
  if (!topic) return null;
  return {
    ref,
    depth: 3,
    subjectSlug,
    subjectName: subject.name,
    sectionTitle: section.title,
    topicTitle: topic.title,
    label: topic.title,
    path: [subject.name, section.title, topic.title],
  };
}

/** Whether `ancestor` is `ref` itself or one of its parents. */
export function isAncestorRef(ancestor: string, ref: string): boolean {
  return ref === ancestor || ref.startsWith(`${ancestor}/`);
}

/** A ref and every ref above it: `a/b/c` → `['a', 'a/b', 'a/b/c']`. */
export function ancestorRefs(ref: string): string[] {
  const parts = ref.split('/');
  return parts.map((_, i) => parts.slice(0, i + 1).join('/'));
}

/** Whether two refs sit on the same branch — one contains the other, in either direction. */
export function isSameBranch(a: string, b: string): boolean {
  return isAncestorRef(a, b) || isAncestorRef(b, a);
}

/**
 * The closest of `candidates` to `topicRef`, or null when none are on the same branch.
 *
 * Closest means: the ref itself, then the nearest ancestor (a section beats a subject), then
 * the shallowest descendant. Two candidates filed at *different* refs of equal closeness
 * break on the ref string; two filed at the *same* ref are genuinely interchangeable, so the
 * first one given wins — pass candidates in a deterministic order if that matters.
 */
export function bestRefMatch<T extends { curriculumRef: string | null }>(
  topicRef: string | null,
  candidates: T[],
): T | null {
  if (!topicRef) return null;

  let best: { item: T; score: number; ref: string } | null = null;
  for (const item of candidates) {
    const ref = item.curriculumRef;
    if (!ref || !isSameBranch(ref, topicRef)) continue;

    // Exact wins outright; then ancestors by depth; then descendants, shallowest first.
    const depth = ref.split('/').length;
    const score = ref === topicRef ? 1000 : isAncestorRef(ref, topicRef) ? 100 + depth : 10 - depth;

    if (!best || score > best.score || (score === best.score && ref < best.ref)) {
      best = { item, score, ref };
    }
  }
  return best?.item ?? null;
}

export type RefOption = { ref: string; label: string; depth: 1 | 2 | 3 };

/**
 * Every addressable place in the tree for one subject — the options behind the admin's
 * curriculum picker. The subject itself comes first so content can be filed against a whole
 * subject when no narrower home fits.
 */
export function refOptionsForSubject(subjectSlug: string): RefOption[] {
  const subject = curriculumSubject(subjectSlug);
  if (!subject) return [];

  const options: RefOption[] = [{ ref: subject.slug, label: `All of ${subject.name}`, depth: 1 }];
  for (const section of subject.sections) {
    options.push({ ref: buildRef(subject.slug, section.slug), label: section.title, depth: 2 });
    for (const topic of section.topics) {
      options.push({
        ref: buildRef(subject.slug, section.slug, topic.slug),
        label: `— ${topic.title}`,
        depth: 3,
      });
    }
  }
  return options;
}

/** Refs for every subject, keyed by slug — the payload an admin picker needs in one go. */
export function refOptionsBySubject(): Record<string, RefOption[]> {
  return Object.fromEntries(CURRICULUM_SUBJECTS.map((s) => [s.slug, refOptionsForSubject(s.slug)]));
}
