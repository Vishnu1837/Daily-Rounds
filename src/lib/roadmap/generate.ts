/**
 * Syllabus → roadmap generation.
 *
 * The master curriculum in src/lib/curriculum is the single academic source of truth. A
 * roadmap is a student's *trackable view* of one subject from it, never a second hand-typed
 * topic list. This module is the only place that turns the one into the other.
 *
 * Mapping, and the reason for it:
 *
 *   curriculum section  →  roadmap week   (the module / region / system grouping)
 *   curriculum topic    →  roadmap topic  (THE trackable unit)
 *   detail nodes        →  topic description
 *
 * Picking the curriculum *topic* as the trackable unit is what keeps progress honest. It is
 * one consistent level, so nothing is double-counted the way it would be if a parent topic
 * and its subtopics were both completable. It is also the right size: Anatomy is 47 topics
 * across 8 sections rather than 370 detail nodes, which is a month of work at a sane pace
 * instead of an unfinishable wall.
 *
 * Order is taken from the curriculum array order and never re-sorted. That array is written
 * in teaching order — for Upper Limb, osteology before joints before muscles before nerves —
 * so `position` ascending is academically correct by construction. Any future ordering fix
 * belongs in the curriculum data, not here.
 */
import { buildRef, curriculumSubject } from '@/lib/curriculum';

/** One trackable unit of a generated roadmap. */
export type GeneratedTopic = {
  title: string;
  /** Full 3-segment ref, e.g. `anatomy/upper-limb/osteology`. */
  ref: string;
  /** The curriculum detail nodes, joined — what the topic actually contains. */
  description: string | null;
  /** Global ordering across the whole subject, ascending, gap-free from 0. */
  position: number;
};

/** One module of a generated roadmap — a curriculum section. */
export type GeneratedWeek = {
  /** 1-based, in curriculum order. */
  weekNumber: number;
  title: string;
  /** 2-segment ref, e.g. `anatomy/upper-limb`. */
  ref: string;
  topics: GeneratedTopic[];
};

export type GeneratedRoadmap = {
  subjectSlug: string;
  subjectName: string;
  title: string;
  /** The subject's phase, shown as the roadmap's track. */
  track: string;
  weeks: GeneratedWeek[];
  /** Total trackable units — the denominator of the progress bar. */
  totalTopics: number;
};

/**
 * Builds the complete roadmap for a subject, covering every section.
 *
 * Returns null for a slug that is not one of the 19 subjects, which is the caller's signal
 * that the subject reference is broken rather than merely empty.
 */
export function generateRoadmapForSubject(subjectSlug: string): GeneratedRoadmap | null {
  const subject = curriculumSubject(subjectSlug);
  if (!subject) return null;

  let position = 0;
  const weeks: GeneratedWeek[] = subject.sections.map((section, sectionIndex) => ({
    weekNumber: sectionIndex + 1,
    title: section.title,
    ref: buildRef(subject.slug, section.slug),
    topics: section.topics.map((topic) => ({
      title: topic.title,
      ref: buildRef(subject.slug, section.slug, topic.slug),
      description: topic.nodes.length > 0 ? topic.nodes.join(' · ') : null,
      position: position++,
    })),
  }));

  return {
    subjectSlug: subject.slug,
    subjectName: subject.name,
    title: subject.name,
    track: subject.phaseLabel,
    weeks,
    totalTopics: position,
  };
}

/**
 * Flat list of every trackable unit for a subject, in study order.
 *
 * The insert path wants rows, not a tree; the tree only matters for display.
 */
export function generatedTopicsInOrder(roadmap: GeneratedRoadmap): {
  weekNumber: number;
  topic: GeneratedTopic;
}[] {
  return roadmap.weeks.flatMap((week) =>
    week.topics.map((topic) => ({ weekNumber: week.weekNumber, topic })),
  );
}

/** Trackable-unit count for a subject without building the whole tree. */
export function trackableUnitCount(subjectSlug: string): number {
  const subject = curriculumSubject(subjectSlug);
  if (!subject) return 0;
  return subject.sections.reduce((total, section) => total + section.topics.length, 0);
}

/**
 * Progress as a percentage of trackable units.
 *
 * Rounded, but never rounded *to* 0 or 100 — a student with one topic done should not see
 * "0%", and one with a single topic left should not see a full bar. Only genuinely empty and
 * genuinely finished roadmaps get the extremes.
 */
export function progressPct(completed: number, total: number): number {
  if (total <= 0) return 0;
  if (completed <= 0) return 0;
  if (completed >= total) return 100;
  return Math.min(99, Math.max(1, Math.round((completed / total) * 100)));
}
