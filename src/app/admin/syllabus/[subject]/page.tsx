import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { requireAdmin } from '@/lib/auth/guards';
import { curriculumSubject, nodeCount, topicCount } from '@/lib/curriculum';

import { SubjectSyllabusScreen } from '../../../(app)/syllabus/[subject]/subject-screen';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ subject: string }>;
}): Promise<Metadata> {
  const { subject } = await params;
  const found = curriculumSubject(subject);
  return { title: found ? `${found.name} — Syllabus` : 'Syllabus' };
}

// Not prerendered — see the note in the admin layout. The admin guard reads a cookie,
// so there is no static shell to hand over first.
export const instant = false;

/** One subject's syllabus for a cohort lead. Read-only, and identical to the student view. */
export default async function AdminSubjectSyllabusPage({
  params,
}: {
  params: Promise<{ subject: string }>;
}) {
  await requireAdmin();
  const { subject: slug } = await params;

  const subject = curriculumSubject(slug);
  if (!subject) notFound();

  return (
    <SubjectSyllabusScreen
      basePath="/admin/syllabus"
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
            // No roadmap to mark against — an admin is reading the course, not their plan.
            nodes: topic.nodes.map((node) => ({ label: node, status: null })),
          })),
        })),
      }}
      hasRoadmapForSubject={false}
    />
  );
}
