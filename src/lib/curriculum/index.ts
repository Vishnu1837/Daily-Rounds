/**
 * Curriculum lookups.
 *
 * The tree in `data.ts` is static and generated, so everything here is a pure read over an
 * in-memory structure — no database round trip. Indexes are built once at module load
 * because the syllabus browser resolves a slug on every navigation.
 */
import { CURRICULUM, CURRICULUM_SUBJECT_SLUGS } from './data';
import type {
  CurriculumPhase,
  CurriculumSubjectSlug,
  CurriculumSection,
  CurriculumSubject,
  CurriculumSubjectWithPhase,
  CurriculumTopic,
} from './types';

export { CURRICULUM, CURRICULUM_SUBJECT_SLUGS };
export type {
  CurriculumPhase,
  CurriculumSubjectSlug,
  CurriculumSection,
  CurriculumSubject,
  CurriculumSubjectWithPhase,
  CurriculumTopic,
};

/** Every subject in course order, each carrying the phase it belongs to. */
export const CURRICULUM_SUBJECTS: CurriculumSubjectWithPhase[] = CURRICULUM.flatMap((phase) =>
  phase.subjects.map((subject) => ({
    ...subject,
    phaseId: phase.id,
    phaseLabel: phase.label,
  })),
).sort((a, b) => a.number - b.number);

const subjectBySlug = new Map<string, CurriculumSubjectWithPhase>(
  CURRICULUM_SUBJECTS.map((s) => [s.slug, s]),
);

export function curriculumSubject(slug: string): CurriculumSubjectWithPhase | null {
  return subjectBySlug.get(slug) ?? null;
}

export function curriculumSection(
  subjectSlug: string,
  sectionSlug: string,
): { subject: CurriculumSubjectWithPhase; section: CurriculumSection } | null {
  const subject = subjectBySlug.get(subjectSlug);
  const section = subject?.sections.find((s) => s.slug === sectionSlug);
  return subject && section ? { subject, section } : null;
}

/** Total topic count for a subject — what the syllabus browser shows on a subject card. */
export function topicCount(subject: CurriculumSubject): number {
  return subject.sections.reduce((total, section) => total + section.topics.length, 0);
}

/** Total detail-node count for a subject or section. */
export function nodeCount(subject: CurriculumSubject | CurriculumSection): number {
  const sections = 'sections' in subject ? subject.sections : [subject];
  return sections.reduce(
    (total, section) => total + section.topics.reduce((sum, topic) => sum + topic.nodes.length, 0),
    0,
  );
}

export type CurriculumMatch = {
  subject: CurriculumSubjectWithPhase;
  section: CurriculumSection;
  topic: CurriculumTopic;
  /** The detail node that matched, when the hit was on a node rather than the topic. */
  node?: string;
};

/**
 * Substring search across topics and detail nodes.
 *
 * A topic hit wins over a node hit for the same topic, so searching "brachial plexus"
 * surfaces the topic once rather than once per branch of the plexus.
 */
export function searchCurriculum(query: string, limit = 40): CurriculumMatch[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];

  const matches: CurriculumMatch[] = [];
  for (const subject of CURRICULUM_SUBJECTS) {
    for (const section of subject.sections) {
      for (const topic of section.topics) {
        if (topic.title.toLowerCase().includes(needle)) {
          matches.push({ subject, section, topic });
        } else {
          const node = topic.nodes.find((n) => n.toLowerCase().includes(needle));
          if (node) matches.push({ subject, section, topic, node });
        }
        if (matches.length >= limit) return matches;
      }
    }
  }
  return matches;
}

/** Counts for the syllabus landing page. */
export function curriculumTotals() {
  let sections = 0;
  let topics = 0;
  let nodes = 0;
  for (const subject of CURRICULUM_SUBJECTS) {
    sections += subject.sections.length;
    topics += topicCount(subject);
    nodes += nodeCount(subject);
  }
  return {
    phases: CURRICULUM.length,
    subjects: CURRICULUM_SUBJECTS.length,
    sections,
    topics,
    nodes,
  };
}

export {
  type CurriculumRef,
  type RefOption,
  type ResolvedRef,
  ancestorRefs,
  bestRefMatch,
  buildRef,
  isAncestorRef,
  isSameBranch,
  refOptionsBySubject,
  refOptionsForSubject,
  resolveRef,
} from './refs';
