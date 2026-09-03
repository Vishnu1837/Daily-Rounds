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

  /*
   * Every subject the student could sit down to today, each with its own knowledge check.
   *
   * Both are resolved here rather than on demand so the switch between them is instant and
   * this route stays prerenderable — reading the choice from the URL would make it a
   * blocking render on the screen students open most.
   */
  const subjects = await Promise.all(
    snapshot.focus.map(async (f) => ({
      slot: f.slot,
      subjectName: f.subjectName,
      topicTitle: f.topicTitle,
      plannedMinutes: f.plannedMinutes,
      quizId: (await getQuizForTopic(f.topicRef))?.id ?? null,
    })),
  );

  /*
   * Which subject the screen opens on. A running session settles it — the block is already
   * filed against one topic — and otherwise it is the one the dashboard leads with.
   */
  const initialSlot = snapshot.sessionSlot ?? snapshot.assignment?.slot ?? null;

  return (
    <StudySessionScreen
      subjects={subjects}
      initialSlot={initialSlot}
      // Once a block exists the choice is made: switching would misreport what the time was
      // spent on, so the screen stops offering it.
      canSwitchSubject={!snapshot.session}
      initialSession={snapshot.session}
      blockDone={snapshot.blockDone}
      targetDone={snapshot.targetDone}
      checkedIn={snapshot.checkedIn}
      serverNow={new Date().toISOString()}
      grove={grove}
    />
  );
}
