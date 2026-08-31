'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, CalendarDays, Radio, Sparkles, Video } from 'lucide-react';

import { AnimatedCheck, CelebrationModal, type CelebrationPayload } from '@/components/gamification/celebration';
import { StreakFlame } from '@/components/gamification/streak-flame';
import { Badge } from '@/components/ui/badge';
import { Button, LinkButton } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { AnimatedCounter } from '@/components/ui/counter';
import { ProgressBar, ProgressRing } from '@/components/ui/progress';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import { markAchievementsSeenAction } from '@/server/actions/study';
import type { HomeData } from '@/server/queries/student';

type Pulse = {
  size: number;
  showedUpToday: number;
  weeklyConsistency: number;
  totalStudyMinutes: number;
  cohortStreak: number;
  thresholdPct: number;
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function HomeScreen({
  firstName,
  cohortName,
  home,
  pulse,
}: {
  firstName: string;
  cohortName: string;
  home: HomeData;
  pulse: Pulse;
}) {
  // Celebrations raised by an action on this screen (completing today's target).
  const [actionCelebration, setActionCelebration] = useState<CelebrationPayload | null>(null);
  const [achievementDismissed, setAchievementDismissed] = useState(false);
  const [, startTransition] = useTransition();

  const unseen = home.unseenAchievements[0];

  // Mark the badge seen on the server. The effect performs the side effect only — what is
  // displayed is derived below, so the celebration renders on the first paint rather than
  // one render later.
  useEffect(() => {
    if (home.unseenAchievements.length === 0) return;
    const codes = home.unseenAchievements.map((a) => a.code);
    startTransition(() => {
      void markAchievementsSeenAction(codes);
    });
  }, [home.unseenAchievements]);

  const celebration: CelebrationPayload | null =
    actionCelebration ??
    (unseen && !achievementDismissed
      ? {
          kind: 'achievement',
          title: unseen.name,
          message: unseen.description,
          emoji: unseen.emoji,
        }
      : null);

  const dismissCelebration = () => {
    if (actionCelebration) setActionCelebration(null);
    else setAchievementDismissed(true);
  };

  const doneCount = home.tasks.filter((t) => t.done).length;
  const dayComplete = doneCount === home.tasks.length;

  return (
    <div className="space-y-4">
      <CelebrationModal payload={celebration} onClose={dismissCelebration} />

      {/* ---------------------------------------------------------- header */}
      <header className="px-1 pt-2">
        <p className="text-sm font-medium text-fg-muted">
          {greeting()}, <span className="text-fg">{firstName}</span> 👋
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <h1 className="text-2xl font-extrabold tracking-tight text-fg">
            Week {String(home.weekNumber).padStart(2, '0')}
          </h1>
          <span className="text-fg-subtle" aria-hidden>
            •
          </span>
          <span className="text-lg font-semibold text-fg-muted">{home.weekdayLabel}</span>
        </div>
      </header>

      {/* --------------------------------------------------------- streak */}
      <StreakHeadline
        streak={home.streak}
        best={home.bestStreak}
        next={home.nextMilestone}
        isActiveDay={home.isActiveDay}
        isHoliday={home.isHolidayToday}
      />

      {/* ------------------------------------------------------- comeback */}
      <AnimatePresence>
        {home.comeback.isComeback && !dayComplete && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <ComebackBanner missed={home.comeback.missedDays.length} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* --------------------------------------------------- today's topic */}
      <TodayMission home={home} onCelebrate={setActionCelebration} />

      {/* ------------------------------------------------------ study room */}
      <StudyRoomCard room={home.studyRoom} />

      {/* -------------------------------------------------------- progress */}
      <TodayProgress home={home} doneCount={doneCount} />

      {/* ----------------------------------------------------- quick stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <QuickStat
          label="Weekly consistency"
          value={`${home.weeklyConsistency}%`}
          tone="pulse"
          href="/progress"
        />
        <QuickStat
          label="Streak"
          value={`${home.streak}`}
          prefix={<StreakFlame streak={home.streak} size="sm" />}
          tone="flame"
          href="/progress"
        />
        <QuickStat
          label="Roadmap"
          value={`${home.roadmapPct}%`}
          tone="iris"
          href="/roadmap"
        />
        <QuickStat
          label="Leaderboard"
          value={home.rank ? `#${home.rank}` : '—'}
          sub={home.rank ? `of ${home.cohortSize}` : undefined}
          tone="neutral"
          href="/leaderboard"
        />
      </div>

      {/* --------------------------------------------------------- cohort */}
      <CohortPulseCard pulse={pulse} cohortName={cohortName} />

      {/* ------------------------------------------------------- upcoming */}
      {home.upcoming.length > 0 && (
        <section className="space-y-2">
          <SectionTitle>Upcoming</SectionTitle>
          <div className="space-y-2">
            {home.upcoming.map((event) => (
              <UpcomingEvent key={event.id} event={event} />
            ))}
          </div>
        </section>
      )}

      {/* ---------------------------------------------------- announcement */}
      {home.announcement && (
        <section className="space-y-2">
          <SectionTitle>From your cohort lead</SectionTitle>
          <Card className="p-5">
            <h3 className="font-bold text-fg">{home.announcement.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{home.announcement.body}</p>
          </Card>
        </section>
      )}

      <p className="px-1 pt-2 pb-1 text-center text-xs text-fg-subtle">
        <Link href="/how-points-work" className="underline">
          How points and consistency work
        </Link>
      </p>
    </div>
  );
}

/* ------------------------------------------------------------ subviews */

function StreakHeadline({
  streak,
  best,
  next,
  isActiveDay,
  isHoliday,
}: {
  streak: number;
  best: number;
  next: number | null;
  isActiveDay: boolean;
  isHoliday: boolean;
}) {
  const toNext = next ? next - streak : 0;

  return (
    <Card className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 bg-linear-to-br from-flame-500/10 via-transparent to-transparent"
        aria-hidden
      />
      <div className="relative flex items-center gap-4 p-5">
        <StreakFlame streak={streak} size="xl" />
        <div className="min-w-0 flex-1">
          <p className="text-2xl leading-none font-extrabold text-fg">
            <AnimatedCounter value={streak} />
            <span className="ml-1.5 text-base font-bold text-fg-muted">
              {streak === 1 ? 'study day' : 'study days'}
            </span>
          </p>
          <p className="mt-1.5 text-sm text-fg-muted">
            {streak === 0
              ? isHoliday
                ? 'Cohort holiday — your streak is safe.'
                : !isActiveDay
                  ? 'Rest day. Weekends never break a streak.'
                  : 'Complete today to start your streak.'
              : next
                ? `${toNext} more ${toNext === 1 ? 'day' : 'days'} to your ${next}-day milestone.`
                : `Personal best: ${best} days.`}
          </p>
          {next && streak > 0 && (
            <ProgressBar
              value={(streak / next) * 100}
              tone="flame"
              height="sm"
              className="mt-3"
              label={`Progress to ${next}-day streak`}
            />
          )}
        </div>
      </div>
    </Card>
  );
}

function ComebackBanner({ missed }: { missed: number }) {
  return (
    <Card className="border-flame-500/35 bg-flame-500/8 p-5">
      <div className="flex items-start gap-3">
        <span className="text-2xl" aria-hidden>
          💪
        </span>
        <div>
          <h2 className="font-bold text-fg">
            {missed === 1 ? 'Yesterday was missed.' : `You missed ${missed} study days.`} Today is
            your comeback.
          </h2>
          <p className="mt-1 text-sm text-fg-muted">
            The goal was never a perfect record — it&apos;s coming back quickly. Finish today and
            you&apos;re back on rounds.
          </p>
        </div>
      </div>
    </Card>
  );
}

function TodayMission({
  home,
  onCelebrate,
}: {
  home: HomeData;
  onCelebrate: (p: CelebrationPayload) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const blockDone = home.tasks.find((t) => t.key === 'study_block_completed')?.done ?? false;
  const targetDone = home.tasks.find((t) => t.key === 'daily_target_completed')?.done ?? false;

  if (!home.isActiveDay) {
    return (
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <span className="text-2xl" aria-hidden>
            {home.isHolidayToday ? '🎉' : '☕'}
          </span>
          <div>
            <h2 className="font-bold text-fg">
              {home.isHolidayToday ? 'Cohort holiday' : 'Rest day'}
            </h2>
            <p className="mt-1 text-sm text-fg-muted">
              No study day today, and your streak is completely safe. If you feel like getting
              ahead, your roadmap is right there.
            </p>
            <LinkButton href="/roadmap" variant="outline" size="sm" className="mt-4">
              Open roadmap
            </LinkButton>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 bg-linear-to-br from-pulse-500/10 via-transparent to-iris-500/8"
        aria-hidden
      />
      <div className="relative p-5">
        <div className="flex items-center gap-2">
          <Sparkles className="size-3.5 text-pulse-600 dark:text-pulse-400" aria-hidden />
          <h2 className="text-2xs font-bold tracking-[0.14em] text-fg-subtle uppercase">
            Today&apos;s topic
          </h2>
        </div>

        {home.assignment?.topicTitle ? (
          <>
            {home.assignment.subjectName && (
              <p className="mt-3 text-sm font-semibold text-iris-600 dark:text-iris-300">
                {home.assignment.subjectName}
              </p>
            )}
            <h3 className="mt-1 text-xl font-extrabold text-balance text-fg">
              {home.assignment.topicTitle}
            </h3>
            <p className="mt-2.5 text-sm text-fg-muted">
              Planned study:{' '}
              <span className="font-bold text-fg">{home.assignment.plannedMinutes} minutes</span>
            </p>
            {home.assignment.note && (
              <p className="mt-1.5 text-sm text-fg-muted italic">{home.assignment.note}</p>
            )}
          </>
        ) : (
          <>
            <h3 className="mt-3 text-xl font-extrabold text-fg">No topic assigned yet</h3>
            <p className="mt-2 text-sm text-fg-muted">
              Your cohort lead hasn&apos;t set today&apos;s topic. Pick the next one from your
              roadmap and start anyway — showing up is what counts.
            </p>
          </>
        )}

        <div className="mt-5 space-y-2.5">
          {blockDone && targetDone ? (
            <div className="flex items-center gap-3 rounded-2xl bg-success/10 p-4 text-success">
              <AnimatedCheck size={22} />
              <div>
                <p className="text-sm font-bold">Today&apos;s work is done.</p>
                <p className="text-xs opacity-80">
                  {home.checkedIn ? 'Check-in submitted too. Excellent day.' : 'One thing left: your check-in.'}
                </p>
              </div>
            </div>
          ) : (
            <LinkButton href="/study" size="xl" fullWidth>
              {blockDone ? 'Back to study session' : 'Start studying'}
              <ArrowRight className="size-5" aria-hidden />
            </LinkButton>
          )}

          {blockDone && !targetDone && (
            <Button
              variant="outline"
              size="lg"
              fullWidth
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  const { completeTargetAction } = await import('@/server/actions/study');
                  const result = await completeTargetAction();
                  if (!result.ok) {
                    toast.error('Could not save that', result.message);
                    return;
                  }
                  onCelebrate({
                    kind: 'day_complete',
                    title: 'Target complete',
                    message: "That's today's topic locked in. Your roadmap just moved forward.",
                    emoji: '✅',
                    points: result.data.pointsAwarded,
                    streak: result.data.streak,
                  });
                  router.refresh();
                })
              }
            >
              Mark today&apos;s target complete
            </Button>
          )}

          {!home.checkedIn && (
            <LinkButton href="/check-in" variant="ghost" size="md" fullWidth>
              Skip to check-in
            </LinkButton>
          )}
        </div>
      </div>
    </Card>
  );
}

function StudyRoomCard({ room }: { room: HomeData['studyRoom'] }) {
  const attendedLabel =
    room.attended === 'present'
      ? 'Marked present'
      : room.attended === 'late'
        ? 'Marked late'
        : room.attended === 'absent'
          ? 'Marked absent'
          : null;

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Radio className="size-3.5 text-danger" aria-hidden />
            <h2 className="text-2xs font-bold tracking-[0.14em] text-fg-subtle uppercase">
              Live study room
            </h2>
          </div>
          <p className="mt-2.5 font-bold text-fg">Morning Study Room</p>
          <p className="text-sm text-fg-muted">
            {room.startTime} – {room.endTime}
          </p>
        </div>
        {attendedLabel && (
          <Badge tone={room.attended === 'absent' ? 'danger' : room.attended === 'late' ? 'warning' : 'success'}>
            {attendedLabel}
          </Badge>
        )}
      </div>

      {room.url ? (
        <LinkButton href={room.url} external variant="secondary" size="lg" fullWidth className="mt-4">
          <Video className="size-[18px]" aria-hidden />
          Join Google Meet
        </LinkButton>
      ) : (
        <p className="mt-4 rounded-2xl bg-bg-sunken p-3.5 text-sm text-fg-muted">
          No meeting link has been set for the study room yet. Your cohort lead can add one from the
          admin settings.
        </p>
      )}
    </Card>
  );
}

function TodayProgress({ home, doneCount }: { home: HomeData; doneCount: number }) {
  const pct = home.tasks.length === 0 ? 0 : (doneCount / home.tasks.length) * 100;

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-2xs font-bold tracking-[0.14em] text-fg-subtle uppercase">
            Today&apos;s progress
          </h2>
          <p className="mt-2 text-2xl font-extrabold text-fg">
            <AnimatedCounter value={home.todayPoints} />
            <span className="ml-1.5 text-sm font-bold text-fg-muted">points today</span>
          </p>
          <p className="text-sm text-fg-muted">
            {doneCount} of {home.tasks.length} done
          </p>
        </div>
        <ProgressRing value={pct} size={68} tone={pct === 100 ? 'success' : 'pulse'} label="Today's completion">
          <span className="text-sm font-extrabold text-fg">{Math.round(pct)}%</span>
        </ProgressRing>
      </div>

      <ul className="mt-4 space-y-1">
        {home.tasks.map((task) => (
          <li key={task.key}>
            <TaskRow task={task} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function TaskRow({ task }: { task: HomeData['tasks'][number] }) {
  const inner = (
    <span
      className={cn(
        'flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors',
        task.href && !task.done && 'hover:bg-bg-sunken',
      )}
    >
      <span
        className={cn(
          'grid size-6 shrink-0 place-items-center rounded-full border-2 transition-colors',
          task.done ? 'border-success bg-success text-white' : 'border-border-strong text-transparent',
        )}
        aria-hidden
      >
        {task.done && <AnimatedCheck size={14} />}
      </span>
      <span
        className={cn(
          'flex-1 text-sm font-semibold',
          task.done ? 'text-fg-muted line-through decoration-fg-subtle/50' : 'text-fg',
        )}
      >
        {task.label}
      </span>
      <span
        className={cn(
          'text-xs font-bold tabular-nums',
          task.done ? 'text-success' : 'text-fg-subtle',
        )}
      >
        {task.done ? '✓' : `+${task.points}`}
      </span>
      <span className="sr-only">{task.done ? 'completed' : 'not yet done'}</span>
    </span>
  );

  if (task.href && !task.done) {
    return (
      <Link href={task.href} className="tap block">
        {inner}
      </Link>
    );
  }
  return inner;
}

function QuickStat({
  label,
  value,
  sub,
  tone,
  href,
  prefix,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: 'pulse' | 'flame' | 'iris' | 'neutral';
  href: string;
  prefix?: React.ReactNode;
}) {
  const accents = {
    pulse: 'text-pulse-700 dark:text-pulse-300',
    flame: 'text-flame-600 dark:text-flame-300',
    iris: 'text-iris-600 dark:text-iris-300',
    neutral: 'text-fg',
  };

  return (
    <Link href={href} className="tap">
      <Card interactive className="h-full p-4">
        <p className="text-2xs leading-tight font-bold tracking-[0.1em] text-fg-subtle uppercase">
          {label}
        </p>
        <p className={cn('mt-2 flex items-center gap-1.5 text-xl font-extrabold', accents[tone])}>
          {prefix}
          {value}
        </p>
        {sub && <p className="text-xs text-fg-subtle">{sub}</p>}
      </Card>
    </Link>
  );
}

function CohortPulseCard({ pulse, cohortName }: { pulse: Pulse; cohortName: string }) {
  const turnout = pulse.size === 0 ? 0 : Math.round((pulse.showedUpToday / pulse.size) * 100);
  const met = turnout >= pulse.thresholdPct;

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xs font-bold tracking-[0.14em] text-fg-subtle uppercase">
            {cohortName}
          </h2>
          <p className="mt-2 text-lg font-extrabold text-fg">
            {pulse.showedUpToday}/{pulse.size} showed up today
          </p>
        </div>
        <div className="flex items-center gap-1.5 rounded-pill bg-flame-500/12 px-3 py-1.5">
          <StreakFlame streak={pulse.cohortStreak} size="sm" />
          <span className="text-sm font-bold text-flame-600 dark:text-flame-300">
            {pulse.cohortStreak}
          </span>
        </div>
      </div>

      <ProgressBar value={turnout} tone={met ? 'success' : 'flame'} className="mt-3.5" label="Cohort turnout today" />

      <p className="mt-2.5 text-sm text-fg-muted">
        {met
          ? `The cohort has cleared its ${pulse.thresholdPct}% target today. Group streak is safe.`
          : `${pulse.thresholdPct}% needs to show up to keep the cohort streak. Currently ${turnout}%.`}
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4">
        <div>
          <dt className="text-2xs font-bold tracking-[0.1em] text-fg-subtle uppercase">
            Weekly consistency
          </dt>
          <dd className="mt-1 text-base font-extrabold text-fg">{pulse.weeklyConsistency}%</dd>
        </div>
        <div>
          <dt className="text-2xs font-bold tracking-[0.1em] text-fg-subtle uppercase">
            Total study time
          </dt>
          <dd className="mt-1 text-base font-extrabold text-fg">
            {formatHours(pulse.totalStudyMinutes)}
          </dd>
        </div>
      </dl>
    </Card>
  );
}

const EVENT_EMOJI: Record<string, string> = {
  workshop: '🛠️',
  guest_session: '🎤',
  weekly_review: '📋',
  assessment: '📝',
  study_room: '📻',
  other: '📌',
};

function UpcomingEvent({ event }: { event: HomeData['upcoming'][number] }) {
  const label = new Date(`${event.date}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

  return (
    <Card className="flex items-center gap-3.5 p-4">
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-bg-sunken text-xl" aria-hidden>
        {EVENT_EMOJI[event.type] ?? '📌'}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold text-fg">{event.title}</p>
        <p className="flex items-center gap-1.5 text-sm text-fg-muted">
          <CalendarDays className="size-3.5" aria-hidden />
          {label} • {event.startTime}
        </p>
      </div>
      {event.meetUrl && (
        <LinkButton href={event.meetUrl} external variant="outline" size="sm">
          Join
        </LinkButton>
      )}
    </Card>
  );
}
