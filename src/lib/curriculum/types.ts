/**
 * Curriculum node model.
 *
 * The tree is deliberately four levels deep — Phase → Subject → Section → Topic — with a
 * flat list of detail nodes on each topic. Every level is addressable by slug so the
 * syllabus browser can link to a section or a topic, and so a roadmap topic can point back
 * at the curriculum entry it came from.
 */
import type { CURRICULUM_SUBJECT_SLUGS } from './data';

/** The 19 subject slugs as a union — the canonical subject identifier across the app. */
export type CurriculumSubjectSlug = (typeof CURRICULUM_SUBJECT_SLUGS)[number];

export type CurriculumTopic = {
  title: string;
  /** Unique within its section. */
  slug: string;
  /** Syllabus labels the topic contains, in teaching order. Never explanatory prose. */
  nodes: string[];
};

export type CurriculumSection = {
  title: string;
  /** Unique within its subject. */
  slug: string;
  topics: CurriculumTopic[];
};

export type CurriculumSubject = {
  /** 1–19, the position of the subject in the full MBBS course. */
  number: number;
  name: string;
  /** Matches `subjects.slug` in the database. */
  slug: CurriculumSubjectSlug;
  /** Accent token consumed by the UI theme. */
  accent: string;
  sections: CurriculumSection[];
};

export type CurriculumPhase = {
  id: string;
  /** Short form for chips and breadcrumbs, e.g. "Phase III · Part I". */
  label: string;
  /** Full name, e.g. "Third Professional MBBS Part I". */
  title: string;
  subjects: CurriculumSubject[];
};

/** A subject together with the phase it is taught in. */
export type CurriculumSubjectWithPhase = CurriculumSubject & {
  phaseId: string;
  phaseLabel: string;
};
