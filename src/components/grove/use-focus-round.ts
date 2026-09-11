'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import type { CelebrationPayload } from '@/components/gamification/celebration';
import { useToast } from '@/components/ui/toast';
import { haptic } from '@/lib/haptics';
import {
  AWAY_GRACE_SECONDS,
  DEFAULT_PRESET,
  MIN_COMMITMENT_SECONDS,
  type FocusPresetKey,
  SPECIES_NAMES,
  type TreeSpecies,
  breakAfterRound,
  presetByKey,
  speciesFor,
} from '@/lib/domain/grove';
import {
  type PlantedTree,
  growTreeAction,
  plantTreeAction,
  witherTreeAction,
} from '@/server/actions/grove';
import { studyRoomHoldAction } from '@/server/actions/study-room';
import {
  type StudySessionState,
  completeTargetAction,
  finishSessionAction,
  pauseSessionAction,
  startSessionAction,
} from '@/server/actions/study';
import { useScreenWakeLock } from '@/lib/use-screen-wake-lock';

import { claimSettle, markSettled, releaseSettle, wasSettled } from './handoff';
import { LIVE_ROUND_FLAG, type StudySeed, type StudySlot, type TodayTree } from './seed';

/**
 * Elapsed block seconds = what the server has stored, plus whatever has accrued since it
 * said the session was running. Counting frames in the browser instead would lose time
 * every time the phone locked.
 */
function computeElapsed(session: StudySessionState | null, now: number): number {
  if (!session) return 0;
  if (session.status !== 'running' || !session.resumedAt) return session.elapsedSeconds;
  const since = Math.floor((now - new Date(session.resumedAt).getTime()) / 1000);
  return session.elapsedSeconds + Math.max(0, since);
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Remembers, across a hard reload on any route, that something may still be in the ground. */
function markLive(live: boolean): void {
  try {
    if (live) window.localStorage.setItem(LIVE_ROUND_FLAG, '1');
    else window.localStorage.removeItem(LIVE_ROUND_FLAG);
  } catch {
    // Private mode, or storage disabled. The flag is only an optimisation — see `seed.ts`.
  }
}

/** What the round is doing right now. Everything else is derived from this. */
export type Phase = 'idle' | 'focus' | 'break' | 'lost';

export type FocusRound = ReturnType<typeof useFocusRound>;

/**
 * The focus round, as a machine rather than a screen.
 *
 * Two clocks live here and it matters which is which. The *round* is the promise — a fixed
 * countdown owned by the server, drawn as a growing tree, and the only thing that can be
 * broken. The *block* is the day's study time: it is what pays points, and it accrues while
 * a round runs and pauses on the breaks between them.
 *
 * The round is never trusted to the browser. `dueAt` comes from the server, the countdown is
 * derived from it, and the server checks the wall clock again before it agrees to grow
 * anything — so a paused laptop, a fiddled system clock or an open console all fail closed.
 *
 * `enabled` decides whether this instance is the one actually running the round. Exactly one
 * is, ever: the study page owns it while the student is on `/study`, the dock owns it
 * everywhere else, and the handoff happens on navigation. A disabled instance still holds
 * state and draws, but arms no timers and settles nothing — see `./handoff`.
 */
export function useFocusRound({ seed, enabled }: { seed: StudySeed; enabled: boolean }) {
  const router = useRouter();
  const toast = useToast();

  /*
   * Which subject this block is for.
   *
   * Local state rather than a URL parameter: both subjects' topics and knowledge checks
   * already arrived with the page, so switching is instant and the study route stays
   * prerenderable — which matters on the screen students open most.
   */
  const [slot, setSlot] = useState<StudySlot | null>(seed.initialSlot);
  const active = seed.subjects.find((s) => s.slot === slot) ?? seed.subjects[0] ?? null;
  const subjectName = active?.subjectName ?? null;
  const topicTitle = active?.topicTitle ?? null;
  const plannedMinutes = active?.plannedMinutes ?? 90;
  const quizId = active?.quizId ?? null;

  const [session, setSession] = useState<StudySessionState | null>(seed.initialSession);
  const [heldTree, setTree] = useState<PlantedTree | null>(
    seed.grove.live
      ? { ...seed.grove.live, preset: presetByKey(seed.grove.live.preset).key, resumed: true }
      : null,
  );
  const [heldPhase, setPhase] = useState<Phase>(seed.grove.live ? 'focus' : 'idle');
  const [presetKey, setPresetKey] = useState<FocusPresetKey>(
    seed.grove.live ? presetByKey(seed.grove.live.preset).key : DEFAULT_PRESET,
  );
  const [trees, setTrees] = useState<TodayTree[]>(seed.grove.todayTrees);
  const [heldBreakEndsAt, setBreakEndsAt] = useState<number | null>(null);
  const [lost, setLost] = useState<{ species: TreeSpecies; minutes: number } | null>(null);
  const [now, setNow] = useState(() => new Date(seed.serverNow).getTime());

  const [celebration, setCelebration] = useState<CelebrationPayload | null>(null);
  const [finished, setFinished] = useState(seed.blockDone);
  const [shortBlock, setShortBlock] = useState<{ minutes: number; required: number } | null>(null);
  const [targetComplete, setTargetComplete] = useState(seed.targetDone);
  const [pending, startTransition] = useTransition();

  /*
   * A round the other surface has already finished with is gone from this one too.
   *
   * The router keeps the page you just left mounted and hidden so that going back to it is
   * instant, which means the study screen can still be holding the round the dock has since
   * grown or buried. Read as a derivation rather than corrected in an effect: the round is
   * over, and a screen that has to re-render once to notice is a screen that spends a frame
   * counting down a tree that is already in the ground.
   */
  const settledElsewhere = heldTree !== null && wasSettled(heldTree.id);
  const tree = settledElsewhere ? null : heldTree;
  const phase = settledElsewhere ? 'idle' : heldPhase;
  const breakEndsAt = settledElsewhere ? null : heldBreakEndsAt;

  const preset = presetByKey(presetKey);
  const grown = trees.filter((t) => t.status === 'grown').length;
  const withered = trees.filter((t) => t.status === 'withered').length;

  /* --------------------------------------------------------------- clocks */

  const roundTotal = (tree?.focusMinutes ?? preset.focusMinutes) * 60;
  const roundRemaining = tree ? Math.max(0, (new Date(tree.dueAt).getTime() - now) / 1000) : 0;
  const roundProgress = tree ? Math.min(1, 1 - roundRemaining / roundTotal) : 0;
  const breakRemaining = breakEndsAt ? Math.max(0, (breakEndsAt - now) / 1000) : 0;
  const blockElapsed = computeElapsed(session, now);

  // A break ends because the clock says so, so it is derived rather than stored. Writing
  // "the break is over" into state from an effect would give the same fact two owners and a
  // frame in which they disagree.
  const view: Phase = phase === 'break' && breakRemaining <= 0 ? 'idle' : phase;

  // One ticker for both countdowns. It stops as soon as nothing is counting, so an idle
  // round does no work at all — and the instance that is not driving does none either.
  useEffect(() => {
    if (!enabled) return;
    const counting = view === 'focus' || view === 'break' || session?.status === 'running';
    if (!counting) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [enabled, view, session?.status]);

  /* ------------------------------------------------------------- the tree */

  const treeRef = useRef<PlantedTree | null>(tree);
  const sessionRef = useRef<StudySessionState | null>(session);

  // Mirrored after paint rather than during render: these exist so a settle path that fires
  // from a timer or a visibility change reads the current round, not the one that was on
  // screen when the callback was created.
  useEffect(() => {
    treeRef.current = tree;
  }, [tree]);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  // The flag the dock reads on a cold load of some other route to know whether to ask.
  useEffect(() => {
    if (!enabled) return;
    markLive(tree !== null);
  }, [enabled, tree]);

  /** Stops the block clock so a break does not quietly count as study time. */
  const pauseBlock = useCallback(async () => {
    const current = sessionRef.current;
    if (!current || current.status !== 'running') return;
    const result = await pauseSessionAction(current.id);
    if (result.ok) setSession(result.data);
  }, []);

  const completeRound = useCallback(async () => {
    const current = treeRef.current;
    if (!current || !claimSettle(current.id)) return;

    const result = await growTreeAction(current.id);
    if (!result.ok) {
      releaseSettle(current.id);
      toast.error('Could not save that round', result.message);
      return;
    }

    markSettled(current.id);
    setTree(null);
    setTrees((prev) => [...prev, { id: current.id, species: current.species, status: 'grown' }]);
    setLost(null);
    haptic('celebrate');

    // The break is not a commitment, so it is client-side only: nothing is written down and
    // skipping it costs nothing.
    const roundNumber = result.data.treesToday;
    setBreakEndsAt(Date.now() + breakAfterRound(preset, roundNumber) * 60_000);
    setPhase('break');
    await pauseBlock();
    releaseSettle(current.id);

    toast.success(
      `${SPECIES_NAMES[current.species]} grown`,
      `${plural(current.focusMinutes, 'minute')} of unbroken focus. ${plural(result.data.treesToday, 'tree')} in today's plot.`,
    );
    router.refresh();
  }, [pauseBlock, preset, router, toast]);

  const killRound = useCallback(
    async (reason: 'left' | 'gave_up') => {
      const current = treeRef.current;
      if (!current || !claimSettle(current.id)) return;

      /*
       * Optimistic on purpose. The student has already broken the round; making them watch a
       * spinner before being told so would be the one moment in this flow that felt slow.
       *
       * The stump is drawn immediately and *withdrawn* below if the server discarded the
       * round instead. Being optimistic in the harsher direction is the right way round: a
       * student who sees a stump appear and then vanish has been let off, where the reverse
       * would be a punishment arriving after they were told they were fine.
       */
      markSettled(current.id);
      setTree(null);
      setTrees((prev) => [
        ...prev,
        { id: current.id, species: current.species, status: 'withered' },
      ]);
      setLost({ species: current.species, minutes: current.focusMinutes });
      setPhase('lost');
      /*
       * The one buzz in the product that is not a reward. It fires on the optimistic path
       * with the stump, not after the server answers: a round that ended forty seconds ago
       * and is only now felt would read as a different round entirely.
       */
      haptic('wither');
      setBreakEndsAt(null);

      const result = await witherTreeAction(current.id, reason);
      if (!result.ok) {
        toast.error('Could not record that', result.message);
      } else if (!result.data.recorded) {
        // Too short to count against them: the sapling was pulled up, so take the stump back
        // out of the plot and say why, rather than showing a loss the grove does not hold.
        setTrees((prev) => prev.filter((t) => t.id !== current.id));
        setLost(null);
        setPhase('idle');
        toast.success(
          'Nothing lost',
          `Under ${Math.round(MIN_COMMITMENT_SECONDS / 60)} minutes in, so that round does not count against you.`,
        );
      }
      await pauseBlock();
      releaseSettle(current.id);
      router.refresh();
    },
    [pauseBlock, router, toast],
  );

  // The round ends itself. Nothing waits for the student to press anything, because a round
  // that needs a button to finish is a round you can forget to claim — and a round that is
  // minimised is a round nobody is looking at.
  useEffect(() => {
    if (!enabled || view !== 'focus' || !tree) return;
    if (roundRemaining > 0) return;
    void completeRound();
  }, [enabled, view, tree, roundRemaining, completeRound]);

  /* ------------------------------------------------------------ leaving */

  // Most rounds are sat out on a phone, so the round asks to keep the screen lit rather than
  // relying on the student to keep tapping it awake. It is only a request — see the hook.
  useScreenWakeLock(enabled && view === 'focus');

  /**
   * The one place a student is allowed to go: the study room.
   *
   * Joining opens the meeting in another tab, and that tab taking focus is byte-for-byte the
   * same signal as opening something else — so before the away timer kills anything it asks
   * the server whether this student is currently sitting in the room. The check happens when
   * the timer *fires* rather than when it is armed, so it costs a round trip only in the
   * handful of seconds where a round is actually about to be lost.
   *
   * A failed check spares the round. That direction is deliberate and matches the rest of
   * this machine: a wrongly killed tree is the failure that makes students stop believing the
   * mechanic, and the round is settled by server time regardless — a student who really has
   * walked away still does not get to claim it until its full length has elapsed.
   */
  const killIfNotInRoom = useCallback(async () => {
    try {
      const hold = await studyRoomHoldAction();
      if (hold.ok && hold.data.suspended) return;
    } catch {
      return;
    }
    await killRound('left');
  }, [killRound]);

  /**
   * Going somewhere else kills the tree. Putting the phone down does not. Moving around this
   * site does not either — that is the whole point of the dock: the round travels with the
   * student, the tab never hides, and nothing in here fires.
   *
   * Leaving and locking both arrive as the same `visibilitychange`, and the platform offers
   * exactly one signal that separates them: who holds focus. Another tab, window or app
   * coming to the front takes focus away first; a screen that simply switched off leaves
   * focus where it was. So a hidden-but-still-focused page is read as a dark screen and the
   * round carries on — the countdown is server time, not frames, so it keeps running.
   *
   * The read is deliberately generous. On the phones where the two cases are hardest to tell
   * apart the mistake this makes is letting a round survive that should have died, never
   * killing one that was being sat through properly — a wrongly killed tree is the failure
   * that makes students stop trusting the mechanic altogether.
   *
   * The timer is armed when the tab is hidden rather than checked when it comes back, so a
   * student who switches away and never returns still loses the tree — otherwise "walk away"
   * would be strictly better than "give up", which would make the whole mechanic optional.
   *
   * `visibilitychange` only, never `blur` on its own. On a desktop the reference PDF is
   * usually a second window, which never hides this page, and killing trees for reading the
   * material would be absurd.
   */
  useEffect(() => {
    if (!enabled || view !== 'focus') return;
    let timer: number | null = null;

    const disarm = () => {
      if (timer === null) return;
      window.clearTimeout(timer);
      timer = null;
    };

    const onVisibility = () => {
      if (document.visibilityState !== 'hidden') {
        // Back from a dark screen the countdown may already be past due; nudging the clock
        // here settles the round now rather than on the ticker's next tick.
        setNow(Date.now());
        disarm();
        return;
      }
      if (document.hasFocus()) return;
      timer = window.setTimeout(() => void killIfNotInRoom(), AWAY_GRACE_SECONDS * 1000);
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      disarm();
    };
  }, [enabled, view, killIfNotInRoom]);

  // A closed tab is a walked-away round; the sweep settles it server-side within two minutes,
  // so this only has to make sure the student knew.
  useEffect(() => {
    if (!enabled || view !== 'focus') return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [enabled, view]);

  /* ------------------------------------------------------------ controls */

  const startRound = useCallback(() => {
    startTransition(async () => {
      // The block session is started first so the round can be filed against it, and so the
      // points side of the product behaves exactly as it did before the grove existed.
      const block = await startSessionAction(slot ?? undefined);
      if (!block.ok) {
        toast.error('Could not start', block.message);
        return;
      }
      setSession(block.data);

      const planted = await plantTreeAction({ preset: presetKey, sessionId: block.data.id });
      if (!planted.ok) {
        toast.error('Could not plant your tree', planted.message);
        return;
      }

      setTree(planted.data);
      setPresetKey(planted.data.preset);
      haptic('commit');
      setLost(null);
      setBreakEndsAt(null);
      setNow(Date.now());
      setPhase('focus');
    });
  }, [presetKey, slot, toast]);

  const skipBreak = useCallback(() => {
    setBreakEndsAt(null);
    setPhase('idle');
  }, []);

  const finishBlock = useCallback(() => {
    if (!session) return;
    startTransition(async () => {
      const result = await finishSessionAction(session.id);
      if (!result.ok) {
        toast.error('Could not save your session', result.message);
        return;
      }
      const { qualified, minutes, requiredMinutes, milestone, pointsAwarded, streak } = result.data;

      setFinished(true);
      setSession({ ...session, status: 'completed', resumedAt: null });
      setPhase('idle');

      // Be honest rather than celebratory when the block was too short to count. Quietly
      // showing a success state for zero points is the kind of thing that erodes trust in
      // every other number in the app.
      if (!qualified) {
        setShortBlock({ minutes, required: requiredMinutes });
        toast.toast({
          title: 'Session logged, but too short to count',
          description: `A block needs ${requiredMinutes} minutes to earn points. You studied ${minutes}.`,
          tone: 'info',
        });
        router.refresh();
        return;
      }

      setShortBlock(null);
      setCelebration({
        kind: milestone ? 'milestone' : 'day_complete',
        title: milestone ? `${milestone}-day streak!` : 'Study block complete',
        message: milestone
          ? 'You have shown up on every active study day for that whole run. That is the product working.'
          : `${plural(minutes, 'minute')} on ${topicTitle ?? 'your topic'}. Logged.`,
        emoji: milestone ? '🔥' : '✅',
        points: pointsAwarded,
        streak,
      });
      router.refresh();
    });
  }, [session, topicTitle, toast, router]);

  const completeTarget = useCallback(() => {
    startTransition(async () => {
      const result = await completeTargetAction(slot ?? undefined);
      if (!result.ok) {
        toast.error('Could not save that', result.message);
        return;
      }
      setTargetComplete(true);
      setCelebration({
        kind: 'day_complete',
        title: 'Target complete',
        message: "Today's topic is locked in and your roadmap just moved forward.",
        emoji: '🎯',
        points: result.data.pointsAwarded,
        streak: result.data.streak,
      });
      router.refresh();
    });
  }, [slot, toast, router]);

  const startAnotherBlock = useCallback(() => {
    setFinished(false);
    setShortBlock(null);
    setSession(null);
    setPhase('idle');
  }, []);

  /* ------------------------------------------------------------- handoff */

  /**
   * The round as a fresh seed, so the other surface can carry on drawing it without asking
   * the server. Only the parts that actually move during a round are rewritten; the subjects
   * and the day's flags are the same facts they were when the page loaded.
   */
  const snapshot = useCallback(
    (): StudySeed => ({
      ...seed,
      initialSlot: slot,
      canSwitchSubject: !session,
      initialSession: session,
      blockDone: finished,
      targetDone: targetComplete,
      serverNow: new Date().toISOString(),
      grove: {
        ...seed.grove,
        live: tree
          ? {
              id: tree.id,
              preset: tree.preset,
              focusMinutes: tree.focusMinutes,
              species: tree.species,
              plantedAt: tree.plantedAt,
              dueAt: tree.dueAt,
            }
          : null,
        todayTrees: trees,
      },
    }),
    [seed, slot, session, finished, targetComplete, tree, trees],
  );

  const species = tree?.species ?? speciesFor(preset.focusMinutes);

  return {
    /* what is being studied */
    subjects: seed.subjects,
    slot,
    setSlot,
    active,
    subjectName,
    topicTitle,
    plannedMinutes,
    quizId,
    canSwitchSubject: seed.canSwitchSubject,
    checkedIn: seed.checkedIn,
    streak: seed.grove.streak,

    /* where the round stands */
    view,
    tree,
    species,
    preset,
    presetKey,
    setPresetKey,
    trees,
    grown,
    withered,
    lost,
    session,
    finished,
    shortBlock,
    targetComplete,
    celebration,
    setCelebration,
    pending,

    /* the clocks */
    roundRemaining,
    roundProgress,
    breakRemaining,
    breakEndsAt,
    blockElapsed,

    /* the controls */
    startRound,
    killRound,
    skipBreak,
    finishBlock,
    completeTarget,
    startAnotherBlock,

    snapshot,
  };
}
