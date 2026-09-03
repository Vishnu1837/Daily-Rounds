import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { requireOnboardedUser } from '@/lib/auth/guards';
import { ADMIN_HOME } from '@/lib/routes';
import { getMemberContext } from '@/server/context';
import { getAttemptDetail } from '@/server/queries/assessments';

import { ResultScreen } from './result-screen';

export const metadata: Metadata = { title: 'Your result' };

export default async function ResultPage({
  params,
}: {
  params: Promise<{ assessmentId: string; attemptId: string }>;
}) {
  const user = await requireOnboardedUser();
  const ctx = await getMemberContext(user);
  if (!ctx) redirect(ADMIN_HOME);

  const { assessmentId, attemptId } = await params;

  /*
   * This is the private-results rule, enforced in one line: the viewer is a *student*, so
   * their member id goes into the WHERE clause. An attempt belonging to anyone else does
   * not come back — there is no branch here that could return it, whatever id is put in the
   * URL. The same call withholds the correct answers unless the admin turned review on, and
   * never returns the integrity log to a student.
   */
  const attempt = await getAttemptDetail({
    attemptId,
    viewer: { kind: 'student', memberId: ctx.memberId },
  });

  if (!attempt || attempt.assessmentId !== assessmentId) notFound();

  return <ResultScreen attempt={attempt} />;
}
