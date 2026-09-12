import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { requireOnboardedUser } from '@/lib/auth/guards';
import { ADMIN_HOME } from '@/lib/routes';
import { getMemberContext } from '@/server/context';
import { getAttemptRuntime } from '@/server/queries/assessments';

import { AttemptRunner } from './runner';

export const metadata: Metadata = { title: 'Assessment in progress' };

export default async function AttemptPage({
  params,
}: {
  params: Promise<{ assessmentId: string; attemptId: string }>;
}) {
  const user = await requireOnboardedUser();
  const ctx = await getMemberContext(user);
  if (!ctx) redirect(ADMIN_HOME);

  const { assessmentId, attemptId } = await params;

  /*
   * The member id is part of the lookup, so another student's attempt is simply not found
   * rather than found-and-refused. `getAttemptRuntime` also returns null once the attempt
   * is finished, which is what sends a student who reloads a submitted paper to its result
   * instead of back into the questions.
   */
  const runtime = await getAttemptRuntime({ attemptId, memberId: ctx.memberId });
  if (!runtime) redirect(`/assessments/${assessmentId}/result/${attemptId}`);
  if (runtime.assessmentId !== assessmentId) notFound();

  return <AttemptRunner runtime={runtime} />;
}
