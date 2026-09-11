/**
 * The shape of everything a focus round needs to draw itself.
 *
 * This used to be the prop list of the study screen, which was fine while the round only
 * ever existed on `/study`. Now that a round outlives the screen that started it — minimised
 * into the dock and carried across the rest of the site — the same payload has to be
 * reachable two ways: handed down by the study page on a hard landing there, and fetched by
 * the dock when a student comes back on some other route with a round still in the ground.
 * So it is a named type in a module both halves can import, rather than a prop list.
 */

import type { TreeSpecies, TreeStatus } from '@/lib/domain/grove';
import type { StudySessionState } from '@/server/actions/study';

export type StudySlot = 'primary' | 'secondary';

export type StudySubject = {
  slot: StudySlot;
  subjectName: string | null;
  topicTitle: string | null;
  plannedMinutes: number;
  quizId: string | null;
};

export type TodayTree = { id: string; species: TreeSpecies; status: TreeStatus };

export type LiveRound = {
  id: string;
  preset: string;
  focusMinutes: number;
  species: TreeSpecies;
  plantedAt: string;
  dueAt: string;
};

export type StudySeed = {
  /** Today's topic in each subject the student is studying, primary slot first. */
  subjects: StudySubject[];
  /** The subject the round opens on: the running session's, else the day's leading one. */
  initialSlot: StudySlot | null;
  /** False once a block exists — the time is already filed against one topic. */
  canSwitchSubject: boolean;
  initialSession: StudySessionState | null;
  blockDone: boolean;
  targetDone: boolean;
  checkedIn: boolean;
  /**
   * The server's clock when this payload was built. Countdowns are seeded from it rather
   * than from `Date.now()` so a server-rendered study screen hydrates to identical markup.
   */
  serverNow: string;
  grove: {
    live: LiveRound | null;
    todayTrees: TodayTree[];
    streak: number;
  };
};

/**
 * The flag that tells a cold page load whether it is worth asking the server for a round.
 *
 * Without it every student would pay a round trip on every hard navigation to discover, in
 * the overwhelming majority of cases, that nothing is growing. It is only ever an
 * optimisation: the study page seeds the dock directly, and the server remains the only
 * thing that decides whether a round is alive.
 */
export const LIVE_ROUND_FLAG = 'dr.grove.live';
