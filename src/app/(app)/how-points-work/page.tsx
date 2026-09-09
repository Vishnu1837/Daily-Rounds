import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, Check, Flame, Info, Scale, Sparkles, TrendingUp } from 'lucide-react';

import { LevelBadge, XPBar } from '@/components/gamification/level';
import { PointEventIcon } from '@/components/gamification/point-icon';
import { Card, CardAurora, CardHeader, SectionTitle } from '@/components/ui/card';
import { AnimatedCounter } from '@/components/ui/counter';
import { PageHeader } from '@/components/ui/page-header';
import { ProgressBar, ProgressRing } from '@/components/ui/progress';
import { Reveal } from '@/components/ui/reveal';
import type { PointEvent } from '@/db/schema';
import { requireOnboardedUser } from '@/lib/auth/guards';
import { levelFromPoints } from '@/lib/domain/level';
import { BEHAVIOUR_EVENTS, POINT_EVENT_LABELS, maxDailyBehaviourPoints } from '@/lib/domain/points';
import { STREAK_MILESTONES, milestoneBonusPoints } from '@/lib/domain/streak';
import { STUDENT_HOME } from '@/lib/routes';
import { SITE } from '@/lib/site';
import { getMemberContext } from '@/server/context';
import { getPointsExplainer } from '@/server/queries/student';

export const metadata: Metadata = { title: 'How XP works' };

const WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * The XP screen.
 *
 * Two things at once, in this order. First: *what you earned today, and when* — the ledger
 * read back to the student as their own morning, with what is still on the table beneath
 * it. Second: the rules that produced it.
 *
 * That order is the whole design. A rules page reached from a number the student did not
 * understand should start by explaining that number, not by explaining points in general;
 * the general case is what they read once they trust the specific one.
 */
export default async function HowPointsWorkPage() {
  const user = await requireOnboardedUser();
  const ctx = await getMemberContext(user);
  if (!ctx) redirect('/admin');

  const { rules, expected, cohort } = ctx;
  const data = await getPointsExplainer(ctx);
  const level = levelFromPoints(data.totalPoints);
  const max = maxDailyBehaviourPoints(rules, expected);
  const behaviourPct = max === 0 ? 0 : Math.round((data.behaviourToday / max) * 100);

  const dayLabel = new Date(`${data.today}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });

  const bonusToday = data.todayPoints - data.behaviourToday;
  const heaviest = Math.max(...expected.map((e) => rules[e]), 1);
  const peakDay = Math.max(...data.recentDays.map((d) => d.points), 1);

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-4">
      <Link
        href={STUDENT_HOME}
        className="tap text-fg-muted hover:text-fg inline-flex items-center gap-1.5 rounded-lg px-1 py-2 text-sm font-semibold transition-colors"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back
      </Link>

      <PageHeader
        eyebrow="Your XP, explained"
        title="How XP works"
        description={`${SITE.name} pays you for the process, not the result. Every point below was earned by doing something — not by being right.`}
      />

      {/* ------------------------------------------------------------ standing */}
      <Reveal>
        <Card variant="solid" tone="pulse" padding="lg" className="overflow-hidden" glow>
          <CardAurora tone="iris" />
          <div className="relative flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
            <div>
              <p className="text-2xs font-bold tracking-[0.14em] text-white/60 uppercase">
                Total XP
              </p>
              <p className="stat-num mt-1 text-4xl text-white sm:text-5xl">
                <AnimatedCounter value={data.totalPoints} duration={1100} />
              </p>
              <p className="mt-2 text-sm font-medium text-white/75">
                Level {level.level} · {level.rank.title}
                {data.streak > 0 && (
                  <span className="ml-2 inline-flex items-center gap-1 align-middle">
                    <Flame className="size-3.5" aria-hidden />
                    {data.streak}-day streak
                  </span>
                )}
              </p>
            </div>
            <ProgressRing
              value={behaviourPct}
              size={104}
              stroke={9}
              tone="citrus"
              trackClassName="stroke-white/20"
              label={`${behaviourPct}% of today's behaviour XP earned`}
            >
              <span className="text-center">
                <span className="stat-num block text-xl text-white">{data.behaviourToday}</span>
                <span className="text-2xs font-bold text-white/60">of {max} today</span>
              </span>
            </ProgressRing>
          </div>
          <div className="relative mt-5 border-t border-white/15 pt-4">
            <XPBar info={level} className="[&_.eyebrow]:text-white/60" />
          </div>
        </Card>
      </Reveal>

      {/* --------------------------------------------------------------- today */}
      <SectionTitle>Today</SectionTitle>

      <Reveal delay={1}>
        <Card>
          <CardHeader
            title={dayLabel}
            description={
              data.earnedToday.length === 0
                ? data.isHolidayToday
                  ? 'A cohort holiday. Nothing is expected of you today, and nothing counts against you.'
                  : !data.isActiveDay
                    ? 'A rest day. Nothing counts against you — anything you earn today is a bonus.'
                    : 'Nothing earned yet today. Everything below is still on the table.'
                : `${data.todayPoints} XP so far, from ${data.earnedToday.length} ${
                    data.earnedToday.length === 1 ? 'action' : 'actions'
                  }. Times are ${data.timezoneLabel}.`
            }
            action={
              data.todayPoints > 0 ? (
                <span className="stat-num text-citrus-700 dark:text-citrus-300 text-2xl">
                  +<AnimatedCounter value={data.todayPoints} />
                </span>
              ) : null
            }
          />

          {data.earnedToday.length > 0 && (
            <ol className="mt-4">
              {data.earnedToday.map((entry, i) => (
                <li
                  key={`${entry.event}-${entry.at}-${i}`}
                  className="animate-step-in border-border flex items-center gap-3 border-t px-5 py-3"
                  style={{ animationDelay: `${Math.min(i * 70, 500)}ms` }}
                >
                  <PointEventIcon event={entry.event} />
                  <span className="min-w-0 flex-1">
                    <span className="text-fg block text-sm font-semibold">
                      {POINT_EVENT_LABELS[entry.event]}
                    </span>
                    <span className="text-fg-subtle block truncate text-xs font-medium">
                      {entry.at}
                      {entry.reason ? ` · ${entry.reason}` : ''}
                    </span>
                  </span>
                  <span
                    className={
                      entry.points < 0
                        ? 'text-danger text-sm font-extrabold tabular-nums'
                        : 'text-pulse-700 dark:text-pulse-400 text-sm font-extrabold tabular-nums'
                    }
                  >
                    {entry.points > 0 ? '+' : ''}
                    {entry.points}
                  </span>
                </li>
              ))}
            </ol>
          )}

          {data.remainingToday.length > 0 && (
            <div className="border-border mt-0 border-t px-5 py-4">
              <p className="eyebrow">
                Still available today · +{data.remainingToday.reduce((sum, r) => sum + r.points, 0)}{' '}
                XP
              </p>
              <ul className="mt-3 space-y-2.5">
                {data.remainingToday.map((r, i) => (
                  <li
                    key={r.event}
                    className="animate-rise flex items-center gap-3"
                    style={{ animationDelay: `${Math.min(i * 60, 360)}ms` }}
                  >
                    <PointEventIcon event={r.event} size="sm" muted />
                    <span className="text-fg-muted flex-1 text-sm font-medium">
                      {POINT_EVENT_LABELS[r.event]}
                    </span>
                    <span className="text-fg-subtle text-sm font-bold tabular-nums">
                      +{r.points}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.remainingToday.length === 0 && data.isActiveDay && (
            <div className="border-border text-success-strong flex items-center gap-2 border-t px-5 py-4 text-sm font-semibold">
              <Check className="size-4" aria-hidden />
              Every behaviour for today is done. A perfect day.
            </div>
          )}

          {bonusToday > 0 && (
            <p className="text-fg-subtle border-border border-t px-5 py-3 text-xs font-medium">
              {bonusToday} of today&rsquo;s XP came from bonuses, which sit outside the {max}-point
              daily maximum and outside consistency.
            </p>
          )}
        </Card>
      </Reveal>

      {/* ------------------------------------------------------------ last days */}
      <Reveal delay={2}>
        <Card padding="lg">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-fg text-base font-bold">The last fortnight</h2>
            <span className="text-fg-subtle text-xs font-semibold">XP per day</span>
          </div>
          <div className="mt-4 flex h-24 items-end gap-1.5">
            {data.recentDays.map((day, i) => {
              const pct = Math.max(day.points > 0 ? 6 : 2, (day.points / peakDay) * 100);
              const isToday = day.date === data.today;
              return (
                <span
                  key={day.date}
                  className="group flex h-full flex-1 flex-col justify-end"
                  title={`${day.date} · ${day.points} XP`}
                >
                  <span
                    className={[
                      'animate-rise w-full rounded-t-md',
                      day.points === 0
                        ? 'bg-bg-inset'
                        : isToday
                          ? 'from-citrus-500 to-citrus-300 bg-linear-to-t'
                          : day.isActiveDay
                            ? 'from-pulse-600 to-pulse-400 bg-linear-to-t'
                            : 'from-iris-500 to-iris-300 bg-linear-to-t',
                    ].join(' ')}
                    style={{ height: `${pct}%`, animationDelay: `${Math.min(i * 40, 520)}ms` }}
                  />
                </span>
              );
            })}
          </div>
          <div className="text-2xs text-fg-subtle mt-2 flex justify-between font-semibold">
            <span>{data.recentDays[0]?.date.slice(5)}</span>
            <span>Today</span>
          </div>
        </Card>
      </Reveal>

      {/* --------------------------------------------------------------- rules */}
      <SectionTitle>The rules</SectionTitle>

      <Reveal delay={3}>
        <Card>
          <CardHeader
            title="Your day"
            description={`${max} XP are available every study day from behaviour alone. These ${expected.length} are the only things your consistency is measured from.`}
          />
          <ul className="mt-3">
            {expected.map((event, i) => (
              <li key={event} className="border-border flex items-center gap-3 border-t px-5 py-3">
                <PointEventIcon event={event} />
                <span className="min-w-0 flex-1">
                  <span className="text-fg block text-sm font-semibold">
                    {POINT_EVENT_LABELS[event]}
                  </span>
                  <ProgressBar
                    value={(rules[event] / heaviest) * 100}
                    tone="pulse"
                    height="xs"
                    className="mt-1.5 max-w-40"
                    label={`${POINT_EVENT_LABELS[event]}: ${rules[event]} XP`}
                  />
                </span>
                <span className="text-pulse-700 dark:text-pulse-400 text-sm font-extrabold tabular-nums">
                  +{rules[event]}
                </span>
                <span className="sr-only">{i + 1}</span>
              </li>
            ))}
            {/* Only meaningful where there is a room to arrive late to. */}
            {expected.includes('live_session_present') && (
              <li className="border-border flex items-center gap-3 border-t px-5 py-3">
                <PointEventIcon event="live_session_late" />
                <span className="min-w-0 flex-1">
                  <span className="text-fg block text-sm font-semibold">
                    {POINT_EVENT_LABELS.live_session_late}
                  </span>
                  <span className="text-fg-subtle block text-xs font-medium">
                    Partial credit — it fills the same slot as arriving on time, for less.
                  </span>
                </span>
                <span className="text-flame-700 dark:text-flame-300 text-sm font-extrabold tabular-nums">
                  +{rules.live_session_late}
                </span>
              </li>
            )}
          </ul>
        </Card>
      </Reveal>

      <Reveal delay={4}>
        <Card>
          <CardHeader
            title="Bonuses"
            icon={<Sparkles className="text-iris-600 dark:text-iris-300 size-4" aria-hidden />}
            description="Occasional, and deliberately secondary. None of these count toward consistency."
          />
          <ul className="mt-3">
            <BonusRow
              event="weekly_review"
              detail="Once a week, for looking back at it honestly."
              value={`+${rules.weekly_review}`}
            />
            <BonusRow
              event="quiz_attempt"
              detail={`+${rules.quiz_attempt} for attempting, up to +${rules.quiz_bonus} more for accuracy.`}
              value={`+${rules.quiz_attempt}–${rules.quiz_attempt + rules.quiz_bonus}`}
            />
            <BonusRow
              event="streak_bonus"
              detail={`Paid once at ${STREAK_MILESTONES.join(', ')} consecutive study days.`}
              value={`+${milestoneBonusPoints(STREAK_MILESTONES[0]!)}–${milestoneBonusPoints(
                STREAK_MILESTONES[STREAK_MILESTONES.length - 1]!,
              )}`}
            />
            <BonusRow
              event="achievement"
              detail="Bronze, silver and gold badges, each paid once."
              value="+10–50"
            />
          </ul>
          {data.nextMilestone !== null && (
            <p className="border-border text-fg-muted border-t px-5 py-3 text-sm">
              You are on {data.streak}. The next milestone is{' '}
              <strong className="text-fg">{data.nextMilestone} days</strong>, worth{' '}
              <strong className="text-fg">+{milestoneBonusPoints(data.nextMilestone)} XP</strong>.
            </p>
          )}
        </Card>
      </Reveal>

      {/* ------------------------------------------------------- where it came from */}
      {data.lifetimeByEvent.length > 0 && (
        <Reveal delay={5}>
          <Card>
            <CardHeader
              title="Where your XP has come from"
              icon={
                <TrendingUp className="text-pulse-600 dark:text-pulse-300 size-4" aria-hidden />
              }
              description="Every point you have earned since you joined, by what earned it."
            />
            <ul className="mt-3">
              {data.lifetimeByEvent.map((row) => (
                <li
                  key={row.event}
                  className="border-border flex items-center gap-3 border-t px-5 py-3"
                >
                  <PointEventIcon event={row.event} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="text-fg block text-sm font-medium">
                      {POINT_EVENT_LABELS[row.event]}
                    </span>
                    <ProgressBar
                      value={
                        data.totalPoints > 0 ? (Math.abs(row.points) / data.totalPoints) * 100 : 0
                      }
                      tone={row.points < 0 ? 'neutral' : 'citrus'}
                      height="xs"
                      className="mt-1.5"
                      label={`${POINT_EVENT_LABELS[row.event]}: ${row.points} XP`}
                    />
                  </span>
                  <span className="text-fg text-sm font-extrabold tabular-nums">
                    {row.points > 0 ? '+' : ''}
                    {row.points.toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </Reveal>
      )}

      {/* ------------------------------------------------------------ the why */}
      <SectionTitle>Why it is built this way</SectionTitle>

      <Reveal delay={6}>
        <Card variant="wash" tone="iris" padding="lg">
          <h2 className="text-fg flex items-center gap-2 text-base font-bold">
            <Info className="text-iris-600 dark:text-iris-300 size-4" aria-hidden />
            Why quiz scores barely matter
          </h2>
          <p className="text-fg-muted mt-2 text-sm leading-relaxed">
            A perfect quiz is worth {rules.quiz_attempt + rules.quiz_bonus} XP. Turning up and
            finishing your study block is worth{' '}
            {rules.live_session_present + rules.study_block_completed}. Consistency is measured only
            from the six behaviours above — quiz, streak, achievement and admin points are excluded
            from it entirely. Someone who studies occasionally but aces every quiz will always rank
            below someone who shows up every day.
          </p>
        </Card>
      </Reveal>

      <Reveal delay={7}>
        <Card padding="lg">
          <h2 className="text-fg text-base font-bold">How consistency is calculated</h2>
          <p className="text-fg-muted mt-2 text-sm leading-relaxed">
            For each active study day we work out how much of the day you completed, as a fraction
            of the {max} behaviour XP available — today that fraction stands at{' '}
            <strong className="text-fg">{behaviourPct}%</strong>. Consistency is the average of
            those fractions across every active study day since you joined.
          </p>
          <p className="text-fg-muted mt-3 text-sm leading-relaxed">
            Active study days are{' '}
            {cohort.activeWeekdays.map((d) => WEEKDAY_NAMES[d - 1]).join(', ')}, excluding cohort
            holidays. Weekends and holidays are never counted, so they cannot dilute your numbers or
            break your streak.
          </p>
          <p className="text-fg-muted mt-3 text-sm leading-relaxed">
            Your day starts and ends at midnight in{' '}
            <strong className="text-fg">{data.timezoneLabel}</strong> — the timezone on your
            profile, not the cohort&rsquo;s. Change it there and every date in the app moves with
            you.
          </p>
        </Card>
      </Reveal>

      <Reveal delay={8}>
        <Card padding="lg">
          <h2 className="text-fg flex items-center gap-2 text-base font-bold">
            <Flame className="text-flame-600 dark:text-flame-300 size-4" aria-hidden />
            Streaks
          </h2>
          <p className="text-fg-muted mt-2 text-sm leading-relaxed">
            Your streak counts consecutive <em>active study days</em> on which you showed up. Friday
            and the following Monday are consecutive. A holiday in the middle of the week is
            skipped, not forgiven. Missing an active study day breaks the streak — but the XP you
            already earned is never removed, and coming back the next day is itself recognised.
          </p>
        </Card>
      </Reveal>

      <Reveal delay={9}>
        <Card padding="lg">
          <h2 className="text-fg flex items-center gap-2 text-base font-bold">
            <Scale className="text-fg-muted size-4" aria-hidden />
            Corrections
          </h2>
          <p className="text-fg-muted mt-2 text-sm leading-relaxed">
            XP lives in an append-only ledger. If your cohort lead ever corrects something, it is
            recorded as a new, signed entry with a reason — nothing is quietly rewritten. You can
            read your whole ledger from the{' '}
            <Link href="/progress" className="text-pulse-700 dark:text-pulse-300 underline">
              Progress screen
            </Link>
            .
          </p>
        </Card>
      </Reveal>
    </div>
  );
}

function BonusRow({ event, detail, value }: { event: PointEvent; detail: string; value: string }) {
  return (
    <li className="border-border flex items-center gap-3 border-t px-5 py-3">
      <PointEventIcon event={event} />
      <span className="min-w-0 flex-1">
        <span className="text-fg block text-sm font-semibold">{POINT_EVENT_LABELS[event]}</span>
        <span className="text-fg-subtle block text-xs font-medium">{detail}</span>
      </span>
      <span className="text-iris-600 dark:text-iris-300 text-sm font-extrabold tabular-nums">
        {value}
      </span>
    </li>
  );
}
