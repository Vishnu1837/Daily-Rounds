'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Coffee, Play, Sprout, Square, TreeDeciduous } from 'lucide-react';

import {
  AnimatedCheck,
  CelebrationModal,
  type CelebrationPayload,
} from '@/components/gamification/celebration';
import { EmptyPlot, Tree } from '@/components/grove/tree';
import { LiveDot } from '@/components/ui/badge';
import { Button, LinkButton } from '@/components/ui/button';
import { Card, CardAurora } from '@/components/ui/card';
import { LiveRegion } from '@/components/ui/feedback';
import { Segmented } from '@/components/ui/segmented';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import {
  AWAY_GRACE_SECONDS,
  DEFAULT_PRESET,
  FOCUS_PRESETS,
  type FocusPresetKey,
  SPECIES_NAMES,
  type TreeSpecies,
  type TreeStatus,
  breakAfterRound,
  growthStage,
  presetByKey,
  speciesFor,
} from '@/lib/domain/grove';
import { STUDENT_HOME } from '@/lib/routes';
import { useScreenWakeLock } from '@/lib/use-screen-wake-lock';
import {
  type PlantedTree,
  growTreeAction,
  plantTreeAction,
  witherTreeAction,
} from '@/server/actions/grove';
import {
  type StudySessionState,
  completeTargetAction,
  finishSessionAction,
  pauseSessionAction,
  startSessionAction,
} from '@/server/actions/study';
import { SITE } from '@/lib/site';

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

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

type TodayTree = { id: string; species: TreeSpecies; status: TreeStatus };

/** What the screen is doing right now. Everything else on it is derived from this. */
type Phase = 'idle' | 'focus' | 'break' | 'lost';

/**
 * The study screen: a Pomodoro round that plants a tree.
 *
 * Two clocks live here and it matters which is which. The *round* is the promise — a fixed
 * countdown owned by the server, drawn as a growing tree, and the only thing that can be
 * broken. The *block* is the day's study time, unchanged from before: it is what pays points,
 * and it accrues while a round runs and pauses on the breaks between them.
 *
 * The round is never trusted to this component. `dueAt` comes from the server, the countdown
 * is derived from it, and the server checks the wall clock again before it agrees to grow
 * anything — so a paused laptop, a fiddled system clock or an open console all fail closed.
 */
export function StudySessionScreen({
  subjects,
  initialSlot,
  canSwitchSubject,
  initialSession,
  blockDone,
  targetDone,
  checkedIn,
  serverNow,
  grove,
}: {
  /** Today's topic in each subject the student is studying, primary slot first. */
  subjects: {
    slot: 'primary' | 'secondary';
    subjectName: string | null;
    topicTitle: string | null;
    plannedMinutes: number;
    quizId: string | null;
  }[];
  /** The subject the screen opens on: the running session's, else the day's leading one. */
  initialSlot: 'primary' | 'secondary' | null;
  /** False once a block exists — the time is already filed against one topic. */
  canSwitchSubject: boolean;
  initialSession: StudySessionState | null;
  blockDone: boolean;
  targetDone: boolean;
  checkedIn: boolean;
  /**
   * The server's clock at render time. The countdowns are seeded from this rather than from
   * `Date.now()` so the first client render produces exactly the markup the server sent —
   * seeding from the browser clock renders a different number and fails hydration.
   */
  serverNow: string;
  grove: {
    live: {
      id: string;
      preset: string;
      focusMinutes: number;
      species: TreeSpecies;
      plantedAt: string;
      dueAt: string;
    } | null;
    todayTrees: TodayTree[];
    streak: number;
  };
}) {
  const router = useRouter();
  const toast = useToast();

  /*
   * Which subject this block is for.
   *
   * Local state rather than a URL parameter: both subjects' topics and knowledge checks
   * already arrived with the page, so switching is instant and this route stays
   * prerenderable — which matters on the screen students open most.
   */
  const [slot, setSlot] = useState<'primary' | 'secondary' | null>(initialSlot);
  const active = subjects.find((s) => s.slot === slot) ?? subjects[0] ?? null;
  const subjectName = active?.subjectName ?? null;
  const topicTitle = active?.topicTitle ?? null;
  const plannedMinutes = active?.plannedMinutes ?? 90;
  const quizId = active?.quizId ?? null;

  const [session, setSession] = useState<StudySessionState | null>(initialSession);
  const [tree, setTree] = useState<PlantedTree | null>(
    grove.live
      ? { ...grove.live, preset: presetByKey(grove.live.preset).key, resumed: true }
      : null,
  );
  const [phase, setPhase] = useState<Phase>(grove.live ? 'focus' : 'idle');
  const [presetKey, setPresetKey] = useState<FocusPresetKey>(
    grove.live ? presetByKey(grove.live.preset).key : DEFAULT_PRESET,
  );
  const [trees, setTrees] = useState<TodayTree[]>(grove.todayTrees);
  const [breakEndsAt, setBreakEndsAt] = useState<number | null>(null);
  const [lost, setLost] = useState<{ species: TreeSpecies; minutes: number } | null>(null);
  const [now, setNow] = useState(() => new Date(serverNow).getTime());

  const [celebration, setCelebration] = useState<CelebrationPayload | null>(null);
  const [finished, setFinished] = useState(blockDone);
  const [shortBlock, setShortBlock] = useState<{ minutes: number; required: number } | null>(null);
  const [targetComplete, setTargetComplete] = useState(targetDone);
  const [pending, startTransition] = useTransition();

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
  // screen does no work at all.
  useEffect(() => {
    const counting = view === 'focus' || view === 'break' || session?.status === 'running';
    if (!counting) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [view, session?.status]);

  /* ------------------------------------------------------------- the tree */

  // Guards the two settle paths against firing twice — the ticker, an unmount and a
  // visibility change can all reach for the same tree within the same second.
  const settling = useRef(false);
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

  /** Stops the block clock so a break does not quietly count as study time. */
  const pauseBlock = useCallback(async () => {
    const current = sessionRef.current;
    if (!current || current.status !== 'running') return;
    const result = await pauseSessionAction(current.id);
    if (result.ok) setSession(result.data);
  }, []);

  const completeRound = useCallback(async () => {
    const current = treeRef.current;
    if (!current || settling.current) return;
    settling.current = true;

    const result = await growTreeAction(current.id);
    if (!result.ok) {
      settling.current = false;
      toast.error('Could not save that round', result.message);
      return;
    }

    setTree(null);
    setTrees((prev) => [...prev, { id: current.id, species: current.species, status: 'grown' }]);
    setLost(null);

    // The break is not a commitment, so it is client-side only: nothing is written down and
    // skipping it costs nothing.
    const roundNumber = result.data.treesToday;
    setBreakEndsAt(Date.now() + breakAfterRound(preset, roundNumber) * 60_000);
    setPhase('break');
    await pauseBlock();
    settling.current = false;

    toast.success(
      `${SPECIES_NAMES[current.species]} grown`,
      `${plural(current.focusMinutes, 'minute')} of unbroken focus. ${plural(result.data.treesToday, 'tree')} in today's plot.`,
    );
    router.refresh();
  }, [pauseBlock, preset, router, toast]);

  const killRound = useCallback(
    async (reason: 'left' | 'gave_up') => {
      const current = treeRef.current;
      if (!current || settling.current) return;
      settling.current = true;

      // Optimistic on purpose. The student has already broken the round; making them watch a
      // spinner before being told so would be the one moment in this flow that felt slow.
      setTree(null);
      setTrees((prev) => [
        ...prev,
        { id: current.id, species: current.species, status: 'withered' },
      ]);
      setLost({ species: current.species, minutes: current.focusMinutes });
      setPhase('lost');
      setBreakEndsAt(null);

      const result = await witherTreeAction(current.id, reason);
      if (!result.ok) toast.error('Could not record that', result.message);
      await pauseBlock();
      settling.current = false;
      router.refresh();
    },
    [pauseBlock, router, toast],
  );

  // The round ends itself. Nothing waits for the student to press anything, because a round
  // that needs a button to finish is a round you can forget to claim.
  useEffect(() => {
    if (view !== 'focus' || !tree) return;
    if (roundRemaining > 0) return;
    void completeRound();
  }, [view, tree, roundRemaining, completeRound]);

  /* ------------------------------------------------------------ leaving */

  // Most rounds are sat out on a phone, so the round asks to keep the screen lit rather than
  // relying on the student to keep tapping it awake. It is only a request — see the hook.
  useScreenWakeLock(view === 'focus');

  /**
   * Going somewhere else kills the tree. Putting the phone down does not.
   *
   * Both of those arrive as the same `visibilitychange`, and the platform offers exactly one
   * signal that separates them: who holds focus. Another tab, window or app coming to the
   * front takes focus away first; a screen that simply switched off leaves focus where it
   * was. So a hidden-but-still-focused page is read as a dark screen and the round carries
   * on — the countdown is server time, not frames, so it keeps running regardless.
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
    if (view !== 'focus') return;
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
      timer = window.setTimeout(() => void killRound('left'), AWAY_GRACE_SECONDS * 1000);
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      disarm();
    };
  }, [view, killRound]);

  // A closed tab is a walked-away round; the sweep settles it server-side within two minutes,
  // so this only has to make sure the student knew.
  useEffect(() => {
    if (view !== 'focus') return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [view]);

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

  /* -------------------------------------------------------------- render */

  const dark = view === 'focus';
  const species = tree?.species ?? speciesFor(preset.focusMinutes);
  const ringPct =
    view === 'focus'
      ? roundProgress * 100
      : view === 'break' && breakEndsAt
        ? (1 - breakRemaining / (breakAfterRound(preset, grown) * 60)) * 100
        : 0;

  const statusLabel =
    view === 'focus'
      ? 'Growing — stay on this tab'
      : view === 'break'
        ? 'Break'
        : view === 'lost'
          ? 'Withered'
          : finished
            ? shortBlock
              ? 'Too short to count'
              : 'Block logged'
            : grown > 0
              ? 'Ready for the next round'
              : 'Ready when you are';

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <CelebrationModal payload={celebration} onClose={() => setCelebration(null)} />

      <Link
        href={STUDENT_HOME}
        className="tap text-fg-muted hover:text-fg inline-flex items-center gap-1.5 rounded-lg px-1 py-2 text-sm font-semibold transition-colors"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back to today
      </Link>

      {/*
        The screen goes dark while a round runs. Dimming the rest of the interface is the only
        honest way to signal "you are meant to be doing something else right now" — an app that
        stays bright and busy while asking for twenty-five minutes of focus is arguing with
        itself.
      */}
      <Card
        variant={dark ? 'solid' : 'surface'}
        tone="neutral"
        padding="none"
        className={cn(
          'relative overflow-hidden transition-colors duration-700',
          dark && 'text-white',
        )}
      >
        {dark && <CardAurora tone="pulse" />}

        <div className="relative flex flex-col items-center px-5 py-9 text-center sm:py-11">
          {subjectName && (
            <p
              className={cn(
                'text-2xs font-bold tracking-[0.16em] uppercase',
                dark ? 'text-white/60' : 'text-iris-700 dark:text-iris-300',
              )}
            >
              {subjectName}
            </p>
          )}
          <h1
            className={cn(
              'mt-2 max-w-md text-xl font-extrabold text-balance sm:text-2xl',
              dark ? 'text-white' : 'text-fg',
            )}
          >
            {topicTitle ?? 'Free study block'}
          </h1>
          <p className={cn('mt-2 text-sm', dark ? 'text-white/65' : 'text-fg-muted')}>
            {view === 'focus'
              ? `${SPECIES_NAMES[species]} · ${preset.focusMinutes}-minute round`
              : `Planned: ${plannedMinutes} minutes today`}
          </p>

          {/*
            Which subject this block is for.
            Only shown before anything starts: once the timer is running the block is filed
            against a topic, and the choice travels in the URL so the topic, the minutes and
            the knowledge check below all come from one server render.
          */}
          {canSwitchSubject && subjects.length > 1 && (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              {subjects.map((choice) => (
                <button
                  key={choice.slot}
                  type="button"
                  onClick={() => setSlot(choice.slot)}
                  aria-pressed={choice.slot === active?.slot}
                  className={cn(
                    'rounded-pill px-3 py-1.5 text-xs font-bold ring-1 transition-colors ring-inset',
                    choice.slot === active?.slot
                      ? dark
                        ? 'bg-white/20 text-white ring-white/25'
                        : 'bg-iris-100 text-iris-800 ring-iris-200 dark:bg-iris-900/40 dark:text-iris-200 dark:ring-iris-800'
                      : dark
                        ? 'text-white/65 ring-white/15 hover:bg-white/10'
                        : 'text-fg-muted ring-border hover:bg-bg-sunken',
                  )}
                >
                  {choice.subjectName ?? 'Subject'}
                </button>
              ))}
            </div>
          )}

          {/* ----------------------------------------------- the ring and tree */}
          <div className="relative mt-8 grid place-items-center">
            <svg width="248" height="248" className="-rotate-90" aria-hidden>
              <defs>
                <linearGradient id="dr-round" x1="0" y1="0" x2="1" y2="1">
                  <stop
                    offset="0%"
                    stopColor={view === 'break' ? 'var(--color-aqua-300)' : 'var(--color-success)'}
                  />
                  <stop
                    offset="100%"
                    stopColor={
                      view === 'break' ? 'var(--color-aqua-500)' : 'var(--color-success-strong)'
                    }
                  />
                </linearGradient>
              </defs>
              <circle
                cx="124"
                cy="124"
                r="110"
                fill="none"
                strokeWidth="14"
                className={dark ? 'stroke-white/15' : 'stroke-bg-inset'}
              />
              <circle
                cx="124"
                cy="124"
                r="110"
                fill="none"
                stroke="url(#dr-round)"
                strokeWidth="14"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 110}
                strokeDashoffset={
                  2 * Math.PI * 110 * (1 - Math.max(0, Math.min(100, ringPct)) / 100)
                }
                className="ease-out-soft transition-[stroke-dashoffset] duration-700 motion-reduce:transition-none"
              />
            </svg>

            <div className="absolute inset-0 grid place-items-center">
              <div className="flex flex-col items-center">
                {view === 'break' ? (
                  <Coffee
                    className={cn('size-16', dark ? 'text-white/80' : 'text-aqua-500')}
                    strokeWidth={1.4}
                    aria-hidden
                  />
                ) : view === 'lost' && lost ? (
                  <Tree species={lost.species} status="withered" size={96} />
                ) : tree ? (
                  <Tree
                    species={species}
                    stage={growthStage(roundProgress)}
                    size={96}
                    sway
                    title={`${SPECIES_NAMES[species]} growing`}
                  />
                ) : (
                  <EmptyPlot size={96} className={dark ? 'text-white' : 'text-fg'} />
                )}

                <p
                  className={cn(
                    'stat-num text-stat-sm mt-1 tabular-nums transition-colors',
                    dark ? 'text-white' : view === 'break' ? 'text-aqua-500' : 'text-fg',
                  )}
                >
                  {view === 'focus'
                    ? formatClock(roundRemaining)
                    : view === 'break'
                      ? formatClock(breakRemaining)
                      : formatClock(preset.focusMinutes * 60)}
                </p>
                <p
                  className={cn(
                    'mt-1 text-xs font-semibold',
                    dark ? 'text-white/65' : 'text-fg-muted',
                  )}
                >
                  {statusLabel}
                </p>
              </div>
            </div>

            {view === 'focus' && (
              <span className="absolute top-1 right-6">
                <LiveDot />
              </span>
            )}
          </div>

          <LiveRegion>
            {view === 'focus'
              ? `Focus round running, ${Math.ceil(roundRemaining / 60)} minutes left.`
              : view === 'break'
                ? `Break, ${Math.ceil(breakRemaining / 60)} minutes left.`
                : view === 'lost'
                  ? 'Your tree withered.'
                  : 'No round running.'}
          </LiveRegion>

          {/* ------------------------------------------------ today's plot */}
          <div className="mt-6 w-full max-w-xs">
            <div
              className={cn(
                'rounded-panel flex min-h-16 flex-wrap items-end justify-center gap-0.5 px-3 py-2',
                dark ? 'bg-white/8 text-white' : 'bg-bg-sunken text-fg',
              )}
            >
              {trees.length === 0 ? (
                <p className={cn('py-3 text-xs', dark ? 'text-white/55' : 'text-fg-subtle')}>
                  Nothing planted today yet.
                </p>
              ) : (
                trees.map((t) => (
                  <Tree
                    key={t.id}
                    species={t.species}
                    status={t.status}
                    size={26}
                    title={
                      t.status === 'grown'
                        ? `${SPECIES_NAMES[t.species]}, grown`
                        : `${SPECIES_NAMES[t.species]}, withered`
                    }
                  />
                ))
              )}
            </div>
            <p className={cn('mt-2 text-xs', dark ? 'text-white/55' : 'text-fg-muted')}>
              {plural(grown, 'tree')} today
              {withered > 0 && ` · ${withered} withered`}
              {grove.streak > 0 && ` · ${plural(grove.streak, 'day')} planting streak`}
            </p>
            {/*
              The block clock, kept deliberately small. It is the number that pays points, but
              putting it next to the round countdown at the same weight would give the student
              two things to watch and make neither of them mean anything.
            */}
            <p className={cn('mt-1 text-xs', dark ? 'text-white/40' : 'text-fg-subtle')}>
              Study block: {Math.floor(blockElapsed / 60)} of {plannedMinutes} min
            </p>
          </div>

          {/* ---------------------------------------------------- controls */}
          <div className="mt-7 w-full max-w-xs space-y-2.5">
            {view === 'focus' ? (
              <>
                <Button
                  variant="inverse-soft"
                  size="lg"
                  fullWidth
                  onClick={() => void killRound('gave_up')}
                >
                  Give up — kill the tree
                </Button>
                <p className="text-xs leading-relaxed text-white/50">
                  Switch to another tab or app for more than {AWAY_GRACE_SECONDS} seconds and the
                  tree dies. Locking your screen is fine — the tree keeps growing in the dark.
                </p>
              </>
            ) : view === 'break' ? (
              <>
                <Button size="lg" fullWidth onClick={skipBreak}>
                  Skip the break
                </Button>
                <p className="text-fg-subtle text-xs">
                  The next round starts when you say so — a break that starts a round for you is
                  just a round you did not choose.
                </p>
              </>
            ) : finished && shortBlock ? (
              <div className="rounded-panel bg-warning/14 ring-warning/25 p-4 text-center ring-1 ring-inset">
                <p className="text-fg text-sm font-bold">Too short to count</p>
                <p className="text-fg-muted mt-1 text-sm">
                  You studied {shortBlock.minutes} minutes. A block needs {shortBlock.required} to
                  earn XP — start another round when you have a real stretch of time.
                </p>
              </div>
            ) : null}

            {(view === 'idle' || view === 'lost') && !finished && (
              <>
                {view === 'lost' && lost && (
                  <div className="rounded-panel bg-danger/10 ring-danger/20 p-4 text-center ring-1 ring-inset">
                    <p className="text-fg text-sm font-bold">
                      Your {SPECIES_NAMES[lost.species].toLowerCase()} withered
                    </p>
                    <p className="text-fg-muted mt-1 text-sm">
                      The stump stays in your grove. The minutes you did sit still count towards
                      your study block — the tree does not.
                    </p>
                  </div>
                )}

                <Segmented
                  ariaLabel="Round length"
                  value={presetKey}
                  onChange={setPresetKey}
                  options={FOCUS_PRESETS.map((p) => ({
                    value: p.key,
                    label: `${p.label} · ${p.focusMinutes}m`,
                  }))}
                />
                <p className="text-fg-subtle text-xs">{preset.blurb}</p>

                <Button size="xl" fullWidth loading={pending} onClick={startRound}>
                  <Sprout className="size-5" aria-hidden />
                  {grown > 0 || withered > 0 ? 'Plant another tree' : 'Plant a tree and start'}
                </Button>
              </>
            )}

            {view !== 'focus' && session && !finished && (
              <Button variant="outline" size="lg" fullWidth loading={pending} onClick={finishBlock}>
                <Square className="size-4 fill-current" aria-hidden />
                Finish the block and log it
              </Button>
            )}

            {finished && !shortBlock && (
              <div className="rounded-panel bg-success/12 text-success-strong ring-success/25 dark:text-success flex items-center justify-center gap-2.5 p-4 ring-1 ring-inset">
                <AnimatedCheck size={22} />
                <span className="font-bold">Study block complete</span>
              </div>
            )}

            {finished && (
              <Button
                variant="outline"
                size="lg"
                fullWidth
                loading={pending}
                onClick={() => {
                  setFinished(false);
                  setShortBlock(null);
                  setSession(null);
                  setPhase('idle');
                }}
              >
                <Play className="size-4 fill-current" aria-hidden />
                Start another block
              </Button>
            )}
          </div>

          {view !== 'focus' && (
            <p className="text-fg-subtle mt-6 max-w-xs text-xs leading-relaxed">
              {SITE.name} doesn&apos;t try to prove you studied. It records what you committed to
              and what you actually did — the honesty is the point.
            </p>
          )}
        </div>
      </Card>

      {/* -------------------------------------------------------- next steps */}
      {!dark && (
        <Card padding="lg">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="eyebrow">Your grove</p>
              <p className="text-fg-muted mt-1 text-sm">
                Every round you sit through is a tree. Every one you walk out on is a stump.
              </p>
            </div>
            <LinkButton href="/grove" variant="outline" size="sm">
              <TreeDeciduous className="size-4" aria-hidden />
              Open
            </LinkButton>
          </div>
        </Card>
      )}

      {finished && !shortBlock && (
        <Card padding="lg" className="animate-rise">
          <p className="eyebrow">Finish the day</p>
          <div className="mt-4 space-y-2.5">
            {!targetComplete ? (
              <Button
                variant="outline"
                size="lg"
                fullWidth
                loading={pending}
                onClick={completeTarget}
              >
                Mark today&apos;s target complete
              </Button>
            ) : (
              <div className="rounded-panel bg-success/12 text-success-strong dark:text-success flex items-center gap-2.5 p-3.5 text-sm font-bold">
                <AnimatedCheck size={18} />
                Target complete
              </div>
            )}
            {quizId && (
              <LinkButton href={`/quiz/${quizId}`} variant="outline" size="lg" fullWidth>
                Take the 5-question knowledge check
              </LinkButton>
            )}
            <LinkButton
              href="/check-in"
              size="lg"
              fullWidth
              variant={checkedIn ? 'outline' : 'primary'}
            >
              {checkedIn ? 'Update your check-in' : 'Do your 60-second check-in'}
            </LinkButton>
          </div>
        </Card>
      )}
    </div>
  );
}
