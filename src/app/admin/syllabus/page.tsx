import type { Metadata } from 'next';

import { requireAdmin } from '@/lib/auth/guards';
import { CURRICULUM, curriculumTotals } from '@/lib/curriculum';

import { SyllabusScreen } from '../../(app)/syllabus/syllabus-screen';

export const metadata: Metadata = { title: 'Syllabus' };
// Not prerendered — see the note in the admin layout. The admin guard reads a cookie,
// so there is no static shell to hand over first.
export const instant = false;


/**
 * The syllabus, inside the admin console.
 *
 * The same screen the students read, mounted under `/admin/syllabus` so a cohort lead can
 * check what a subject actually covers — while deciding what to assign, say — without
 * leaving the console and losing their place. There is no student data on it at all: the
 * curriculum tree is static, which is why this needs nothing but the admin guard.
 */
export default async function AdminSyllabusPage() {
  await requireAdmin();

  return (
    <SyllabusScreen
      basePath="/admin/syllabus"
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
      // Nothing is "mine" here — an admin has no roadmap to badge subjects against.
      mySubjects={[]}
    />
  );
}
