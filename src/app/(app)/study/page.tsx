import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { requireOnboardedUser } from '@/lib/auth/guards';
import { getMemberContext } from '@/server/context';
import { getStudyGrove } from '@/server/queries/grove';
import { getHomeData, getQuizForTopic } from '@/server/queries/student';

import { StudySessionScreen } from './study-screen';

export const metadata: Metadata = { title: 'Study session' };
export const dynamic = 'force-dynamic';

export default async function StudyPage() {
  const user = await requireOnboardedUser();
  const ctx = await getMemberContext(user);
  if (!ctx) redirect('/admin');

  const home = await getHomeData(ctx);
  const [quiz, grove] = await Promise.all([
    getQuizForTopic(home.assignment?.topicRef ?? null),
    getStudyGrove(ctx),
  ]);

  return (
    <StudySessionScreen
      topicTitle={home.assignment?.topicTitle ?? null}
      subjectName={home.assignment?.subjectName ?? null}
      plannedMinutes={home.assignment?.plannedMinutes ?? 90}
      initialSession={home.session}
      blockDone={home.tasks.find((t) => t.key === 'study_block_completed')?.done ?? false}
      targetDone={home.tasks.find((t) => t.key === 'daily_target_completed')?.done ?? false}
      checkedIn={home.checkedIn}
      quizId={quiz?.id ?? null}
      serverNow={new Date().toISOString()}
      grove={grove}
    />
  );
}
