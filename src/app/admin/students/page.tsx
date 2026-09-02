import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { requireAdmin } from '@/lib/auth/guards';
import { getCohortContext, getPrimaryCohort } from '@/server/context';
import { getCohortStudents } from '@/server/queries/admin';

import { StudentsScreen } from './students-screen';

export const metadata: Metadata = { title: 'Students' };

// Not prerendered — see the note in the admin layout. This page is all data.
export const instant = false;

export default async function StudentsPage() {
  await requireAdmin();
  const cohort = await getPrimaryCohort();
  if (!cohort) redirect('/admin/no-cohort');

  const ctx = await getCohortContext(cohort);
  if (!ctx) redirect('/admin/no-cohort');

  const students = await getCohortStudents(ctx);
  return <StudentsScreen cohortId={cohort.id} students={students} />;
}
