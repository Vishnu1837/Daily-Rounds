'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Pause, Play, Square } from 'lucide-react';

import {
  AnimatedCheck,
  CelebrationModal,
  type CelebrationPayload,
} from '@/components/gamification/celebration';
import { LiveDot } from '@/components/ui/badge';
import { Button, LinkButton } from '@/components/ui/button';
import { Card, CardAurora } from '@/components/ui/card';
import { LiveRegion } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import {
  type StudySessionState,
  completeTargetAction,
  finishSessionAction,
  pauseSessionAction,
  startSessionAction,
} from '@/server/actions/study';
import { STUDENT_HOME } from '@/lib/routes';

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

export function StudySessionScreen({
  topicTitle,
  subjectName,
  plannedMinutes,
  initialSession,
  blockDone,
  targetDone,
  checkedIn,
  quizId,
}: {
  topicTitle: string | null;
  subjectName: string | null;
  plannedMinutes: number;
  initialSession: StudySessionState | null;
  blockDone: boolean;
  targetDone: boolean;
  checkedIn: boolean;
  quizId: string | null;
}) {
  const router = useRouter();
  const toast = useToast();

  const [session, setSession] = useState<StudySessionState | null>(initialSession);
  const [elapsed, setElapsed] = useState(() => computeElapsed(initialSession));
  const [celebration, setCelebration] = useState<CelebrationPayload | null>(null);
  const [finished, setFinished] = useState(blockDone);
  const [shortBlock, setShortBlock] = useState<{ minutes: number; required: number } | null>(null);
  const [targetComplete, setTargetComplete] = useState(targetDone);
  const [pending, startTransition] = useTransition();
  const intervalRef = useRef<number | null>(null);

  const running = session?.status === 'running';

  // Tick from the server-provided `resumedAt` rather than counting frames, so backgrounding
  // the tab or locking the phone never loses time.
  useEffect(() => {
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    if (!running) return;
    intervalRef.current = window.setInterval(() => {
      setElapsed(computeElapsed(session));
    }, 1000);
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [running, session]);

  const targetSeconds = plannedMinutes * 60;
  const pct = Math.min(100, (elapsed / targetSeconds) * 100);
  const reachedTarget = elapsed >= targetSeconds;

  const start = useCallback(() => {
    startTransition(async () => {
      const result = await startSessionAction();
      if (!result.ok) {
        toast.error('Could not start', result.message);
        return;
      }
      setSession(result.data);
      setElapsed(computeElapsed(result.data));
    });
  }, [toast]);

  const pause = useCallback(() => {
    if (!session) return;
    startTransition(async () => {
      const result = await pauseSessionAction(session.id);
      if (!result.ok) {
        toast.error('Could not pause', result.message);
        return;
      }
      setSession(result.data);
      setElapsed(computeElapsed(result.data));
    });
  }, [session, toast]);

  const finish = useCallback(() => {
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
      const result = await completeTargetAction();
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
  }, [toast, router]);

  const statusLabel = finished
    ? shortBlock
      ? 'Too short to count'
      : 'Block logged'
    : running
      ? reachedTarget
        ? 'Target reached — keep going or finish'
        : 'In progress'
      : session
        ? 'Paused'
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
        The timer takes the whole surface and goes dark while a session runs.
        Dimming the rest of the interface is the only honest way to signal "you are meant to
        be doing something else right now" — an app that stays bright and busy while asking
        for ninety minutes of focus is arguing with itself.
      */}
      <Card
        variant={running ? 'solid' : 'surface'}
        tone="neutral"
        padding="none"
        className={cn(
          'relative overflow-hidden transition-colors duration-700',
          running && 'text-white',
        )}
      >
        {running && <CardAurora tone="pulse" />}

        <div className="relative flex flex-col items-center px-5 py-9 text-center sm:py-11">
          {subjectName && (
            <p
              className={cn(
                'text-2xs font-bold tracking-[0.16em] uppercase',
                running ? 'text-white/60' : 'text-iris-700 dark:text-iris-300',
              )}
            >
              {subjectName}
            </p>
          )}
          <h1
            className={cn(
              'mt-2 max-w-md text-xl font-extrabold text-balance sm:text-2xl',
              running ? 'text-white' : 'text-fg',
            )}
          >
            {topicTitle ?? 'Free study block'}
          </h1>
          <p className={cn('mt-2 text-sm', running ? 'text-white/65' : 'text-fg-muted')}>
            Planned: {plannedMinutes} minutes
          </p>

          {/* -------------------------------------------------------- timer */}
          <div className="relative mt-9 grid place-items-center">
            <svg width="248" height="248" className="-rotate-90" aria-hidden>
              <defs>
                <linearGradient id="dr-timer" x1="0" y1="0" x2="1" y2="1">
                  <stop
                    offset="0%"
                    stopColor={reachedTarget ? 'var(--color-success)' : 'var(--color-citrus-300)'}
                  />
                  <stop
                    offset="100%"
                    stopColor={
                      reachedTarget ? 'var(--color-success-strong)' : 'var(--color-pulse-400)'
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
                className={running ? 'stroke-white/15' : 'stroke-bg-inset'}
              />
              <circle
                cx="124"
                cy="124"
                r="110"
                fill="none"
                stroke="url(#dr-timer)"
                strokeWidth="14"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 110}
                strokeDashoffset={2 * Math.PI * 110 * (1 - pct / 100)}
                className="ease-out-soft transition-[stroke-dashoffset] duration-700 motion-reduce:transition-none"
              />
            </svg>

            <div className="absolute inset-0 grid place-items-center">
              <div>
                <p
                  className={cn(
                    'stat-num text-stat-lg transition-colors',
                    running
                      ? 'text-white'
                      : reachedTarget
                        ? 'text-success-strong dark:text-success'
                        : 'text-fg',
                  )}
                >
                  {formatClock(elapsed)}
                </p>
                <p
                  className={cn(
                    'mt-2 text-sm font-semibold',
                    running ? 'text-white/65' : 'text-fg-muted',
                  )}
                >
                  {statusLabel}
                </p>
              </div>
            </div>

            {running && (
              <span className="absolute top-1 right-6">
                <LiveDot />
              </span>
            )}
          </div>

          <LiveRegion>
            {finished
              ? 'Study block completed and logged.'
              : running
                ? `Study session running, ${Math.floor(elapsed / 60)} minutes elapsed.`
                : session
                  ? 'Study session paused.'
                  : 'Study session not started.'}
          </LiveRegion>

          {/* ------------------------------------------------------ controls */}
          <div className="mt-9 w-full max-w-xs space-y-2.5">
            {finished && shortBlock ? (
              <div className="space-y-2.5">
                <div className="rounded-panel bg-warning/14 ring-warning/25 p-4 text-center ring-1 ring-inset">
                  <p className="text-fg text-sm font-bold">Too short to count</p>
                  <p className="text-fg-muted mt-1 text-sm">
                    You studied {shortBlock.minutes} minutes. A block needs {shortBlock.required} to
                    earn XP — start again when you have a real stretch of time.
                  </p>
                </div>
                <Button
                  size="lg"
                  fullWidth
                  loading={pending}
                  onClick={() => {
                    setFinished(false);
                    setShortBlock(null);
                    setSession(null);
                    start();
                  }}
                >
                  <Play className="size-4 fill-current" aria-hidden />
                  Start another block
                </Button>
              </div>
            ) : finished ? (
              <div className="rounded-panel bg-success/12 text-success-strong ring-success/25 dark:text-success flex items-center justify-center gap-2.5 p-4 ring-1 ring-inset">
                <AnimatedCheck size={22} />
                <span className="font-bold">Study block complete</span>
              </div>
            ) : !session || session.status === 'completed' ? (
              <Button size="xl" fullWidth loading={pending} onClick={start}>
                <Play className="size-5 fill-current" aria-hidden />
                Start studying
              </Button>
            ) : running ? (
              <>
                <Button variant="inverse" size="xl" fullWidth loading={pending} onClick={finish}>
                  <Square className="size-4 fill-current" aria-hidden />
                  Finish block
                </Button>
                <Button
                  variant="inverse-soft"
                  size="lg"
                  fullWidth
                  loading={pending}
                  onClick={pause}
                >
                  <Pause className="size-4 fill-current" aria-hidden />
                  Pause
                </Button>
              </>
            ) : (
              <>
                <Button size="xl" fullWidth loading={pending} onClick={start}>
                  <Play className="size-5 fill-current" aria-hidden />
                  Resume
                </Button>
                <Button variant="outline" size="lg" fullWidth loading={pending} onClick={finish}>
                  Finish block
                </Button>
              </>
            )}
          </div>

          <p
            className={cn(
              'mt-6 max-w-xs text-xs leading-relaxed',
              running ? 'text-white/50' : 'text-fg-subtle',
            )}
          >
            Daily Rounds doesn&apos;t try to prove you studied. It records what you committed to and
            what you actually did — the honesty is the point.
          </p>
        </div>
      </Card>

      {/* -------------------------------------------------------- next steps */}
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

/** Elapsed = stored seconds plus whatever has accrued since the server resumed it. */
function computeElapsed(session: StudySessionState | null): number {
  if (!session) return 0;
  if (session.status !== 'running' || !session.resumedAt) return session.elapsedSeconds;
  const since = Math.floor((Date.now() - new Date(session.resumedAt).getTime()) / 1000);
  return session.elapsedSeconds + Math.max(0, since);
}
