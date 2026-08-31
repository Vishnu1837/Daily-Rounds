'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { TextInput } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import { addDays } from '@/lib/domain/calendar';
import { markAttendanceAction } from '@/server/actions/admin';

type Status = 'present' | 'late' | 'absent';

type Row = {
  memberId: string;
  name: string;
  mbbsYear: number | null;
  status: Status | null;
  note: string | null;
};

const OPTIONS: { value: Status; label: string; className: string }[] = [
  {
    value: 'present',
    label: 'Present',
    className:
      'data-[on=true]:bg-success data-[on=true]:text-white data-[on=true]:border-success',
  },
  {
    value: 'late',
    label: 'Late',
    className:
      'data-[on=true]:bg-warning data-[on=true]:text-ink-950 data-[on=true]:border-warning',
  },
  {
    value: 'absent',
    label: 'Absent',
    className: 'data-[on=true]:bg-danger data-[on=true]:text-white data-[on=true]:border-danger',
  },
];

export function AttendanceSheet({
  cohortId,
  date,
  today,
  isActiveDay,
  rows,
}: {
  cohortId: string;
  date: string;
  today: string;
  isActiveDay: boolean;
  rows: Row[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState('');

  const [draft, setDraft] = useState<Record<string, Status>>(() =>
    Object.fromEntries(rows.filter((r) => r.status).map((r) => [r.memberId, r.status!])),
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;
  }, [rows, query]);

  const counts = useMemo(() => {
    const values = Object.values(draft);
    return {
      present: values.filter((v) => v === 'present').length,
      late: values.filter((v) => v === 'late').length,
      absent: values.filter((v) => v === 'absent').length,
      unmarked: rows.length - values.length,
    };
  }, [draft, rows.length]);

  const dirty = useMemo(() => {
    const original = Object.fromEntries(
      rows.filter((r) => r.status).map((r) => [r.memberId, r.status!]),
    );
    const keys = new Set([...Object.keys(draft), ...Object.keys(original)]);
    return [...keys].some((k) => draft[k] !== original[k]);
  }, [draft, rows]);

  function setAll(status: Status) {
    setDraft(Object.fromEntries(filtered.map((r) => [r.memberId, status])));
  }

  function save() {
    const entries = Object.entries(draft).map(([memberId, status]) => ({ memberId, status }));
    if (entries.length === 0) {
      toast.error('Nothing to save', 'Mark at least one student first.');
      return;
    }
    startTransition(async () => {
      const result = await markAttendanceAction(cohortId, { date, entries });
      if (!result.ok) {
        toast.error('Attendance not saved', result.message);
        return;
      }
      toast.success('Attendance saved', `${result.data.marked} students updated, points recalculated`);
      router.refresh();
    });
  }

  const dateLabel = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });

  return (
    <div className="space-y-4">
      <header className="px-1 pt-2">
        <h1 className="text-2xl font-extrabold tracking-tight text-fg">Attendance</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Marking attendance awards or withdraws study-room points immediately.
        </p>
      </header>

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <a
              href={`/admin/attendance?date=${addDays(date, -1)}`}
              className="tap grid size-9 place-items-center rounded-xl text-fg-muted hover:bg-bg-sunken hover:text-fg"
              aria-label="Previous day"
            >
              ‹
            </a>
            <div>
              <p className="font-bold text-fg">{dateLabel}</p>
              <p className="text-xs text-fg-subtle">
                {date === today ? 'Today' : date}
                {!isActiveDay && ' · not an active study day'}
              </p>
            </div>
            <a
              href={`/admin/attendance?date=${addDays(date, 1)}`}
              className="tap grid size-9 place-items-center rounded-xl text-fg-muted hover:bg-bg-sunken hover:text-fg"
              aria-label="Next day"
            >
              ›
            </a>
          </div>
          {date !== today && (
            <a
              href="/admin/attendance"
              className="text-sm font-semibold text-pulse-700 dark:text-pulse-400"
            >
              Jump to today
            </a>
          )}
        </div>

        {!isActiveDay && (
          <p className="mt-3 rounded-2xl bg-warning/10 p-3.5 text-sm text-fg-muted">
            This is a rest day or holiday. You can still record attendance for an ad-hoc session —
            it will not affect anyone&apos;s streak.
          </p>
        )}
      </Card>

      <div className="flex flex-wrap gap-2">
        <Badge tone="success">{counts.present} present</Badge>
        <Badge tone="warning">{counts.late} late</Badge>
        <Badge tone="danger">{counts.absent} absent</Badge>
        <Badge>{counts.unmarked} unmarked</Badge>
      </div>

      <div className="flex flex-wrap gap-2">
        <TextInput
          type="search"
          placeholder="Find a student"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search students"
          className="min-w-[12rem] flex-1"
        />
        <Button variant="outline" size="md" onClick={() => setAll('present')}>
          Mark all present
        </Button>
        <Button variant="outline" size="md" onClick={() => setAll('absent')}>
          Mark all absent
        </Button>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            emoji="🔍"
            title="No students matched"
            description="Try a different name, or clear the search."
          />
        </Card>
      ) : (
        <Card className="divide-y divide-border p-0">
          {/*
            Rows stack on phones so a 27-name roster stays readable: three status buttons
            plus a name do not fit on one 375px row without truncating the name, and the
            name is the part an admin is scanning for.
          */}
          {filtered.map((row) => (
            <div key={row.memberId} className="p-3.5 sm:flex sm:items-center sm:gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar name={row.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-fg">{row.name}</p>
                  <p className="truncate text-xs text-fg-subtle">
                    {row.mbbsYear ? `Year ${row.mbbsYear}` : '—'}
                    {row.status && ` · saved as ${row.status}`}
                  </p>
                </div>
              </div>
              <div
                role="radiogroup"
                aria-label={`Attendance for ${row.name}`}
                className="mt-2.5 grid grid-cols-3 gap-1.5 sm:mt-0 sm:flex sm:shrink-0"
              >
                {OPTIONS.map((option) => {
                  const on = draft[row.memberId] === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      data-on={on}
                      onClick={() =>
                        setDraft((prev) => ({ ...prev, [row.memberId]: option.value }))
                      }
                      className={cn(
                        'tap h-10 rounded-xl border border-border px-3 text-xs font-bold transition-all',
                        'active:scale-95 motion-reduce:active:scale-100',
                        !on && 'bg-bg-elevated text-fg-muted hover:border-border-strong',
                        option.className,
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* Sticky save bar — marking 27 students should never mean scrolling to find a button. */}
      <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+4.25rem)] z-20 lg:bottom-4">
        <Card className="flex items-center justify-between gap-3 p-3 shadow-lift">
          <p className="text-sm text-fg-muted">
            {dirty ? 'You have unsaved changes' : 'Everything is saved'}
          </p>
          <Button size="md" loading={pending} disabled={!dirty} onClick={save}>
            Save attendance
          </Button>
        </Card>
      </div>
    </div>
  );
}
