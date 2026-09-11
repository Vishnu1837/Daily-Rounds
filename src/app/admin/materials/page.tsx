import type { Metadata } from 'next';
import { asc } from 'drizzle-orm';
import { redirect } from 'next/navigation';

import { db } from '@/db/client';
import { subjects } from '@/db/schema';
import { requireAdmin } from '@/lib/auth/guards';
import { refOptionsBySubject, resolveRef } from '@/lib/curriculum';
import { coverVersion } from '@/lib/domain/textbooks';
import { getPrimaryCohort } from '@/server/context';
import { getCohortMaterials } from '@/server/queries/admin';
import { getCohortChapterDrafts, getCohortTextbookTopics } from '@/server/queries/textbooks';
import { geminiKeyState } from '@/server/settings';

import { MaterialsAdminScreen } from './materials-admin';

export const metadata: Metadata = { title: 'Materials' };

// Not prerendered — see the note in the admin layout. This page is all data.
export const instant = false;

export default async function MaterialsAdminPage() {
  await requireAdmin();
  const cohort = await getPrimaryCohort();
  if (!cohort) redirect('/admin/no-cohort');

  const [materials, subjectRows, topicsByMaterial, draftsByMaterial, keyState] = await Promise.all([
    getCohortMaterials(cohort.id),
    db.select().from(subjects).orderBy(asc(subjects.name)),
    getCohortTextbookTopics(cohort.id),
    getCohortChapterDrafts(cohort.id),
    geminiKeyState(),
  ]);

  return (
    <MaterialsAdminScreen
      cohortId={cohort.id}
      materials={materials.map(({ coverKey, ...m }) => {
        const draft = draftsByMaterial.get(m.id);
        return {
          ...m,
          // Resolved here so the client never has to carry the curriculum tree to do it.
          refPath: resolveRef(m.curriculumRef)?.path ?? null,
          topics: topicsByMaterial.get(m.id) ?? [],
          // The key stays on the server; the browser gets a version for the cover URL.
          coverVersion: coverKey ? coverVersion(coverKey) : null,
          draft: draft
            ? {
                topics: draft.plan,
                notes: draft.note ? draft.note.split('\n') : [],
                model: draft.model,
                source: draft.source,
              }
            : null,
        };
      })}
      geminiKey={keyState}
      subjects={subjectRows.map((s) => ({ id: s.id, name: s.name, slug: s.slug }))}
      refOptions={refOptionsBySubject()}
    />
  );
}
