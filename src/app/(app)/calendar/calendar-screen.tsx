'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { BAND_STYLE } from '@/components/charts/heatmap';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
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

  const summary = days.filter((d) => d.isActiveDay && !d.isFuture);
  const showedUp = summary.filter((d) => d.showedUp).length;

  return (
    <div className="space-y-4">
      <header className="px-1 pt-2">
        <h1 className="text-2xl font-extrabold tracking-tight text-fg">Calendar</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Tap any day to see what was planned and what actually happened.
        </p>
      </header>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3.5">
          <Link
            href={`/calendar?month=${shiftMonth(month, -1)}`}
            aria-label="Previous month"
            className="tap grid size-9 place-items-center rounded-xl text-fg-muted hover:bg-bg-sunken hover:text-fg"
          >
            <ChevronLeft className="size-5" aria-hidden />
          </Link>
          <h2 className="text-base font-extrabold text-fg">{monthLabel}</h2>
          <Link
            href={`/calendar?month=${shiftMonth(month, 1)}`}
            aria-label="Next month"
            className="tap grid size-9 place-items-center rounded-xl text-fg-muted hover:bg-bg-sunken hover:text-fg"
          >
            <ChevronRight className="size-5" aria-hidden />
          </Link>
        </div>

        <div className="grid grid-cols-7 gap-1 border-t border-border px-3 pt-3 pb-1">
          {WEEKDAYS.map((d) => (
            <span
              key={d}
              className="text-center text-2xs font-bold tracking-wide text-fg-subtle uppercase"
            >
              {d.slice(0, 1)}
            </span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1 px-3 pb-4">
          {Array.from({ length: leading }, (_, i) => (
            <span key={`pad-${i}`} />
          ))}
          {days.map((day) => (
            <DayCell key={day.date} day={day} onSelect={() => setSelected(day)} />
          ))}
        </div>

        <div className="border-t border-border px-5 py-3.5">
          <p className="text-sm text-fg-muted">
            <strong className="text-fg">
              {showedUp}/{summary.length}
            </strong>{' '}
            study days completed this month.
          </p>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-2xs font-bold tracking-[0.14em] text-fg-subtle uppercase">Legend</h2>
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {(['perfect', 'strong', 'active', 'weak', 'missed', 'off'] as const).map((band) => (
            <li key={band} className="flex items-center gap-2">
              <span
                className={cn('size-4 rounded-md', BAND_STYLE[band].className)}
                aria-hidden
              />
              <span className="text-xs font-medium text-fg-muted">{BAND_STYLE[band].label}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-fg-subtle">
          The cohort runs {cohortStart} to {cohortEnd}. Weekends and holidays are rest days and never
          break your streak.
        </p>
      </Card>

      <DayDetail day={selected} today={today} onClose={() => setSelected(null)} />
    </div>
  );
}

function DayCell({ day, onSelect }: { day: CalendarDay; onSelect: () => void }) {
  const dayNumber = Number(day.date.slice(-2));
  const style = BAND_STYLE[day.band];

  const label = `${day.date}. ${day.isFuture ? 'Upcoming' : style.label}${
    day.topicTitle ? `. Topic: ${day.topicTitle}` : ''
  }`;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={label}
      className={cn(
        'tap relative grid aspect-square place-items-center rounded-xl text-sm font-bold transition-all duration-150',
        'hover:scale-105 active:scale-95 motion-reduce:hover:scale-100 motion-reduce:active:scale-100',
        !day.inCohort && 'opacity-30',
        day.isFuture
          ? 'bg-bg-sunken/60 text-fg-subtle'
          : day.band === 'off'
            ? 'bg-bg-sunken text-fg-subtle'
            : day.band === 'missed'
              ? 'bg-danger/8 text-danger ring-1 ring-danger/35 ring-inset'
              : cn(style.className, 'text-white'),
        day.isToday && 'ring-2 ring-fg ring-offset-2 ring-offset-[var(--bg-elevated)]',
      )}
    >
      {dayNumber}
      {day.events.length > 0 && (
        <span
          className="absolute right-1 bottom-1 size-1.5 rounded-full bg-iris-400"
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
        <div className="space-y-4 pt-1">
          <div className="flex flex-wrap gap-2">
            {day.date === today && <Badge tone="pulse">Today</Badge>}
            {day.isHoliday && <Badge tone="iris">Cohort holiday</Badge>}
            {!day.isActiveDay && !day.isHoliday && <Badge>Rest day</Badge>}
            {day.isFuture ? (
              <Badge>Upcoming</Badge>
            ) : day.isActiveDay ? (
              <Badge
                tone={
                  day.band === 'missed'
                    ? 'danger'
                    : day.band === 'weak'
                      ? 'warning'
                      : 'success'
                }
              >
                {BAND_STYLE[day.band].label}
              </Badge>
            ) : null}
          </div>

          {day.topicTitle ? (
            <Detail label="Topic" value={day.topicTitle} />
          ) : day.isActiveDay ? (
            <Detail label="Topic" value="No topic was assigned" muted />
          ) : null}

          {day.plannedMinutes !== null && (
            <Detail label="Study target" value={`${day.plannedMinutes} minutes`} />
          )}

          {!day.isFuture && day.isActiveDay && (
            <>
              <Detail
                label="Actually studied"
                value={day.studyMinutes > 0 ? `${day.studyMinutes} minutes` : 'Nothing recorded'}
                muted={day.studyMinutes === 0}
              />
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
              <Detail label="Score" value={`${day.points} points`} />
            </>
          )}

          {day.events.length > 0 && (
            <div>
              <p className="text-2xs font-bold tracking-[0.14em] text-fg-subtle uppercase">
                Events
              </p>
              <ul className="mt-2 space-y-2">
                {day.events.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-center gap-3 rounded-2xl bg-bg-sunken p-3.5"
                  >
                    <span className="text-lg" aria-hidden>
                      {EVENT_EMOJI[e.type] ?? '📌'}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-fg">{e.title}</p>
                      <p className="text-xs text-fg-subtle">{e.startTime}</p>
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
      <p className="text-2xs font-bold tracking-[0.14em] text-fg-subtle uppercase">{label}</p>
      <p className={cn('mt-1 text-sm font-semibold', muted ? 'text-fg-subtle' : 'text-fg')}>
        {value}
      </p>
    </div>
  );
}
