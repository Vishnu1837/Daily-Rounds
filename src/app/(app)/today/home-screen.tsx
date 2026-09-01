'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  CalendarDays,
  ChevronRight,
  Clock,
  Megaphone,
  Play,
  Target,
  Users,
  Video,
} from 'lucide-react';

import {
  AnimatedCheck,
  CelebrationModal,
  type CelebrationPayload,
} from '@/components/gamification/celebration';
import { LevelBadge, XPBar } from '@/components/gamification/level';
import { StreakFlame } from '@/components/gamification/streak-flame';
import { Badge, LiveDot } from '@/components/ui/badge';
import { Button, LinkButton } from '@/components/ui/button';
import { Card, CardAurora, SectionTitle } from '@/components/ui/card';
import { AnimatedCounter } from '@/components/ui/counter';
import { ProgressBar, ProgressRing, ProgressSegments } from '@/components/ui/progress';
import { Reveal } from '@/components/ui/reveal';
import { StatTile } from '@/components/ui/stat';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import { levelFromPoints } from '@/lib/domain/level';
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

/**
 * The dashboard.
 *
 * It answers four questions in a fixed order, and the layout enforces that order on every
 * screen size: what am I doing today, am I still on a run, what is left to tick off, and
 * where does that leave me. Everything else on the page is supporting material and is
 * visibly quieter than those four things.
 */
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
  const dayComplete = home.tasks.length > 0 && doneCount === home.tasks.length;
  const level = levelFromPoints(home.totalPoints);

  return (
    <div className="space-y-4 lg:space-y-5">
      <CelebrationModal payload={celebration} onClose={dismissCelebration} />

      {/* ------------------------------------------------------------ header */}
      <Reveal>
        <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 px-1">
          <div>
            <p className="text-fg-muted text-sm font-medium">
              {greeting()}, <span className="text-fg font-semibold">{firstName}</span>
            </p>
            <h1 className="text-fg mt-1 flex flex-wrap items-baseline gap-x-2.5 text-2xl font-extrabold tracking-tight sm:text-3xl">
              {home.weekdayLabel}
              <span className="text-fg-subtle text-base font-bold">
                Week {String(home.weekNumber).padStart(2, '0')}
              </span>
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {dayComplete ? (
              <Badge tone="success" solid icon={<AnimatedCheck size={13} />}>
                Day complete
              </Badge>
            ) : home.isActiveDay ? (
              <Badge tone="pulse">{home.tasks.length - doneCount} left today</Badge>
            ) : (
              <Badge tone="neutral">{home.isHolidayToday ? 'Cohort holiday' : 'Rest day'}</Badge>
            )}
          </div>
        </header>
      </Reveal>

      {/* ---------------------------------------------------------- comeback */}
      <AnimatePresence>
        {home.comeback.isComeback && !dayComplete && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
          >
            <ComebackBanner missed={home.comeback.missedDays.length} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ------------------------------------------------------------- bento */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
        <Reveal delay={1} className="lg:col-span-7">
          <TodayMission
            home={home}
            doneCount={doneCount}
            onCelebrate={setActionCelebration}
            level={level.level}
          />
        </Reveal>

        <Reveal delay={2} className="lg:col-span-5">
          <StreakCard
            streak={home.streak}
            best={home.bestStreak}
            next={home.nextMilestone}
            isActiveDay={home.isActiveDay}
            isHoliday={home.isHolidayToday}
            dayComplete={dayComplete}
          />
        </Reveal>

        <Reveal delay={3} className="lg:col-span-7">
          <TodayChecklist home={home} doneCount={doneCount} />
        </Reveal>

        <div className="flex flex-col gap-4 lg:col-span-5 lg:gap-5">
          <Reveal delay={4}>
            <LevelPanel
              level={level}
              todayPoints={home.todayPoints}
              rank={home.rank}
              cohortSize={home.cohortSize}
            />
          </Reveal>
          <Reveal delay={5}>
            <StudyRoomCard room={home.studyRoom} />
          </Reveal>
        </div>
      </div>

      {/* -------------------------------------------------------- quick stats */}
      <Reveal delay={6}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          <StatTile
            label="Weekly consistency"
            value={`${home.weeklyConsistency}%`}
            sub="active study days"
            tone="pulse"
            emphasis
            href="/progress"
            icon={<Target className="size-4" aria-hidden />}
          />
          <StatTile
            label="Roadmap"
            value={`${home.roadmapPct}%`}
            sub="topics complete"
            tone="iris"
            emphasis
            href="/roadmap"
            icon={<ChevronRight className="size-4" aria-hidden />}
          />
          <StatTile
            label="Study time"
            value={formatHours(pulse.totalStudyMinutes)}
            sub="cohort total"
            tone="neutral"
            emphasis
            href="/progress"
            icon={<Clock className="size-4" aria-hidden />}
          />
          <StatTile
            label="Leaderboard"
            value={home.rank ? `#${home.rank}` : '—'}
            sub={home.rank ? `of ${home.cohortSize} students` : 'ranked once you begin'}
            tone="flame"
            emphasis
            href="/leaderboard"
            icon={<Users className="size-4" aria-hidden />}
          />
        </div>
      </Reveal>

      {/* --------------------------------------------------- cohort + upcoming */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
        <Reveal delay={7} className="lg:col-span-7">
          <CohortPulseCard pulse={pulse} cohortName={cohortName} />
        </Reveal>

        <Reveal delay={8} className="lg:col-span-5">
          <UpcomingCard events={home.upcoming} />
        </Reveal>
      </div>

      {/* ------------------------------------------------------ announcement */}
      {home.announcement && (
        <Reveal delay={9}>
          <Card variant="wash" tone="iris" padding="md" className="flex items-start gap-4">
            <span
              className="bg-iris-500/15 text-iris-600 dark:text-iris-300 grid size-10 shrink-0 place-items-center rounded-xl"
              aria-hidden
            >
              <Megaphone className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="eyebrow">From your cohort lead</p>
              <h3 className="text-fg mt-1.5 font-bold">{home.announcement.title}</h3>
              <p className="text-fg-muted mt-1 text-sm leading-relaxed">{home.announcement.body}</p>
            </div>
          </Card>
        </Reveal>
      )}

      <p className="text-fg-subtle px-1 pt-1 pb-1 text-center text-xs">
        <Link href="/how-points-work" className="hover:text-fg-muted underline underline-offset-2">
          How points and consistency work
        </Link>
      </p>
    </div>
  );
}

/* ------------------------------------------------------------- subviews */

function ComebackBanner({ missed }: { missed: number }) {
  return (
    <Card variant="wash" tone="flame" padding="md" className="flex items-start gap-4">
      <span
        className="bg-flame-500/16 grid size-10 shrink-0 place-items-center rounded-xl text-xl"
        aria-hidden
      >
        💪
      </span>
      <div>
        <h2 className="text-fg font-bold">
          {missed === 1 ? 'Yesterday was missed.' : `You missed ${missed} study days.`} Today is
          your comeback.
        </h2>
        <p className="text-fg-muted mt-1 text-sm">
          The goal was never a perfect record — it&apos;s coming back quickly. Finish today and
          you&apos;re back on rounds.
        </p>
      </div>
    </Card>
  );
}

/**
 * The hero.
 *
 * The single loudest surface on the page, and the only one painted in a saturated gradient,
 * because there is exactly one thing a student is supposed to do when they open the app.
 * When the day is already done it drops to a calm confirmation rather than continuing to
 * shout — a card that keeps demanding action after the action is finished trains people to
 * ignore it.
 */
function TodayMission({
  home,
  doneCount,
  onCelebrate,
  level,
}: {
  home: HomeData;
  doneCount: number;
  onCelebrate: (p: CelebrationPayload) => void;
  level: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const blockDone = home.tasks.find((t) => t.key === 'study_block_completed')?.done ?? false;
  const targetDone = home.tasks.find((t) => t.key === 'daily_target_completed')?.done ?? false;
  const pct = home.tasks.length === 0 ? 0 : (doneCount / home.tasks.length) * 100;
  const running = home.session?.status === 'running';

  if (!home.isActiveDay) {
    return (
      <Card variant="wash" tone="iris" padding="lg" className="h-full overflow-hidden">
        <CardAurora tone="iris" />
        <div className="relative">
          <p className="eyebrow">{home.isHolidayToday ? 'Cohort holiday' : 'Rest day'}</p>
          <h2 className="text-fg mt-3 text-2xl font-extrabold text-balance">
            {home.isHolidayToday ? 'The cohort is off today.' : 'No study day scheduled.'}
          </h2>
          <p className="text-fg-muted mt-2 max-w-md text-sm">
            Your streak is completely safe — rest days and holidays never count against you. If you
            feel like getting ahead, your roadmap is right there.
          </p>
          <LinkButton href="/roadmap" variant="outline" size="lg" className="mt-6">
            Open roadmap
            <ArrowRight className="size-4" aria-hidden />
          </LinkButton>
        </div>
      </Card>
    );
  }

  return (
    <Card
      variant="solid"
      tone="pulse"
      padding="lg"
      glow
      className="h-full overflow-hidden text-white"
    >
      <CardAurora tone="pulse" />

      <div className="relative flex h-full flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-2xs font-bold tracking-[0.16em] text-white/65 uppercase">
              {home.assignment?.subjectName ?? "Today's focus"}
            </p>
            <h2 className="mt-2 text-2xl leading-tight font-extrabold text-balance sm:text-3xl">
              {home.assignment?.topicTitle ?? 'No topic assigned yet'}
            </h2>
            {home.assignment?.topicTitle ? (
              <div className="mt-3.5 flex flex-wrap items-center gap-2">
                <span className="rounded-pill inline-flex items-center gap-1.5 bg-white/14 px-3 py-1 text-xs font-bold ring-1 ring-white/20 ring-inset">
                  <Clock className="size-3.5" aria-hidden />
                  {home.assignment.plannedMinutes} min planned
                </span>
                {running && (
                  <span className="rounded-pill inline-flex items-center gap-1.5 bg-white/14 px-3 py-1 text-xs font-bold ring-1 ring-white/20 ring-inset">
                    <span
                      className="bg-citrus-300 size-1.5 animate-pulse rounded-full"
                      aria-hidden
                    />
                    Session running
                  </span>
                )}
              </div>
            ) : (
              <p className="mt-3 max-w-md text-sm text-white/75">
                Your cohort lead hasn&apos;t set today&apos;s topic. Pick the next one from your
                roadmap and start anyway — showing up is what counts.
              </p>
            )}
            {home.assignment?.note && (
              <p className="mt-3 max-w-md text-sm text-white/70 italic">{home.assignment.note}</p>
            )}
          </div>

          <ProgressRing
            value={pct}
            size={84}
            stroke={9}
            tone="citrus"
            trackClassName="stroke-white/20"
            label="Today's completion"
            className="hidden shrink-0 sm:inline-grid"
          >
            <span className="stat-num text-base text-white">{Math.round(pct)}%</span>
          </ProgressRing>
        </div>

        {/* ---------------------------------------------------------- actions */}
        <div className="mt-7 space-y-2.5">
          {blockDone && targetDone ? (
            <div className="rounded-panel flex items-center gap-3 bg-white/12 p-4 ring-1 ring-white/20 ring-inset">
              <span className="text-pulse-700 grid size-9 shrink-0 place-items-center rounded-full bg-white/90">
                <AnimatedCheck size={20} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold">Today&apos;s work is done.</p>
                <p className="text-xs text-white/70">
                  {home.checkedIn
                    ? 'Check-in submitted too. Excellent day.'
                    : 'One thing left: your check-in.'}
                </p>
              </div>
              {!home.checkedIn && (
                <LinkButton href="/check-in" variant="inverse" size="sm" className="ml-auto">
                  Check in
                </LinkButton>
              )}
            </div>
          ) : (
            <LinkButton href="/study" variant="inverse" size="xl" fullWidth>
              <Play className="size-5 fill-current" aria-hidden />
              {running
                ? 'Back to your session'
                : blockDone
                  ? 'Start another block'
                  : 'Start studying'}
            </LinkButton>
          )}

          {blockDone && !targetDone && (
            <Button
              variant="inverse-soft"
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
                  const after = levelFromPoints(home.totalPoints + result.data.pointsAwarded);
                  onCelebrate(
                    after.level > level
                      ? {
                          kind: 'level_up',
                          title: `Level ${after.level}`,
                          message: "Today's topic is locked in, and it took you up a level.",
                          emoji: '🎖️',
                          rank: after.rank.title,
                          points: result.data.pointsAwarded,
                          streak: result.data.streak,
                        }
                      : {
                          kind: 'day_complete',
                          title: 'Target complete',
                          message:
                            "That's today's topic locked in. Your roadmap just moved forward.",
                          emoji: '🎯',
                          points: result.data.pointsAwarded,
                          streak: result.data.streak,
                        },
                  );
                  router.refresh();
                })
              }
            >
              Mark today&apos;s target complete
            </Button>
          )}

          {!home.checkedIn && !(blockDone && targetDone) && (
            <LinkButton href="/check-in" variant="inverse-ghost" size="md" fullWidth>
              Skip to check-in
            </LinkButton>
          )}
        </div>
      </div>
    </Card>
  );
}

function StreakCard({
  streak,
  best,
  next,
  isActiveDay,
  isHoliday,
  dayComplete,
}: {
  streak: number;
  best: number;
  next: number | null;
  isActiveDay: boolean;
  isHoliday: boolean;
  dayComplete: boolean;
}) {
  const toNext = next ? next - streak : 0;

  return (
    <Card variant="wash" tone="flame" padding="lg" className="h-full overflow-hidden">
      <CardAurora tone="flame" />
      <div className="relative flex h-full flex-col">
        <div className="flex items-start justify-between gap-3">
          <p className="eyebrow">Current streak</p>
          {streak > 0 && streak >= best && best > 0 && (
            <Badge tone="flame" size="sm">
              Personal best
            </Badge>
          )}
        </div>

        <div className="mt-4 flex items-center gap-4">
          <StreakFlame streak={streak} size="xl" />
          <div className="min-w-0">
            <p className="stat-num text-stat text-flame-700 dark:text-flame-300">
              <AnimatedCounter value={streak} />
            </p>
            <p className="text-fg-muted mt-0.5 text-sm font-semibold">
              {streak === 1 ? 'study day' : 'study days'} in a row
            </p>
          </div>
        </div>

        <p className="text-fg-muted mt-4 text-sm">
          {streak === 0
            ? isHoliday
              ? 'Cohort holiday — your streak is safe.'
              : !isActiveDay
                ? 'Rest day. Weekends never break a streak.'
                : 'Complete today to start your streak.'
            : dayComplete
              ? `Today is banked. Best run so far: ${best} days.`
              : next
                ? `${toNext} more ${toNext === 1 ? 'day' : 'days'} to your ${next}-day milestone.`
                : `Personal best: ${best} days.`}
        </p>

        {next && streak > 0 && (
          <div className="mt-auto pt-5">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="eyebrow">Next milestone</span>
              <span className="text-2xs text-flame-700 dark:text-flame-300 font-bold tabular-nums">
                {streak}/{next}
              </span>
            </div>
            <ProgressBar
              value={(streak / next) * 100}
              tone="flame"
              label={`Progress to ${next}-day streak`}
            />
          </div>
        )}
      </div>
    </Card>
  );
}

function TodayChecklist({ home, doneCount }: { home: HomeData; doneCount: number }) {
  return (
    <Card padding="lg" className="h-full">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Today&apos;s checklist</p>
          <p className="mt-2 flex items-baseline gap-2">
            <span className="stat-num text-stat-sm text-fg">
              <AnimatedCounter value={home.todayPoints} />
            </span>
            <span className="text-fg-muted text-sm font-bold">
              / {home.maxDailyPoints} XP today
            </span>
          </p>
        </div>
        <div className="text-right">
          <p className="stat-num text-fg text-xl">
            {doneCount}
            <span className="text-fg-subtle">/{home.tasks.length}</span>
          </p>
          <p className="eyebrow">done</p>
        </div>
      </div>

      <ProgressSegments
        total={home.tasks.length}
        filled={doneCount}
        tone="pulse"
        className="mt-4"
        label="Today's tasks"
      />

      <ul className="mt-5 space-y-1">
        {home.tasks.map((task, i) => (
          <li key={task.key}>
            <TaskRow task={task} index={i} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function TaskRow({ task, index }: { task: HomeData['tasks'][number]; index: number }) {
  const inner = (
    <span
      className={cn(
        'group rounded-field flex items-center gap-3 px-2.5 py-3 transition-colors duration-150',
        task.href && !task.done && 'hover:bg-bg-sunken',
      )}
    >
      <span
        className={cn(
          'grid size-6.5 shrink-0 place-items-center rounded-full border-2 transition-all duration-200',
          task.done
            ? 'from-success to-success-strong border-transparent bg-linear-to-br text-white'
            : 'border-border-strong group-hover:border-pulse-400 text-transparent',
        )}
        aria-hidden
      >
        {task.done && <AnimatedCheck size={14} />}
      </span>

      <span
        className={cn(
          'flex-1 text-sm font-semibold transition-colors',
          task.done ? 'text-fg-subtle decoration-fg-subtle/50 line-through' : 'text-fg',
        )}
      >
        {task.label}
      </span>

      <span
        className={cn(
          'rounded-pill text-2xs px-2 py-0.5 font-bold tabular-nums transition-colors',
          task.done
            ? 'bg-success/12 text-success-strong dark:text-success'
            : 'bg-citrus-500/16 text-citrus-700 dark:text-citrus-300',
        )}
      >
        {task.done ? 'earned' : `+${task.points}`}
      </span>

      {task.href && !task.done && (
        <ChevronRight
          className="text-fg-subtle size-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
          aria-hidden
        />
      )}
      <span className="sr-only">{task.done ? 'completed' : 'not yet done'}</span>
    </span>
  );

  if (task.href && !task.done) {
    return (
      <Link href={task.href} className="tap block" style={{ animationDelay: `${index * 40}ms` }}>
        {inner}
      </Link>
    );
  }
  return inner;
}

function LevelPanel({
  level,
  todayPoints,
  rank,
  cohortSize,
}: {
  level: ReturnType<typeof levelFromPoints>;
  todayPoints: number;
  rank: number | null;
  cohortSize: number;
}) {
  return (
    <Card padding="lg">
      <div className="flex items-start justify-between gap-3">
        <LevelBadge info={level} size="lg" />
        {todayPoints > 0 && (
          <Badge tone="citrus" size="sm">
            +{todayPoints} today
          </Badge>
        )}
      </div>

      <XPBar info={level} className="mt-5" />

      <div className="border-border mt-5 grid grid-cols-2 gap-3 border-t pt-4">
        <div>
          <p className="eyebrow">Total XP</p>
          <p className="stat-num text-citrus-700 dark:text-citrus-300 mt-1 text-xl">
            <AnimatedCounter value={level.xp} />
          </p>
        </div>
        <div>
          <p className="eyebrow">Cohort rank</p>
          <p className="stat-num text-fg mt-1 text-xl">
            {rank ? `#${rank}` : '—'}
            {rank && <span className="text-fg-subtle ml-1 text-sm font-bold">/{cohortSize}</span>}
          </p>
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
    <Card padding="lg">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <LiveDot label="Live study room" />
          <p className="text-fg mt-3 text-lg font-extrabold">Morning Study Room</p>
          <p className="text-fg-muted flex items-center gap-1.5 text-sm">
            <Clock className="size-3.5" aria-hidden />
            {room.startTime} – {room.endTime}
          </p>
        </div>
        {attendedLabel && (
          <Badge
            tone={
              room.attended === 'absent'
                ? 'danger'
                : room.attended === 'late'
                  ? 'warning'
                  : 'success'
            }
          >
            {attendedLabel}
          </Badge>
        )}
      </div>

      {room.url ? (
        <LinkButton
          href={room.url}
          external
          variant="secondary"
          size="lg"
          fullWidth
          className="mt-5"
        >
          <Video className="size-[18px]" aria-hidden />
          Join Google Meet
        </LinkButton>
      ) : (
        <p className="surface-sunken text-fg-muted mt-5 p-3.5 text-sm">
          No meeting link has been set for the study room yet. Your cohort lead can add one from the
          admin settings.
        </p>
      )}
    </Card>
  );
}

function CohortPulseCard({ pulse, cohortName }: { pulse: Pulse; cohortName: string }) {
  const turnout = pulse.size === 0 ? 0 : Math.round((pulse.showedUpToday / pulse.size) * 100);
  const met = turnout >= pulse.thresholdPct;

  return (
    <Card padding="lg" className="h-full">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">{cohortName}</p>
          <p className="mt-2 flex items-baseline gap-2">
            <span className="stat-num text-stat-sm text-fg">
              {pulse.showedUpToday}
              <span className="text-fg-subtle">/{pulse.size}</span>
            </span>
            <span className="text-fg-muted text-sm font-semibold">showed up today</span>
          </p>
        </div>
        <div className="rounded-pill bg-flame-500/12 flex items-center gap-2 px-3 py-1.5">
          <StreakFlame streak={pulse.cohortStreak} size="sm" />
          <span className="text-flame-700 dark:text-flame-300 text-sm font-bold tabular-nums">
            {pulse.cohortStreak} day cohort streak
          </span>
        </div>
      </div>

      <ProgressBar
        value={turnout}
        tone={met ? 'success' : 'flame'}
        height="lg"
        className="mt-5"
        label="Cohort turnout today"
      />

      <p className="text-fg-muted mt-3 text-sm">
        {met
          ? `The cohort has cleared its ${pulse.thresholdPct}% target today. The group streak is safe.`
          : `${pulse.thresholdPct}% needs to show up to keep the cohort streak alive. Currently ${turnout}%.`}
      </p>

      <dl className="border-border mt-5 grid grid-cols-2 gap-3 border-t pt-4">
        <div>
          <dt className="eyebrow">Cohort consistency</dt>
          <dd className="stat-num text-fg mt-1 text-xl">{pulse.weeklyConsistency}%</dd>
        </div>
        <div>
          <dt className="eyebrow">Total study time</dt>
          <dd className="stat-num text-fg mt-1 text-xl">{formatHours(pulse.totalStudyMinutes)}</dd>
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

function UpcomingCard({ events }: { events: HomeData['upcoming'] }) {
  return (
    <Card padding="lg" className="h-full">
      <SectionTitle
        className="px-0"
        action={
          <Link
            href="/calendar"
            className="tap text-pulse-700 hover:text-pulse-500 dark:text-pulse-300 inline-flex items-center gap-1 text-sm font-semibold"
          >
            Calendar
            <ChevronRight className="size-3.5" aria-hidden />
          </Link>
        }
      >
        Coming up
      </SectionTitle>

      {events.length === 0 ? (
        <div className="rounded-panel border-border mt-5 flex flex-col items-center border border-dashed py-8 text-center">
          <CalendarDays className="text-fg-subtle size-6" aria-hidden />
          <p className="text-fg mt-3 text-sm font-semibold">Nothing scheduled</p>
          <p className="text-fg-muted mt-1 max-w-[16rem] text-xs">
            Workshops, reviews and guest sessions your cohort lead adds will appear here.
          </p>
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {events.map((event) => (
            <li key={event.id}>
              <UpcomingEvent event={event} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function UpcomingEvent({ event }: { event: HomeData['upcoming'][number] }) {
  const date = new Date(`${event.date}T12:00:00Z`);
  const weekday = date.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
  const dayNumber = date.toLocaleDateString('en-GB', { day: 'numeric', timeZone: 'UTC' });

  return (
    <div className="surface-sunken flex items-center gap-3.5 p-3">
      <div
        className="bg-bg-elevated grid size-11 shrink-0 place-items-center rounded-xl shadow-xs"
        aria-hidden
      >
        <span className="text-2xs text-fg-subtle leading-none font-bold uppercase">{weekday}</span>
        <span className="stat-num text-fg text-sm leading-tight">{dayNumber}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-fg truncate text-sm font-bold">
          <span className="mr-1.5" aria-hidden>
            {EVENT_EMOJI[event.type] ?? '📌'}
          </span>
          {event.title}
        </p>
        <p className="text-fg-muted text-xs">{event.startTime}</p>
      </div>
      {event.meetUrl && (
        <LinkButton href={event.meetUrl} external variant="outline" size="xs">
          Join
        </LinkButton>
      )}
    </div>
  );
}
