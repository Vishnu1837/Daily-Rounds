import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { requireOnboardedUser } from '@/lib/auth/guards';
import { curriculumSubject, nodeCount, topicCount } from '@/lib/curriculum';
import { getMemberContext } from '@/server/context';
import { getRoadmaps } from '@/server/queries/student';

import { SubjectSyllabusScreen } from './subject-screen';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ subject: string }>;
}): Promise<Metadata> {
  const { subject } = await params;
  const found = curriculumSubject(subject);
  return { title: found ? `${found.name} — Syllabus` : 'Syllabus' };
}

export default async function SubjectSyllabusPage({
  params,
}: {
  params: Promise<{ subject: string }>;
}) {
  const user = await requireOnboardedUser();
  const { subject: slug } = await params;

  const subject = curriculumSubject(slug);
  if (!subject) notFound();

  const ctx = await getMemberContext(user);
  const roadmaps = ctx ? await getRoadmaps(ctx) : [];

  /**
   * Titles the student already has on a roadmap, lowercased for matching.
   *
   * A curriculum-derived roadmap carries the node label through verbatim, so a plain title
   * match is enough to tell a student "this one is already on your plan" — and it degrades
   * quietly to no badges on a hand-written roadmap rather than showing anything wrong.
   */
  const planned = new Map<string, 'upcoming' | 'in_progress' | 'completed'>();
  for (const roadmap of roadmaps) {
    if (roadmap.subjectName !== subject.name) continue;
    for (const week of roadmap.weeks) {
      for (const topic of week.topics) {
        planned.set(topic.title.trim().toLowerCase(), topic.status);
      }
    }
  }

  return (
    <SubjectSyllabusScreen
      subject={{
        name: subject.name,
        slug: subject.slug,
        number: subject.number,
        phaseLabel: subject.phaseLabel,
        topicCount: topicCount(subject),
        nodeCount: nodeCount(subject),
        sections: subject.sections.map((section) => ({
          title: section.title,
          slug: section.slug,
          topics: section.topics.map((topic) => ({
            title: topic.title,
            slug: topic.slug,
            nodes: topic.nodes.map((node) => ({
              label: node,
              status: planned.get(node.trim().toLowerCase()) ?? null,
            })),
          })),
        })),
      }}
      hasRoadmapForSubject={roadmaps.some((r) => r.subjectName === subject.name)}
    />
  );
}
