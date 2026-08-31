import type { Metadata } from 'next';
import { asc } from 'drizzle-orm';
import { redirect } from 'next/navigation';

import { db } from '@/db/client';
import { subjects } from '@/db/schema';
import { requireAdmin } from '@/lib/auth/guards';
import { refOptionsBySubject } from '@/lib/curriculum';
import { getPrimaryCohort } from '@/server/context';
import { getCohortMaterials } from '@/server/queries/admin';

import { MaterialsAdminScreen } from './materials-admin';

export const metadata: Metadata = { title: 'Materials' };
export const dynamic = 'force-dynamic';

export default async function MaterialsAdminPage() {
  await requireAdmin();
  const cohort = await getPrimaryCohort();
  if (!cohort) redirect('/admin/no-cohort');

  const [materials, subjectRows] = await Promise.all([
    getCohortMaterials(cohort.id),
    db.select().from(subjects).orderBy(asc(subjects.name)),
  ]);

  return (
    <MaterialsAdminScreen
      cohortId={cohort.id}
      materials={materials}
      subjects={subjectRows.map((s) => ({ id: s.id, name: s.name, slug: s.slug }))}
      refOptions={refOptionsBySubject()}
    />
  );
}
