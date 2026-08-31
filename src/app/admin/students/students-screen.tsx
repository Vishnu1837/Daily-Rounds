'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { UserPlus } from 'lucide-react';

import { StreakFlame } from '@/components/gamification/streak-flame';
import { Avatar } from '@/components/ui/avatar';
import { StatusPill } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { FormError, Select, TextInput } from '@/components/ui/form';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import { RISK_LABELS, RISK_ORDER } from '@/lib/domain/risk';
import { createStudentAction } from '@/server/actions/admin';
import type { AdminStudentRow } from '@/server/queries/admin';

type SortKey = 'risk' | 'consistency' | 'streak' | 'name' | 'points';

/**
 * Risk is about *recent* behaviour, not a lifetime average — a student can sit at 28%
 * overall and still be on track because they have turned up every day this fortnight.
 * Surfacing the reason on the badge stops that reading as a bug.
 */
function riskReason(s: AdminStudentRow): string {
  if (s.riskReasons.length > 0) return s.riskReasons.join('. ');
  return s.streak > 0
    ? `Showing up — currently on a ${s.streak}-day streak`
    : 'No recent missed study days';
}

export function StudentsScreen({
  cohortId,
  students,
}: {
  cohortId: string;
  students: AdminStudentRow[];
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('risk');
  const [addOpen, setAddOpen] = useState(false);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? students.filter(
          (s) => s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q),
        )
      : students;

    return [...filtered].sort((a, b) => {
      switch (sort) {
        case 'risk':
          return RISK_ORDER[a.risk] - RISK_ORDER[b.risk] || a.consistencyPct - b.consistencyPct;
        case 'consistency':
          return b.consistencyPct - a.consistencyPct;
        case 'streak':
          return b.streak - a.streak;
        case 'points':
          return b.points - a.points;
        case 'name':
          return a.name.localeCompare(b.name);
      }
    });
  }, [students, query, sort]);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3 px-1 pt-2">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-fg">Students</h1>
          <p className="mt-1 text-sm text-fg-muted">{students.length} in this cohort</p>
        </div>
        <Button size="md" onClick={() => setAddOpen(true)}>
          <UserPlus className="size-4" aria-hidden />
          Add student
        </Button>
      </header>

      <div className="flex flex-wrap gap-2">
        <TextInput
          type="search"
          placeholder="Search by name or email"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search students"
          className="min-w-[12rem] flex-1"
        />
        <Select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          aria-label="Sort students"
          className="w-auto"
        >
          <option value="risk">Needs attention first</option>
          <option value="consistency">Consistency</option>
          <option value="streak">Streak</option>
          <option value="points">Points</option>
          <option value="name">Name</option>
        </Select>
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            emoji="🔍"
            title="No students matched"
            description="Try a different name or email."
          />
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          {/* Desktop table */}
          <table className="hidden w-full text-left lg:table">
            <thead>
              <tr className="border-b border-border text-2xs tracking-[0.1em] text-fg-subtle uppercase">
                <th scope="col" className="px-5 py-3 font-bold">
                  Student
                </th>
                <th scope="col" className="px-3 py-3 font-bold">
                  Subject
                </th>
                <th scope="col" className="px-3 py-3 text-right font-bold">
                  Consistency
                </th>
                <th scope="col" className="px-3 py-3 text-right font-bold">
                  Streak
                </th>
                <th scope="col" className="px-3 py-3 text-right font-bold">
                  Roadmap
                </th>
                <th scope="col" className="px-3 py-3 text-right font-bold">
                  Points
                </th>
                <th scope="col" className="px-5 py-3 font-bold">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((s) => (
                <tr key={s.memberId} className="transition-colors hover:bg-bg-sunken">
                  <td className="px-5 py-3">
                    <Link
                      href={`/admin/students/${s.memberId}`}
                      className="flex items-center gap-3 font-semibold text-fg hover:underline"
                    >
                      <Avatar name={s.name} size="xs" />
                      <span>
                        {s.name}
                        <span className="block text-xs font-normal text-fg-subtle">{s.email}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-sm text-fg-muted">{s.subjectName ?? '—'}</td>
                  <td className="px-3 py-3 text-right text-sm font-bold text-fg tabular-nums">
                    {s.consistencyPct}%
                  </td>
                  <td className="px-3 py-3 text-right text-sm font-bold text-fg tabular-nums">
                    {s.streak}
                  </td>
                  <td className="px-3 py-3 text-right text-sm text-fg-muted tabular-nums">
                    {s.roadmapPct}%
                  </td>
                  <td className="px-3 py-3 text-right text-sm text-fg-muted tabular-nums">
                    {s.points}
                  </td>
                  <td className="px-5 py-3">
                    <StatusPill
                      tone={
                        s.risk === 'needs_intervention'
                          ? 'danger'
                          : s.risk === 'at_risk'
                            ? 'warning'
                            : 'success'
                      }
                      label={RISK_LABELS[s.risk]}
                      title={riskReason(s)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Mobile list */}
          <ul className="divide-y divide-border lg:hidden">
            {rows.map((s) => (
              <li key={s.memberId}>
                <Link
                  href={`/admin/students/${s.memberId}`}
                  className="tap flex items-center gap-3 p-4 transition-colors hover:bg-bg-sunken"
                >
                  <Avatar name={s.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-fg">{s.name}</p>
                    <p className="truncate text-xs text-fg-subtle">
                      {s.subjectName ?? 'No subject'} · {s.consistencyPct}% ·{' '}
                      {s.roadmapPct}% roadmap
                    </p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1 text-sm font-bold text-flame-600 tabular-nums dark:text-flame-300">
                    <StreakFlame streak={s.streak} size="sm" animated={false} />
                    {s.streak}
                  </span>
                  <span
                    className={cn(
                      'size-2.5 shrink-0 rounded-full',
                      s.risk === 'needs_intervention'
                        ? 'bg-danger'
                        : s.risk === 'at_risk'
                          ? 'bg-warning'
                          : 'bg-success',
                    )}
                    aria-hidden
                  />
                  <span className="sr-only">{RISK_LABELS[s.risk]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Sheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add a student"
        description="They can change their password after signing in."
      >
        <AddStudentForm cohortId={cohortId} onDone={() => setAddOpen(false)} />
      </Sheet>
    </div>
  );
}

function AddStudentForm({ cohortId, onDone }: { cohortId: string; onDone: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | undefined>();
  const [errors, setErrors] = useState<Record<string, string>>({});

  return (
    <form
      className="space-y-4 pt-2"
      action={(formData) =>
        startTransition(async () => {
          setMessage(undefined);
          setErrors({});
          const result = await createStudentAction(null, formData);
          if (!result.ok) {
            setMessage(result.message);
            setErrors(result.errors ?? {});
            return;
          }
          toast.success('Student added', 'They still need to complete onboarding.');
          onDone();
          router.refresh();
        })
      }
    >
      <input type="hidden" name="cohortId" value={cohortId} />
      <FormError>{message}</FormError>
      <TextInput label="Full name" name="fullName" required error={errors.fullName} />
      <TextInput label="Email" name="email" type="email" required error={errors.email} />
      <TextInput
        label="Temporary password"
        name="password"
        required
        error={errors.password}
        hint="At least 8 characters. Share it with them directly."
      />
      <TextInput label="University" name="university" error={errors.university} />
      <Select label="MBBS year" name="mbbsYear" defaultValue="">
        <option value="">Not set</option>
        {[1, 2, 3, 4, 5].map((y) => (
          <option key={y} value={y}>
            Year {y}
          </option>
        ))}
      </Select>
      <Button type="submit" size="lg" fullWidth loading={pending}>
        Add student
      </Button>
    </form>
  );
}
