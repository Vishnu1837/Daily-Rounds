import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { requireOnboardedUser } from '@/lib/auth/guards';
import { ADMIN_HOME } from '@/lib/routes';
import { getMemberContext } from '@/server/context';
import { getAssessmentBrief, getStudentAttemptHistory } from '@/server/queries/assessments';

import { RulesScreen } from './rules-screen';

export const metadata: Metadata = { title: 'Before you start' };

export default async function AssessmentBriefPage({
  params,
}: {
  params: Promise<{ assessmentId: string }>;
}) {
  const user = await requireOnboardedUser();
  const ctx = await getMemberContext(user);
  if (!ctx) redirect(ADMIN_HOME);

  const { assessmentId } = await params;
  const brief = await getAssessmentBrief({
    assessmentId,
    cohortId: ctx.cohort.id,
    memberId: ctx.memberId,
  });
  if (!brief || brief.status !== 'published') notFound();

  const history = await getStudentAttemptHistory({ assessmentId, memberId: ctx.memberId });

  return <RulesScreen brief={brief} previousAttempts={history.length} />;
}
