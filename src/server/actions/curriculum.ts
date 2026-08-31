'use server';

import { requireUserAction } from '@/lib/auth/guards';
import { searchCurriculum } from '@/lib/curriculum';

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
