import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { Card, CardHeader } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { requireOnboardedUser } from '@/lib/auth/guards';
import { BEHAVIOUR_EVENTS, POINT_EVENT_LABELS, maxDailyBehaviourPoints } from '@/lib/domain/points';
import { getMemberContext } from '@/server/context';
import { STUDENT_HOME } from '@/lib/routes';

export const metadata: Metadata = { title: 'How points work' };
export const dynamic = 'force-dynamic';

export default async function HowPointsWorkPage() {
  const user = await requireOnboardedUser();
  const ctx = await getMemberContext(user);
  if (!ctx) redirect('/admin');

  const { rules, cohort } = ctx;
  const max = maxDailyBehaviourPoints(rules);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link
        href={STUDENT_HOME}
        className="tap text-fg-muted hover:text-fg inline-flex items-center gap-1.5 rounded-lg px-1 py-2 text-sm font-semibold transition-colors"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back
      </Link>

      <PageHeader
        eyebrow="The rules, in full"
        title="How points work"
        description="Daily Rounds rewards the process, not the result. Every point below is earned by doing something — not by being right."
      />

      <Card>
        <CardHeader
          title="Your day"
          description={`${max} points are available every study day from behaviour alone.`}
        />
        <ul className="divide-border divide-y">
          {BEHAVIOUR_EVENTS.map((event) => (
            <li key={event} className="flex items-center justify-between gap-3 px-5 py-3">
              <span className="text-fg text-sm font-medium">{POINT_EVENT_LABELS[event]}</span>
              <span className="text-pulse-700 dark:text-pulse-400 text-sm font-extrabold tabular-nums">
                +{rules[event]}
              </span>
            </li>
          ))}
          <li className="flex items-center justify-between gap-3 px-5 py-3">
            <span className="text-fg text-sm font-medium">
              {POINT_EVENT_LABELS.live_session_late} (partial credit)
            </span>
            <span className="text-warning text-sm font-extrabold tabular-nums">
              +{rules.live_session_late}
            </span>
          </li>
        </ul>
      </Card>

      <Card>
        <CardHeader title="Bonuses" description="Occasional, and deliberately secondary." />
        <ul className="divide-border divide-y">
          <Bonus label="Weekly review" value={`+${rules.weekly_review}`} />
          <Bonus
            label="Knowledge check"
            value={`+${rules.quiz_attempt} to +${rules.quiz_attempt + rules.quiz_bonus}`}
          />
          <Bonus label="Streak milestone" value="+10 to +100" />
          <Bonus label="Achievement unlocked" value="+10 to +50" />
        </ul>
      </Card>

      <Card padding="lg">
        <h2 className="text-fg text-base font-bold">Why quiz scores barely matter</h2>
        <p className="text-fg-muted mt-2 text-sm leading-relaxed">
          A perfect quiz is worth {rules.quiz_attempt + rules.quiz_bonus} points. Turning up and
          finishing your study block is worth{' '}
          {rules.live_session_present + rules.study_block_completed}. Consistency is measured only
          from the behaviours in the first table — quiz, streak, achievement and admin points are
          excluded from it entirely. Someone who studies occasionally but aces every quiz will
          always rank below someone who shows up every day.
        </p>
      </Card>

      <Card padding="lg">
        <h2 className="text-fg text-base font-bold">How consistency is calculated</h2>
        <p className="text-fg-muted mt-2 text-sm leading-relaxed">
          For each active study day we work out how much of the day you completed, as a fraction of
          the {max} behaviour points available. Consistency is the average of those fractions across
          every active study day since you joined.
        </p>
        <p className="text-fg-muted mt-3 text-sm leading-relaxed">
          Active study days are{' '}
          {cohort.activeWeekdays
            .map((d) => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][d - 1])
            .join(', ')}
          , excluding cohort holidays. Weekends and holidays are never counted, so they cannot
          dilute your numbers or break your streak.
        </p>
      </Card>

      <Card padding="lg">
        <h2 className="text-fg text-base font-bold">Streaks</h2>
        <p className="text-fg-muted mt-2 text-sm leading-relaxed">
          Your streak counts consecutive <em>active study days</em> on which you showed up. Friday
          and the following Monday are consecutive. A holiday in the middle of the week is skipped,
          not forgiven. Missing an active study day breaks the streak — but the points you already
          earned are never removed, and coming back the next day is itself recognised.
        </p>
      </Card>

      <Card padding="lg">
        <h2 className="text-fg text-base font-bold">Corrections</h2>
        <p className="text-fg-muted mt-2 text-sm leading-relaxed">
          Points live in an append-only ledger. If your cohort lead ever corrects something, it is
          recorded as a new, signed entry with a reason — nothing is quietly rewritten. You can read
          your whole ledger from the Progress screen.
        </p>
      </Card>
    </div>
  );
}

function Bonus({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-center justify-between gap-3 px-5 py-3">
      <span className="text-fg text-sm font-medium">{label}</span>
      <span className="text-iris-600 dark:text-iris-300 text-sm font-extrabold tabular-nums">
        {value}
      </span>
    </li>
  );
}
