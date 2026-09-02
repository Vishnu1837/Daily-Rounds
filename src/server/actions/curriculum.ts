'use server';

import { requireAdminAction, requireUserAction } from '@/lib/auth/guards';
import { buildRef, curriculumSubject, searchCurriculum } from '@/lib/curriculum';

export type CurriculumSearchHit = {
  subjectSlug: string;
  subjectName: string;
  phaseLabel: string;
  sectionTitle: string;
  sectionSlug: string;
  topicTitle: string;
  /** Set when the query matched a detail node rather than the topic itself. */
  node: string | null;
};

/**
 * Searches the curriculum tree.
 *
 * This runs on the server on purpose: the tree is ~5,000 lines of generated data and has no
 * business being shipped to the browser just so a student can type three letters into a
 * search box.
 */
export async function searchCurriculumAction(query: string): Promise<CurriculumSearchHit[]> {
  await requireUserAction();

  return searchCurriculum(query, 30).map((hit) => ({
    subjectSlug: hit.subject.slug,
    subjectName: hit.subject.name,
    phaseLabel: hit.subject.phaseLabel,
    sectionTitle: hit.section.title,
    sectionSlug: hit.section.slug,
    topicTitle: hit.topic.title,
    node: hit.node ?? null,
  }));
}

export type CurriculumTopicOption = {
  /** The curriculum ref — what an assignment is made against. */
  ref: string;
  title: string;
  /** Detail nodes, so the admin can see what a topic actually covers before picking it. */
  nodes: string[];
};

export type CurriculumSubjectTree = {
  slug: string;
  name: string;
  phaseLabel: string;
  sections: {
    /** The ref for the module itself, assignable when a whole module is the day's work. */
    ref: string;
    title: string;
    topics: CurriculumTopicOption[];
  }[];
};

/**
 * One subject's modules and topics, for the admin's syllabus picker.
 *
 * Fetched per subject rather than shipped whole for the same reason the search above runs
 * on the server: all nineteen subjects at once is a few hundred kilobytes of generated data
 * in a bundle, to answer a question about one of them.
 */
export async function curriculumSubjectTreeAction(
  slug: string,
): Promise<CurriculumSubjectTree | null> {
  await requireAdminAction();

  const subject = curriculumSubject(slug);
  if (!subject) return null;

  return {
    slug: subject.slug,
    name: subject.name,
    phaseLabel: subject.phaseLabel,
    sections: subject.sections.map((section) => ({
      ref: buildRef(subject.slug, section.slug),
      title: section.title,
      topics: section.topics.map((topic) => ({
        ref: buildRef(subject.slug, section.slug, topic.slug),
        title: topic.title,
        nodes: topic.nodes,
      })),
    })),
  };
}
