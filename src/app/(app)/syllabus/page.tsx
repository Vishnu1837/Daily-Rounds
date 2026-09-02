import type { Metadata } from 'next';

import { requireOnboardedUser } from '@/lib/auth/guards';
import { CURRICULUM, curriculumTotals } from '@/lib/curriculum';
import { getMemberContext } from '@/server/context';
import { getRoadmaps } from '@/server/queries/student';

import { SyllabusScreen } from './syllabus-screen';

export const metadata: Metadata = { title: 'Syllabus' };
export default async function SyllabusPage() {
  const user = await requireOnboardedUser();
  const ctx = await getMemberContext(user);
  const roadmaps = ctx ? await getRoadmaps(ctx) : [];

  return (
    <SyllabusScreen
      phases={CURRICULUM.map((phase) => ({
        id: phase.id,
        label: phase.label,
        title: phase.title,
        subjects: phase.subjects.map((subject) => ({
          slug: subject.slug,
          name: subject.name,
          number: subject.number,
          sectionCount: subject.sections.length,
          topicCount: subject.sections.reduce((n, s) => n + s.topics.length, 0),
        })),
      }))}
      totals={curriculumTotals()}
      /** Subjects the student already has a roadmap for, so we can badge them. */
      mySubjects={[...new Set(roadmaps.map((r) => r.subjectName))]}
    />
  );
}
