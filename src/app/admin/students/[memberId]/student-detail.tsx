'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ClipboardList, Trash2 } from 'lucide-react';

import { ActivityHeatmap } from '@/components/charts/heatmap';
import { WeekBars } from '@/components/charts/week-bars';
import { StreakFlame } from '@/components/gamification/streak-flame';
import { Avatar } from '@/components/ui/avatar';
import { Badge, StatusPill } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { FormError, Select, TextArea, TextInput } from '@/components/ui/form';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import { POINT_EVENT_LABELS } from '@/lib/domain/points';
import { RISK_LABELS } from '@/lib/domain/risk';
import { OBSTACLE_LABELS } from '@/lib/validation';
import {
  adjustPointsAction,
  deleteStudentAction,
  updateStudentAction,
} from '@/server/actions/admin';
import type { StudentTopicPlan, getStudentDetail } from '@/server/queries/admin';

import { ManageTopicsPanel, type SyllabusSubject } from './assign-topic';

type Detail = NonNullable<Awaited<ReturnType<typeof getStudentDetail>>>;

export function StudentDetailScreen({
  cohortId,
  today,
  cohortEnded,
  detail,
  topicPlan,
  syllabusSubjects,
}: {
  cohortId: string;
  today: string;
  cohortEnded: boolean;
  detail: Detail;
  topicPlan: StudentTopicPlan;
  syllabusSubjects: SyllabusSubject[];
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);

  const { member, goals, overall, risk } = detail;

  return (
    <div className="space-y-4">
      <Link
        href="/admin/students"
        className="tap text-fg-muted hover:text-fg inline-flex items-center gap-1.5 px-1 py-2 text-sm font-semibold"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All students
      </Link>

      {/* ------------------------------------------------------------ header */}
      <Card padding="lg">
        <div className="flex flex-wrap items-start gap-5">
          <Avatar name={member.name} src={member.avatarUrl} size="lg" ring />
          <div className="min-w-0 flex-1">
            <h1 className="text-fg text-2xl font-extrabold tracking-tight">{member.name}</h1>
            <p className="text-fg-muted truncate text-sm">{member.email}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <StatusPill
                tone={
                  risk.level === 'needs_intervention'
                    ? 'danger'
                    : risk.level === 'at_risk'
                      ? 'warning'
                      : 'success'
                }
                label={RISK_LABELS[risk.level]}
              />
              {member.mbbsYear && <Badge>Year {member.mbbsYear}</Badge>}
              {goals?.subjectName && <Badge tone="iris">{goals.subjectName}</Badge>}
              {member.status !== 'active' && <Badge tone="warning">{member.status}</Badge>}
              {member.role === 'admin' && <Badge tone="pulse">Admin</Badge>}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              Edit
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAdjustOpen(true)}>
              Adjust points
            </Button>
          </div>
        </div>

        {risk.reasons.length > 0 && (
          <ul className="rounded-panel bg-warning/12 ring-warning/25 mt-5 space-y-1.5 p-4 ring-1 ring-inset">
            {risk.reasons.map((reason) => (
              <li key={reason} className="text-fg text-sm font-medium">
                • {reason}
              </li>
            ))}
          </ul>
        )}

        {member.whatsapp && (
          <p className="text-fg-muted mt-3 text-sm">
            WhatsApp: <span className="text-fg font-semibold">{member.whatsapp}</span>
          </p>
        )}
      </Card>

      {/* ------------------------------------------------------------- stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Consistency" value={`${overall.consistencyPct}%`} />
        <Stat
          label="Show-up rate"
          value={`${overall.completedDays}/${overall.activeDays}`}
          sub={`${overall.showUpRatePct}%`}
        />
        <Stat
          label="Streak"
          value={String(detail.streak)}
          sub={`best ${detail.bestStreak}`}
          icon={<StreakFlame streak={detail.streak} size="sm" animated={false} />}
        />
        <Stat
          label="Roadmap"
          value={`${detail.topics.total === 0 ? 0 : Math.round((detail.topics.completed / detail.topics.total) * 100)}%`}
          sub={`${detail.topics.completed}/${detail.topics.total} topics`}
        />
        <Stat
          label="Study time"
          value={`${Math.floor(overall.studyMinutes / 60)}h ${overall.studyMinutes % 60}m`}
        />
        <Stat label="Present" value={String(detail.attendance.present)} />
        <Stat label="Late" value={String(detail.attendance.late)} />
        <Stat label="Absent" value={String(detail.attendance.absent)} />
      </div>

      {/* ----------------------------------------------------------- topics */}
      <ManageTopicsPanel
        cohortId={cohortId}
        memberId={member.memberId}
        studentName={member.name}
        plan={topicPlan}
        syllabusSubjects={syllabusSubjects}
      />

      {/* ----------------------------------------------------------- charts */}
      <Card>
        <CardHeader title="Consistency" />
        <div className="p-5 pt-4">
          <ActivityHeatmap days={detail.heatmap} />
        </div>
      </Card>

      <Card>
        <CardHeader title="Week by week" />
        <div className="p-5 pt-4">
          <WeekBars weeks={detail.weeks} />
        </div>
      </Card>

      {/* -------------------------------------------------------- baseline */}
      {goals && (
        <Card>
          <CardHeader title="Onboarding baseline" />
          <div className="grid gap-4 p-5 pt-4 sm:grid-cols-2">
            <dl className="space-y-2.5">
              <Row label="Goal" value={goals.cohortGoal} />
              <Row label="Daily commitment" value={`${goals.dailyCommitmentMinutes} minutes`} />
              {goals.examName && (
                <Row
                  label="Exam"
                  value={`${goals.examName}${goals.examDate ? ` · ${goals.examDate}` : ''}`}
                />
              )}
            </dl>
            <dl className="space-y-2.5">
              <Row
                label="Studied last week"
                value={`${goals.baselineDaysStudiedLastWeek}/7 days`}
              />
              <Row label="Self-rated consistency" value={`${goals.baselineConsistencyRating}/10`} />
              <Row label="Subject confidence" value={`${goals.baselineConfidence}/5`} />
              <Row
                label="Biggest obstacle"
                value={OBSTACLE_LABELS[goals.biggestObstacle] ?? goals.biggestObstacle}
              />
            </dl>
          </div>
          {cohortEnded && (
            <div className="px-5 pb-5">
              <Link href={`/admin/students/${member.memberId}/report`}>
                <Button variant="outline" size="md" fullWidth>
                  Open end-of-cohort report
                </Button>
              </Link>
            </div>
          )}
        </Card>
      )}

      {/* -------------------------------------------------------- check-ins */}
      <Card>
        <CardHeader title="Recent check-ins" description="Most recent first." />
        {detail.checkIns.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="size-6" aria-hidden />}
            title="No check-ins yet"
            description="This student has not submitted a daily check-in."
          />
        ) : (
          <ul className="divide-border divide-y">
            {detail.checkIns.map((c) => (
              <li key={c.id} className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-fg text-sm font-bold">{c.date}</span>
                  <Badge
                    tone={
                      c.completion === 'completed'
                        ? 'success'
                        : c.completion === 'partial'
                          ? 'warning'
                          : 'danger'
                    }
                  >
                    {c.completion}
                  </Badge>
                  <Badge>{c.actualMinutes} min</Badge>
                  <Badge>{'★'.repeat(c.satisfaction)}</Badge>
                  {c.isComeback && <Badge tone="flame">Comeback</Badge>}
                </div>
                <p className="text-fg mt-2 text-sm">{c.whatStudied}</p>
                {c.obstacle !== 'none' && (
                  <p className="text-fg-muted mt-1.5 text-sm">
                    <strong className="text-fg">Blocked by:</strong>{' '}
                    {OBSTACLE_LABELS[c.obstacle] ?? c.obstacle}
                    {c.obstacleNote ? ` — ${c.obstacleNote}` : ''}
                  </p>
                )}
                {c.tomorrowTarget && (
                  <p className="text-fg-muted mt-1.5 text-sm">
                    <strong className="text-fg">Tomorrow:</strong> {c.tomorrowTarget}
                  </p>
                )}
                {c.reflection && (
                  <p className="text-fg-subtle mt-1.5 text-sm italic">“{c.reflection}”</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ---------------------------------------------------- weekly reviews */}
      {detail.reviews.length > 0 && (
        <Card>
          <CardHeader title="Weekly reviews" />
          <ul className="divide-border divide-y">
            {detail.reviews.map((r) => (
              <li key={r.id} className="p-4">
                <p className="text-fg text-sm font-bold">Week of {r.weekStart}</p>
                <dl className="mt-2 space-y-1.5 text-sm">
                  <Row label="Went well" value={r.whatWentWell} />
                  <Row label="Got in the way" value={r.whatStopped} />
                  <Row label="Will change" value={r.whatToChange} />
                  <Row label="Confidence" value={`${r.subjectConfidence}/5`} />
                </dl>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ------------------------------------------------------------ ledger */}
      <Card>
        <CardHeader title="Points ledger" description="Append-only. Corrections are new rows." />
        <ul className="divide-border divide-y">
          {detail.ledger.map((entry) => (
            <li key={entry.id} className="flex items-start justify-between gap-3 px-5 py-2.5">
              <div className="min-w-0">
                <p className="text-fg text-sm font-medium">
                  {POINT_EVENT_LABELS[entry.event] ?? entry.event}
                </p>
                <p className="text-fg-subtle text-xs">
                  {entry.occurredOn}
                  {entry.reason ? ` · ${entry.reason}` : ''}
                </p>
              </div>
              <span
                className={cn(
                  'shrink-0 text-sm font-extrabold tabular-nums',
                  entry.points >= 0 ? 'text-success' : 'text-danger',
                )}
              >
                {entry.points > 0 ? '+' : ''}
                {entry.points}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Sheet open={editOpen} onClose={() => setEditOpen(false)} title="Edit student">
        <EditStudentForm cohortId={cohortId} member={member} onDone={() => setEditOpen(false)} />
      </Sheet>

      <Sheet
        open={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        title="Adjust points"
        description="Recorded as a new, signed ledger entry with your reason. Nothing is rewritten."
      >
        <AdjustPointsForm
          cohortId={cohortId}
          memberId={member.memberId}
          today={today}
          onDone={() => setAdjustOpen(false)}
        />
      </Sheet>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ReactNode;
}) {
  return (
    <Card padding="sm">
      <p className="eyebrow leading-tight">{label}</p>
      <p className="stat-num text-fg mt-2 flex items-center gap-1.5 text-xl">
        {icon}
        {value}
      </p>
      {sub && <p className="text-fg-subtle mt-0.5 text-xs">{sub}</p>}
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd className="text-fg mt-0.5 text-sm">{value}</dd>
    </div>
  );
}

function EditStudentForm({
  cohortId,
  member,
  onDone,
}: {
  cohortId: string;
  member: Detail['member'];
  onDone: () => void;
}) {
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
          const result = await updateStudentAction(cohortId, null, formData);
          if (!result.ok) {
            setMessage(result.message);
            setErrors(result.errors ?? {});
            return;
          }
          toast.success('Student updated');
          onDone();
          router.refresh();
        })
      }
    >
      <input type="hidden" name="userId" value={member.userId} />
      <FormError>{message}</FormError>
      <TextInput
        label="Full name"
        name="fullName"
        defaultValue={member.name}
        required
        error={errors.fullName}
      />
      <TextInput
        label="Email"
        name="email"
        type="email"
        defaultValue={member.email}
        required
        error={errors.email}
      />
      <TextInput label="WhatsApp" name="whatsapp" defaultValue={member.whatsapp ?? ''} />
      <TextInput label="University" name="university" defaultValue={member.university ?? ''} />
      <Select label="MBBS year" name="mbbsYear" defaultValue={member.mbbsYear ?? ''}>
        <option value="">Not set</option>
        {[1, 2, 3, 4, 5].map((y) => (
          <option key={y} value={y}>
            Year {y}
          </option>
        ))}
      </Select>
      <Select label="Role" name="role" defaultValue={member.role}>
        <option value="student">Student</option>
        <option value="admin">Admin</option>
      </Select>
      <Select label="Membership status" name="status" defaultValue={member.status}>
        <option value="active">Active</option>
        <option value="paused">Paused</option>
        <option value="left">Left</option>
      </Select>
      <Button type="submit" size="lg" fullWidth loading={pending}>
        Save changes
      </Button>

      <DeleteStudent cohortId={cohortId} member={member} />
    </form>
  );
}

/**
 * Permanent removal of a student account.
 *
 * Kept visually separate from the save button and gated behind a typed confirmation. The
 * dialog names what is destroyed rather than asking "are you sure", because an admin who
 * only wants to stop counting someone should be reaching for the Left status above instead
 * — and saying so here is the cheapest way to stop the wrong choice.
 */
function DeleteStudent({ cohortId, member }: { cohortId: string; member: Detail['member'] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');

  const matches = confirmation.trim().toLowerCase() === member.name.trim().toLowerCase();

  return (
    <>
      <div className="border-border mt-2 border-t pt-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-danger"
          onClick={() => {
            setConfirmation('');
            setOpen(true);
          }}
        >
          <Trash2 className="size-3.5" aria-hidden />
          Delete this student
        </Button>
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title={`Delete ${member.name}?`}>
        <div className="space-y-5 p-5">
          <div className="border-danger/30 bg-danger/8 rounded-2xl border p-4">
            <p className="text-fg text-sm">
              This permanently deletes their account and everything attached to it — membership,
              both roadmaps, check-ins, attendance and points. It cannot be undone.
            </p>
          </div>

          <p className="text-fg-muted text-sm leading-relaxed">
            If you only want them to stop appearing in cohort metrics, set their membership status
            to <strong className="text-fg">Left</strong> instead and keep the record.
          </p>

          <TextInput
            label={`Type "${member.name}" to confirm`}
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder={member.name}
            autoComplete="off"
          />

          <div className="flex gap-3">
            <Button type="button" variant="ghost" fullWidth onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              fullWidth
              disabled={!matches}
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await deleteStudentAction(cohortId, member.userId);
                  if (!result.ok) {
                    toast.error('Could not delete', result.message);
                    return;
                  }
                  toast.success('Student deleted');
                  router.push('/admin/students');
                  router.refresh();
                })
              }
            >
              Delete permanently
            </Button>
          </div>
        </div>
      </Sheet>
    </>
  );
}

function AdjustPointsForm({
  cohortId,
  memberId,
  today,
  onDone,
}: {
  cohortId: string;
  memberId: string;
  today: string;
  onDone: () => void;
}) {
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
          const result = await adjustPointsAction(cohortId, null, formData);
          if (!result.ok) {
            setMessage(result.message);
            setErrors(result.errors ?? {});
            return;
          }
          toast.success('Adjustment recorded');
          onDone();
          router.refresh();
        })
      }
    >
      <input type="hidden" name="memberId" value={memberId} />
      <FormError>{message}</FormError>
      <TextInput
        label="Points"
        name="points"
        type="number"
        defaultValue="10"
        required
        error={errors.points}
        hint="Positive to add, negative to deduct. Both are recorded."
      />
      <TextInput label="Date" name="date" type="date" defaultValue={today} required />
      <TextArea
        label="Reason"
        name="reason"
        required
        error={errors.reason}
        placeholder="Attended the make-up session on Saturday which was not recorded."
      />
      <Button type="submit" size="lg" fullWidth loading={pending}>
        Record adjustment
      </Button>
    </form>
  );
}
