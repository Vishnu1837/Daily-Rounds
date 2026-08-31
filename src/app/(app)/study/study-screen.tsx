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
import { Button, LinkButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
      const { qualified, minutes, requiredMinutes, milestone, pointsAwarded, streak } =
        result.data;

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

  return (
    <div className="space-y-4">
      <CelebrationModal payload={celebration} onClose={() => setCelebration(null)} />

      <Link
        href="/"
        className="tap inline-flex items-center gap-1.5 px-1 py-2 text-sm font-semibold text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back to today
      </Link>

      <Card className="relative overflow-hidden">
        <div
          className={cn(
            'pointer-events-none absolute inset-0 transition-opacity duration-700',
            running
              ? 'bg-linear-to-br from-pulse-500/14 via-transparent to-iris-500/10 opacity-100'
              : 'opacity-0',
          )}
          aria-hidden
        />

        <div className="relative flex flex-col items-center px-5 py-8 text-center">
          {subjectName && (
            <p className="text-sm font-semibold text-iris-600 dark:text-iris-300">{subjectName}</p>
          )}
          <h1 className="mt-1 max-w-sm text-xl font-extrabold text-balance text-fg">
            {topicTitle ?? 'Free study block'}
          </h1>
          <p className="mt-1.5 text-sm text-fg-muted">Planned: {plannedMinutes} minutes</p>

          {/* ------------------------------------------------------ timer */}
          <div className="relative mt-7 grid place-items-center">
            <svg width="224" height="224" className="-rotate-90" aria-hidden>
              <circle cx="112" cy="112" r="100" fill="none" stroke="var(--bg-sunken)" strokeWidth="12" />
              <circle
                cx="112"
                cy="112"
                r="100"
                fill="none"
                stroke={reachedTarget ? 'var(--color-success)' : 'var(--color-pulse-500)'}
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 100}
                strokeDashoffset={2 * Math.PI * 100 * (1 - pct / 100)}
                className="transition-[stroke-dashoffset,stroke] duration-700 ease-out motion-reduce:transition-none"
              />
            </svg>

            <div className="absolute inset-0 grid place-items-center">
              <div>
                <p
                  className={cn(
                    'font-display text-5xl font-extrabold tabular-nums transition-colors',
                    reachedTarget ? 'text-success' : 'text-fg',
                  )}
                >
                  {formatClock(elapsed)}
                </p>
                <p className="mt-1 text-sm font-semibold text-fg-muted">
                  {finished
                    ? shortBlock
                      ? 'Too short to count'
                      : 'Block logged'
                    : running
                      ? reachedTarget
                        ? 'Target reached — keep going or finish'
                        : 'In progress'
                      : session
                        ? 'Paused'
                        : 'Ready when you are'}
                </p>
              </div>
            </div>

            {running && (
              <span
                className="absolute -top-1 right-4 size-3 rounded-full bg-pulse-500 animate-ring"
                aria-hidden
              />
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

          {/* ---------------------------------------------------- controls */}
          <div className="mt-8 w-full max-w-xs space-y-2.5">
            {finished && shortBlock ? (
              <div className="space-y-2.5">
                <div className="rounded-2xl bg-warning/12 p-4 text-center">
                  <p className="text-sm font-bold text-fg">Too short to count</p>
                  <p className="mt-1 text-sm text-fg-muted">
                    You studied {shortBlock.minutes} minutes. A block needs{' '}
                    {shortBlock.required} to earn points — start again when you have a real
                    stretch of time.
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
                  <Play className="size-4" aria-hidden />
                  Start another block
                </Button>
              </div>
            ) : finished ? (
              <div className="flex items-center justify-center gap-2.5 rounded-2xl bg-success/10 p-4 text-success">
                <AnimatedCheck size={22} />
                <span className="font-bold">Study block complete</span>
              </div>
            ) : !session || session.status === 'completed' ? (
              <Button size="xl" fullWidth loading={pending} onClick={start}>
                <Play className="size-5" aria-hidden />
                Start studying
              </Button>
            ) : running ? (
              <>
                <Button size="xl" fullWidth loading={pending} onClick={finish}>
                  <Square className="size-4" aria-hidden />
                  Finish block
                </Button>
                <Button variant="outline" size="lg" fullWidth loading={pending} onClick={pause}>
                  <Pause className="size-4" aria-hidden />
                  Pause
                </Button>
              </>
            ) : (
              <>
                <Button size="xl" fullWidth loading={pending} onClick={start}>
                  <Play className="size-5" aria-hidden />
                  Resume
                </Button>
                <Button variant="outline" size="lg" fullWidth loading={pending} onClick={finish}>
                  Finish block
                </Button>
              </>
            )}
          </div>

          <p className="mt-5 max-w-xs text-xs leading-relaxed text-fg-subtle">
            Daily Rounds doesn&apos;t try to prove you studied. It records what you committed to and
            what you actually did — the honesty is the point.
          </p>
        </div>
      </Card>

      {/* ---------------------------------------------------- next steps */}
      {finished && !shortBlock && (
        <Card className="p-5">
          <h2 className="text-2xs font-bold tracking-[0.14em] text-fg-subtle uppercase">
            Finish the day
          </h2>
          <div className="mt-4 space-y-2.5">
            {!targetComplete && (
              <Button variant="outline" size="lg" fullWidth loading={pending} onClick={completeTarget}>
                Mark today&apos;s target complete
              </Button>
            )}
            {targetComplete && (
              <div className="flex items-center gap-2.5 rounded-2xl bg-success/10 p-3.5 text-sm font-bold text-success">
                <AnimatedCheck size={18} />
                Target complete
              </div>
            )}
            {quizId && (
              <LinkButton href={`/quiz/${quizId}`} variant="outline" size="lg" fullWidth>
                Take the 5-question knowledge check
              </LinkButton>
            )}
            <LinkButton href="/check-in" size="lg" fullWidth variant={checkedIn ? 'outline' : 'primary'}>
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
