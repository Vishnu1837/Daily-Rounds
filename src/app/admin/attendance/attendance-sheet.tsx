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
import { PageHeader } from '@/components/ui/page-header';
import { cn } from '@/lib/cn';
import { addDays } from '@/lib/domain/calendar';
import { markAttendanceAction } from '@/server/actions/admin';
import { Search } from 'lucide-react';

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
    className: 'data-[on=true]:bg-success data-[on=true]:text-white data-[on=true]:border-success',
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

  /**
   * Rows the server has confirmed, which is what `dirty` compares against.
   *
   * Previously `dirty` compared the draft to the `rows` prop, and the only thing that
   * refreshed that prop was `router.refresh()` awaited *inside* the transition — so the
   * button kept spinning until a full dynamic page render came back, and looked stuck. Now
   * the confirmed baseline moves as soon as the action returns; the refresh still happens,
   * but outside the transition, where nobody is waiting on it.
   */
  const [saved, setSaved] = useState<Record<string, Status>>(() =>
    Object.fromEntries(rows.filter((r) => r.status).map((r) => [r.memberId, r.status!])),
  );

  const dirty = useMemo(() => {
    const keys = new Set([...Object.keys(draft), ...Object.keys(saved)]);
    return [...keys].some((k) => draft[k] !== saved[k]);
  }, [draft, saved]);

  function setAll(status: Status) {
    setDraft(Object.fromEntries(filtered.map((r) => [r.memberId, status])));
  }

  function save() {
    const entries = Object.entries(draft).map(([memberId, status]) => ({ memberId, status }));
    if (entries.length === 0) {
      toast.error('Nothing to save', 'Mark at least one student first.');
      return;
    }
    // The button is disabled while pending, so a second submission cannot start.
    startTransition(async () => {
      const result = await markAttendanceAction(cohortId, { date, entries });
      if (!result.ok) {
        toast.error('Attendance not saved', result.message);
        return;
      }
      setSaved({ ...draft });
      toast.success(
        'Attendance saved',
        `${result.data.marked} students updated, points recalculated`,
      );
      // Deliberately not awaited: the save is already confirmed, and this only refreshes
      // derived figures elsewhere on the page.
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
    <div className="space-y-5">
      <PageHeader
        eyebrow="Study room"
        title="Attendance"
        description="Marking attendance awards or withdraws study-room points immediately."
      />

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <a
              href={`/admin/attendance?date=${addDays(date, -1)}`}
              className="tap text-fg-muted hover:bg-bg-sunken hover:text-fg grid size-9 place-items-center rounded-xl"
              aria-label="Previous day"
            >
              ‹
            </a>
            <div>
              <p className="text-fg font-bold">{dateLabel}</p>
              <p className="text-fg-subtle text-xs">
                {date === today ? 'Today' : date}
                {!isActiveDay && ' · not an active study day'}
              </p>
            </div>
            <a
              href={`/admin/attendance?date=${addDays(date, 1)}`}
              className="tap text-fg-muted hover:bg-bg-sunken hover:text-fg grid size-9 place-items-center rounded-xl"
              aria-label="Next day"
            >
              ›
            </a>
          </div>
          {date !== today && (
            <a
              href="/admin/attendance"
              className="text-pulse-700 dark:text-pulse-400 text-sm font-semibold"
            >
              Jump to today
            </a>
          )}
        </div>

        {!isActiveDay && (
          <p className="bg-warning/10 text-fg-muted mt-3 rounded-2xl p-3.5 text-sm">
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
            icon={<Search className="size-6" aria-hidden />}
            title="No students matched"
            description="Try a different name, or clear the search."
          />
        </Card>
      ) : (
        <Card className="divide-border divide-y p-0">
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
                  <p className="text-fg truncate text-sm font-bold">{row.name}</p>
                  <p className="text-fg-subtle truncate text-xs">
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
                        'tap border-border h-10 rounded-xl border px-3 text-xs font-bold transition-all',
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
        <Card className="shadow-lift flex items-center justify-between gap-3 p-3">
          <p className="text-fg-muted text-sm">
            {dirty ? 'You have unsaved changes' : 'Everything is saved'}
          </p>
          <Button size="md" loading={pending} disabled={!dirty || pending} onClick={save}>
            Save attendance
          </Button>
        </Card>
      </div>
    </div>
  );
}
