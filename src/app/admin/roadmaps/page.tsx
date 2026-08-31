import type { Metadata } from 'next';
import { asc } from 'drizzle-orm';
import { redirect } from 'next/navigation';

import { db } from '@/db/client';
import { subjects } from '@/db/schema';
import { requireAdmin } from '@/lib/auth/guards';
import { templateList } from '@/lib/roadmap-templates';
import { getCohortContext, getPrimaryCohort } from '@/server/context';
import {
  getAssignmentsForDate,
  getCohortStudents,
  getStudentRoadmaps,
} from '@/server/queries/admin';

import { RoadmapAdminScreen } from './roadmap-admin';

export const metadata: Metadata = { title: 'Roadmaps' };
export const dynamic = 'force-dynamic';

export default async function RoadmapAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ member?: string; date?: string }>;
}) {
  await requireAdmin();
  const cohort = await getPrimaryCohort();
  if (!cohort) redirect('/admin/no-cohort');

  const ctx = await getCohortContext(cohort.id);
  if (!ctx) redirect('/admin/no-cohort');

  const { member, date } = await searchParams;
  const targetDate = /^\d{4}-\d{2}-\d{2}$/.test(date ?? '') ? date! : ctx.today;

  const [students, subjectRows, assignments] = await Promise.all([
    getCohortStudents(ctx),
    db.select().from(subjects).orderBy(asc(subjects.name)),
    getAssignmentsForDate(cohort.id, targetDate),
  ]);

  const active = students.filter((s) => s.status === 'active');
  const selectedMemberId = member ?? active[0]?.memberId ?? null;
  const roadmapRows = selectedMemberId ? await getStudentRoadmaps(cohort.id, selectedMemberId) : [];

  return (
    <RoadmapAdminScreen
      cohortId={cohort.id}
      today={ctx.today}
      date={targetDate}
      students={active.map((s) => ({
        memberId: s.memberId,
        name: s.name,
        roadmapPct: s.roadmapPct,
        subjectName: s.subjectName,
      }))}
      selectedMemberId={selectedMemberId}
      roadmapRows={roadmapRows}
      subjects={subjectRows.map((s) => ({ id: s.id, name: s.name, slug: s.slug }))}
      templates={templateList().map((t) => ({ key: t.key, title: t.title, subject: t.subject }))}
      assignments={assignments}
    />
  );
}
