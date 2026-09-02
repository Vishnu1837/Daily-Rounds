import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { requireOnboardedUser } from '@/lib/auth/guards';
import { getMemberContext } from '@/server/context';
import { getStudyGrove } from '@/server/queries/grove';
import { getQuizForTopic, getStudySnapshot } from '@/server/queries/student';

import { StudySessionScreen } from './study-screen';

export const metadata: Metadata = { title: 'Study session' };
export default async function StudyPage() {
  const user = await requireOnboardedUser();
  const ctx = await getMemberContext(user);
  if (!ctx) redirect('/admin');

  // The grove does not depend on the snapshot, so it starts in the same tick.
  const [snapshot, grove] = await Promise.all([getStudySnapshot(ctx), getStudyGrove(ctx)]);
  const quiz = await getQuizForTopic(snapshot.assignment?.topicRef ?? null);

  return (
    <StudySessionScreen
      topicTitle={snapshot.assignment?.topicTitle ?? null}
      subjectName={snapshot.assignment?.subjectName ?? null}
      plannedMinutes={snapshot.assignment?.plannedMinutes ?? 90}
      initialSession={snapshot.session}
      blockDone={snapshot.blockDone}
      targetDone={snapshot.targetDone}
      checkedIn={snapshot.checkedIn}
      quizId={quiz?.id ?? null}
      serverNow={new Date().toISOString()}
      grove={grove}
    />
  );
}
