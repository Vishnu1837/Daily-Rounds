import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { requireOnboardedUser } from '@/lib/auth/guards';
import { ADMIN_HOME } from '@/lib/routes';
import { getMemberContext } from '@/server/context';
import { getStudentAssessments } from '@/server/queries/assessments';

import { AssessmentsListScreen } from './assessments-screen';

export const metadata: Metadata = { title: 'Assessments' };

export default async function AssessmentsPage() {
  const user = await requireOnboardedUser();
  const ctx = await getMemberContext(user);
  if (!ctx) redirect(ADMIN_HOME);

  const rows = await getStudentAssessments(ctx);
  return <AssessmentsListScreen rows={rows} />;
}
