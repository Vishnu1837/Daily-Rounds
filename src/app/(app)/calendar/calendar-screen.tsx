'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { BAND_STYLE } from '@/components/charts/heatmap';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { ProgressBar } from '@/components/ui/progress';
import { Reveal } from '@/components/ui/reveal';
import { Sheet } from '@/components/ui/sheet';
import { cn } from '@/lib/cn';
import { isoWeekday } from '@/lib/domain/calendar';
import type { CalendarDay } from '@/server/queries/student';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const EVENT_EMOJI: Record<string, string> = {
  workshop: '🛠️',
  guest_session: '🎤',
  weekly_review: '📋',
  assessment: '📝',
  study_room: '📻',
  other: '📌',
};

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function CalendarScreen({
  days,
  month,
  today,
  cohortStart,
  cohortEnd,
}: {
  days: CalendarDay[];
  month: string;
  today: string;
  cohortStart: string;
  cohortEnd: string;
}) {
  const [selected, setSelected] = useState<CalendarDay | null>(null);

  const first = days[0];
  const leading = first ? isoWeekday(first.date) - 1 : 0;
  const monthLabel = new Date(`${month}-01T12:00:00Z`).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  const scored = days.filter((d) => d.isActiveDay && !d.isFuture);
  const showedUp = scored.filter((d) => d.showedUp).length;
  const pct = scored.length === 0 ? 0 : Math.round((showedUp / scored.length) * 100);
  const monthPoints = days.reduce((sum, d) => sum + d.points, 0);
  const monthMinutes = days.reduce((sum, d) => sum + d.studyMinutes, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Your record, day by day"
        title="Calendar"
        description="Tap any day to see what was planned and what actually happened."
        actions={
          <div className="rounded-pill border-border bg-bg-elevated flex items-center gap-1 border p-1">
            <Link
              href={`/calendar?month=${shiftMonth(month, -1)}`}
              aria-label="Previous month"
              className="tap text-fg-muted hover:bg-bg-sunken hover:text-fg grid size-9 place-items-center rounded-full transition-colors"
            >
              <ChevronLeft className="size-4.5" aria-hidden />
            </Link>
            <span className="text-fg min-w-[8.5rem] px-2 text-center text-sm font-bold">
              {monthLabel}
            </span>
            <Link
              href={`/calendar?month=${shiftMonth(month, 1)}`}
              aria-label="Next month"
              className="tap text-fg-muted hover:bg-bg-sunken hover:text-fg grid size-9 place-items-center rounded-full transition-colors"
            >
              <ChevronRight className="size-4.5" aria-hidden />
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
        {/* ------------------------------------------------------- the grid */}
        <Reveal className="lg:col-span-8">
          <Card padding="lg" className="h-full">
            <div className="grid grid-cols-7 gap-1.5 pb-2">
              {WEEKDAYS.map((d) => (
                <span key={d} className="eyebrow text-center">
                  <span className="sm:hidden">{d.slice(0, 1)}</span>
                  <span className="hidden sm:inline">{d}</span>
                </span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1.5">
              {Array.from({ length: leading }, (_, i) => (
                <span key={`pad-${i}`} />
              ))}
              {days.map((day, i) => (
                <DayCell key={day.date} day={day} index={i} onSelect={() => setSelected(day)} />
              ))}
            </div>
          </Card>
        </Reveal>

        {/* -------------------------------------------------- month summary */}
        <div className="flex flex-col gap-4 lg:col-span-4 lg:gap-5">
          <Reveal delay={1}>
            <Card variant="wash" tone="pulse" padding="lg">
              <p className="eyebrow">This month</p>
              <p className="stat-num text-stat text-fg mt-3">
                {showedUp}
                <span className="text-fg-subtle">/{scored.length}</span>
              </p>
              <p className="text-fg-muted mt-1 text-sm font-semibold">study days completed</p>
              <ProgressBar value={pct} className="mt-4" label="Month completion" />

              <dl className="border-pulse-500/20 mt-5 grid grid-cols-2 gap-3 border-t pt-4">
                <div>
                  <dt className="eyebrow">XP earned</dt>
                  <dd className="stat-num text-fg mt-1 text-lg">{monthPoints.toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="eyebrow">Study time</dt>
                  <dd className="stat-num text-fg mt-1 text-lg">
                    {Math.floor(monthMinutes / 60)}h {monthMinutes % 60}m
                  </dd>
                </div>
              </dl>
            </Card>
          </Reveal>

          <Reveal delay={2}>
            <Card padding="lg">
              <p className="eyebrow">Legend</p>
              <ul className="mt-3.5 space-y-2">
                {(['perfect', 'strong', 'active', 'weak', 'missed', 'off'] as const).map((band) => (
                  <li key={band} className="flex items-center gap-2.5">
                    <span
                      className={cn('size-4 rounded-md', BAND_STYLE[band].className)}
                      aria-hidden
                    />
                    <span className="text-fg-muted text-sm">{BAND_STYLE[band].label}</span>
                  </li>
                ))}
              </ul>
              <p className="border-border text-fg-subtle mt-4 border-t pt-3 text-xs leading-relaxed">
                The cohort runs {cohortStart} to {cohortEnd}. Weekends and holidays are rest days
                and never break your streak.
              </p>
            </Card>
          </Reveal>
        </div>
      </div>

      <DayDetail day={selected} today={today} onClose={() => setSelected(null)} />
    </div>
  );
}

function DayCell({
  day,
  index,
  onSelect,
}: {
  day: CalendarDay;
  index: number;
  onSelect: () => void;
}) {
  const dayNumber = Number(day.date.slice(-2));
  const style = BAND_STYLE[day.band];
  const filled = !day.isFuture && day.band !== 'off' && day.band !== 'missed';

  /*
   * The band fills are graded by opacity, so a fixed white numeral is only legible on the
   * two strongest of them. Below that the fill is pale enough that white-on-lavender is
   * effectively invisible, and the date — the one thing every cell must always say — is
   * the part that disappears. Weak and active days therefore keep foreground text.
   */
  const solidFill = day.band === 'perfect' || day.band === 'strong';

  const label = `${day.date}. ${day.isFuture ? 'Upcoming' : style.label}${
    day.topicTitle ? `. Topic: ${day.topicTitle}` : ''
  }`;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={label}
      style={{ animationDelay: `${Math.min(index * 12, 300)}ms` }}
      className={cn(
        'animate-rise tap relative grid aspect-square place-items-center rounded-xl text-sm font-bold transition-all duration-150',
        'hover:shadow-lift hover:z-10 hover:scale-110 active:scale-95',
        'motion-reduce:hover:scale-100 motion-reduce:active:scale-100',
        !day.inCohort && 'opacity-30',
        day.isFuture
          ? 'bg-bg-sunken/60 text-fg-subtle'
          : day.band === 'off'
            ? 'bg-bg-inset text-fg-subtle'
            : day.band === 'missed'
              ? 'bg-danger/8 text-danger ring-danger/40 ring-1 ring-inset'
              : cn(style.className, solidFill ? 'text-white' : 'text-fg'),
        day.isToday && 'ring-fg ring-2 ring-offset-2 ring-offset-[var(--bg-elevated)]',
      )}
    >
      {dayNumber}
      {day.events.length > 0 && (
        <span
          className={cn(
            'absolute right-1.5 bottom-1.5 size-1.5 rounded-full',
            filled && solidFill ? 'bg-white/90' : 'bg-iris-500',
          )}
          aria-hidden
        />
      )}
    </button>
  );
}

function DayDetail({
  day,
  today,
  onClose,
}: {
  day: CalendarDay | null;
  today: string;
  onClose: () => void;
}) {
  const title = day
    ? new Date(`${day.date}T12:00:00Z`).toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        timeZone: 'UTC',
      })
    : '';

  return (
    <Sheet open={day !== null} onClose={onClose} title={title} size="sm">
      {day && (
        <div className="space-y-5 pt-1">
          <div className="flex flex-wrap gap-2">
            {day.date === today && <Badge tone="pulse">Today</Badge>}
            {day.isHoliday && <Badge tone="iris">Cohort holiday</Badge>}
            {!day.isActiveDay && !day.isHoliday && <Badge>Rest day</Badge>}
            {day.isFuture ? (
              <Badge>Upcoming</Badge>
            ) : day.isActiveDay ? (
              <Badge
                tone={
                  day.band === 'missed' ? 'danger' : day.band === 'weak' ? 'warning' : 'success'
                }
              >
                {BAND_STYLE[day.band].label}
              </Badge>
            ) : null}
          </div>

          {!day.isFuture && day.isActiveDay && (
            <div className="grid grid-cols-2 gap-3">
              <div className="surface-sunken p-3.5">
                <p className="eyebrow">XP earned</p>
                <p className="stat-num text-fg mt-1 text-xl">{day.points}</p>
              </div>
              <div className="surface-sunken p-3.5">
                <p className="eyebrow">Studied</p>
                <p className="stat-num text-fg mt-1 text-xl">
                  {day.studyMinutes > 0 ? `${day.studyMinutes}m` : '—'}
                </p>
              </div>
            </div>
          )}

          <dl className="space-y-3.5">
            {day.topicTitle ? (
              <Detail label="Topic" value={day.topicTitle} />
            ) : day.isActiveDay ? (
              <Detail label="Topic" value="No topic was assigned" muted />
            ) : null}

            {day.plannedMinutes !== null && (
              <Detail label="Study target" value={`${day.plannedMinutes} minutes`} />
            )}

            {!day.isFuture && day.isActiveDay && (
              <Detail
                label="Study room"
                value={
                  day.attendance === 'present'
                    ? 'Present'
                    : day.attendance === 'late'
                      ? 'Late'
                      : day.attendance === 'absent'
                        ? 'Absent'
                        : 'Not marked'
                }
                muted={!day.attendance}
              />
            )}
          </dl>

          {day.events.length > 0 && (
            <div>
              <p className="eyebrow">Events</p>
              <ul className="mt-2.5 space-y-2">
                {day.events.map((e) => (
                  <li key={e.id} className="surface-sunken flex items-center gap-3 p-3.5">
                    <span className="text-lg" aria-hidden>
                      {EVENT_EMOJI[e.type] ?? '📌'}
                    </span>
                    <div className="min-w-0">
                      <p className="text-fg truncate text-sm font-bold">{e.title}</p>
                      <p className="text-fg-subtle text-xs">{e.startTime}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}

function Detail({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd className={cn('mt-1 text-sm font-semibold', muted ? 'text-fg-subtle' : 'text-fg')}>
        {value}
      </dd>
    </div>
  );
}
