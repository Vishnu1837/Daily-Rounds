/**
 * The subject catalogue seeded into every environment.
 *
 * Derived from the curriculum tree rather than hand-listed, so the 19 MBBS subjects, their
 * slugs and their accents can only ever be defined in one place. `phase` lets the UI group
 * a subject picker the way the course is actually taught.
 */
import { CURRICULUM_SUBJECTS, type CurriculumSubjectSlug } from './curriculum';

export type SubjectEntry = {
  name: string;
  slug: CurriculumSubjectSlug;
  accent: string;
  /** Course position, 1–19. Subjects are listed in this order everywhere. */
  number: number;
  phaseId: string;
  phaseLabel: string;
};

export const SUBJECTS: SubjectEntry[] = CURRICULUM_SUBJECTS.map((s) => ({
  name: s.name,
  slug: s.slug,
  accent: s.accent,
  number: s.number,
  phaseId: s.phaseId,
  phaseLabel: s.phaseLabel,
}));

export type SubjectSlug = CurriculumSubjectSlug;

/** Subjects grouped by phase, in course order — for pickers and the syllabus browser. */
export function subjectsByPhase(): {
  phaseId: string;
  phaseLabel: string;
  subjects: SubjectEntry[];
}[] {
  const groups: { phaseId: string; phaseLabel: string; subjects: SubjectEntry[] }[] = [];
  for (const subject of SUBJECTS) {
    const last = groups[groups.length - 1];
    if (last && last.phaseId === subject.phaseId) last.subjects.push(subject);
    else
      groups.push({
        phaseId: subject.phaseId,
        phaseLabel: subject.phaseLabel,
        subjects: [subject],
      });
  }
  return groups;
}
