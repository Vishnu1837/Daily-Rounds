import 'server-only';

import type { StudySeed } from '@/components/grove/seed';
import type { MemberContext } from '@/server/context';
import { getStudyGrove } from '@/server/queries/grove';
import { getQuizForTopic, getStudySnapshot } from '@/server/queries/student';

/**
 * Everything the focus round needs, assembled once.
 *
 * Two callers: the study page, which renders it straight into the markup, and
 * `loadStudySeedAction`, which the dock calls when a student lands somewhere else with a
 * round still growing. Both must produce the same answer or a minimised round would draw
 * differently from the same round expanded, so the assembly lives here rather than in either.
 */
export async function buildStudySeed(ctx: MemberContext): Promise<StudySeed> {
  // The grove does not depend on the snapshot, so it starts in the same tick.
  const [snapshot, grove] = await Promise.all([getStudySnapshot(ctx), getStudyGrove(ctx)]);

  /*
   * Every subject the student could sit down to today, each with its own knowledge check.
   *
   * Both are resolved here rather than on demand so the switch between them is instant and
   * the study route stays prerenderable — reading the choice from the URL would make it a
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

  return {
    subjects,
    /*
     * Which subject the round opens on. A running session settles it — the block is already
     * filed against one topic — and otherwise it is the one the dashboard leads with.
     */
    initialSlot: snapshot.sessionSlot ?? snapshot.assignment?.slot ?? null,
    // Once a block exists the choice is made: switching would misreport what the time was
    // spent on, so the screen stops offering it.
    canSwitchSubject: !snapshot.session,
    initialSession: snapshot.session,
    blockDone: snapshot.blockDone,
    targetDone: snapshot.targetDone,
    checkedIn: snapshot.checkedIn,
    serverNow: new Date().toISOString(),
    grove,
  };
}
