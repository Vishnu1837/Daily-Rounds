'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SignOutButton } from '@/components/nav/sign-out-button';
import { Card, CardHeader } from '@/components/ui/card';
import { FormError, Select, TextInput } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { PageHeader } from '@/components/ui/page-header';
import { cn } from '@/lib/cn';
import {
  COMPUTED_POINT_EVENTS,
  COMPUTED_POINT_EXPLANATIONS,
  EDITABLE_POINT_EVENTS,
  POINT_EVENT_LABELS,
  type PointRules,
} from '@/lib/domain/points';
import { roomTitle } from '@/lib/domain/study-room';
import type { RiskThresholds } from '@/lib/domain/risk';
import {
  addCalendarDayAction,
  removeCalendarDayAction,
  updateCohortSettingsAction,
  updatePointRulesAction,
} from '@/server/actions/admin';

import { RestartCohortPanel } from './restart-cohort';

const WEEKDAYS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 7, label: 'Sun' },
];

const TIMEZONES = [
  'Asia/Kolkata',
  'Asia/Karachi',
  'Asia/Dhaka',
  'Asia/Colombo',
  'Asia/Dubai',
  'Europe/London',
  'America/New_York',
  'UTC',
];

type Cohort = {
  id: string;
  name: string;
  timezone: string;
  startDate: string;
  endDate: string;
  activeWeekdays: number[];
  streakThresholdPct: number;
  meetUrl: string | null;
  meetTitle: string | null;
  meetStartTime: string;
  meetEndTime: string;
};

type Day = { id: string; date: string; label: string };

export type SweepStatus = {
  /**
   * Minutes since the run started, measured on the *server*.
   *
   * Not a timestamp for the client to subtract from its own clock: this whole body of work
   * exists because timing decisions taken against a browser's idea of the time were wrong,
   * and "has the sweep stopped?" is exactly such a decision. It also keeps the component
   * pure, which is what the React compiler wants of it anyway.
   */
  ageMinutes: number;
  finished: boolean;
  ok: boolean | null;
  affected: Record<string, number>;
  error: string | null;
};

export function SettingsScreen({
  cohort,
  thresholds,
  rules,
  holidays,
  extras,
  sweep,
}: {
  cohort: Cohort;
  thresholds: RiskThresholds;
  rules: PointRules;
  holidays: Day[];
  extras: Day[];
  /** The newest background sweep, or null before one has ever run. */
  sweep: SweepStatus | null | undefined;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | undefined>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [weekdays, setWeekdays] = useState<number[]>(cohort.activeWeekdays);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Configuration"
        title="Cohort settings"
        description="Everything here changes how streaks, consistency and risk are calculated."
      />

      {/* --------------------------------------------------------- cohort */}
      <form
        action={(formData) =>
          startTransition(async () => {
            setMessage(undefined);
            setErrors({});
            const result = await updateCohortSettingsAction(null, formData);
            if (!result.ok) {
              setMessage(result.message);
              setErrors(result.errors ?? {});
              toast.error('Settings not saved', result.message);
              return;
            }
            toast.success('Cohort settings saved');
            router.refresh();
          })
        }
      >
        <input type="hidden" name="cohortId" value={cohort.id} />
        {weekdays.map((d) => (
          <input key={d} type="hidden" name="activeWeekdays" value={d} />
        ))}

        <Card>
          <CardHeader title="The cohort" />
          <div className="space-y-4 p-5 pt-4">
            <FormError>{message}</FormError>
            <TextInput
              label="Name"
              name="name"
              defaultValue={cohort.name}
              required
              error={errors.name}
            />
            <Select label="Timezone" name="timezone" defaultValue={cohort.timezone}>
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replace('_', ' ')}
                </option>
              ))}
            </Select>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextInput
                label="Start date"
                name="startDate"
                type="date"
                defaultValue={cohort.startDate}
                required
                error={errors.startDate}
              />
              <TextInput
                label="End date"
                name="endDate"
                type="date"
                defaultValue={cohort.endDate}
                required
                error={errors.endDate}
              />
            </div>

            <div>
              <p className="text-fg text-sm font-semibold">Active study days</p>
              <p className="text-fg-subtle mt-1 text-sm">
                Days not selected are rest days — they never break a streak or count against
                consistency.
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {WEEKDAYS.map((d) => {
                  const on = weekdays.includes(d.value);
                  return (
                    <button
                      key={d.value}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setWeekdays((prev) =>
                          on ? prev.filter((v) => v !== d.value) : [...prev, d.value].sort(),
                        )
                      }
                      className={cn(
                        'tap h-11 w-14 rounded-xl border text-sm font-bold transition-all active:scale-95',
                        on
                          ? 'border-pulse-500 bg-pulse-600 dark:bg-pulse-500 dark:text-ink-950 text-white'
                          : 'border-border bg-bg-elevated text-fg-muted hover:border-border-strong',
                      )}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
              {weekdays.length === 0 && (
                <p className="text-danger mt-2 text-sm font-medium">Pick at least one day.</p>
              )}
            </div>
          </div>
        </Card>

        <Card className="mt-4">
          <CardHeader title="Study room" description="Students see this on their home screen." />
          <div className="space-y-4 p-5 pt-4">
            <TextInput
              label="Google Meet link"
              name="meetUrl"
              type="url"
              defaultValue={cohort.meetUrl ?? ''}
              error={errors.meetUrl}
              placeholder="https://meet.google.com/abc-defg-hij"
              hint="Changing this here updates it everywhere — no code change needed."
            />
            <TextInput
              label="Room name"
              name="meetTitle"
              defaultValue={cohort.meetTitle ?? ''}
              error={errors.meetTitle}
              placeholder={roomTitle(cohort.meetStartTime)}
              hint="Leave this empty and the room is named after the hour it runs at — morning, afternoon, evening or night — in each student's own timezone."
            />
            <div className="grid grid-cols-2 gap-3">
              <TextInput
                label="Starts"
                name="meetStartTime"
                type="time"
                defaultValue={cohort.meetStartTime}
                required
              />
              <TextInput
                label="Ends"
                name="meetEndTime"
                type="time"
                defaultValue={cohort.meetEndTime}
                required
              />
            </div>
          </div>
        </Card>

        <Card className="mt-4">
          <CardHeader
            title="Cohort streak & risk"
            description="Thresholds that decide who gets flagged."
          />
          <div className="grid gap-4 p-5 pt-4 sm:grid-cols-2">
            <TextInput
              label="Cohort streak threshold (%)"
              name="streakThresholdPct"
              type="number"
              min={1}
              max={100}
              defaultValue={cohort.streakThresholdPct}
              required
              hint="Share of the cohort that must show up to keep the group streak."
            />
            <TextInput
              label="At risk after N missed days"
              name="atRiskMissedDays"
              type="number"
              min={1}
              max={30}
              defaultValue={thresholds.atRiskMissedDays}
              required
            />
            <TextInput
              label="Intervention after N missed days"
              name="interventionMissedDays"
              type="number"
              min={1}
              max={30}
              defaultValue={thresholds.interventionMissedDays}
              required
            />
            <TextInput
              label="Flag a weekly drop of (percentage points)"
              name="atRiskConsistencyDropPct"
              type="number"
              min={1}
              max={100}
              defaultValue={thresholds.atRiskConsistencyDropPct}
              required
            />
            <TextInput
              label="Low participation below (%)"
              name="minConsistencyPct"
              type="number"
              min={0}
              max={100}
              defaultValue={thresholds.minConsistencyPct}
              required
              hint="Measured over the recent window, not all time."
            />
          </div>
          <div className="px-5 pb-5">
            <Button type="submit" size="lg" loading={pending} disabled={weekdays.length === 0}>
              Save cohort settings
            </Button>
          </div>
        </Card>
      </form>

      {/* --------------------------------------------------- point rules */}
      <PointRulesCard cohortId={cohort.id} rules={rules} />

      {/* --------------------------------------------------------- account */}
      <Card>
        <CardHeader title="Your account" />
        <div className="p-5 pt-4">
          <SignOutButton variant="outline" size="lg" />
        </div>
      </Card>

      {/* ------------------------------------------------ calendar overrides */}
      <Card>
        <CardHeader
          title="Holidays & extra study days"
          description="Holidays never break a streak. Extra days turn a weekend into an active study day."
        />
        <div className="space-y-4 p-5 pt-4">
          <AddDayForm cohortId={cohort.id} />

          <div className="grid gap-4 sm:grid-cols-2">
            <DayList
              cohortId={cohort.id}
              title="Cohort holidays"
              tone="iris"
              kind="holiday"
              days={holidays}
            />
            <DayList
              cohortId={cohort.id}
              title="Extra study days"
              tone="pulse"
              kind="extra_study_day"
              days={extras}
            />
          </div>
        </div>
      </Card>

      <SweepPanel sweep={sweep ?? null} />

      <RestartCohortPanel cohortId={cohort.id} cohortName={cohort.name} />
    </div>
  );
}

/**
 * Whether the background sweep is actually running.
 *
 * Its existence is the point. The audit found focus rounds that had been "growing" for three
 * days and study blocks running for a week, and the cause was not a broken sweep — it was
 * that none had ever been scheduled, and nothing in the product could have said so. A job
 * that silently stops is indistinguishable from a cohort with nothing to sweep, unless
 * somewhere shows the last time it ran.
 *
 * Three states, and the middle one is the one worth having: never run (the scheduler is not
 * configured), ran a while ago (it has stopped), ran just now (fine).
 */
function SweepPanel({ sweep }: { sweep: SweepStatus | null }) {
  // The schedule is every 15 minutes; an hour without one has stopped, not slipped.
  const stale = sweep === null || sweep.ageMinutes > 60;
  const failed = sweep !== null && (sweep.ok === false || !sweep.finished);

  return (
    <Card>
      <CardHeader
        title="Background sweep"
        description="Settles focus rounds and study blocks that nobody closed. Runs every 15 minutes."
      />
      <div className="p-5 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          {!sweep ? (
            <Badge tone="danger">Never run</Badge>
          ) : failed ? (
            <Badge tone="danger">Last run failed</Badge>
          ) : stale ? (
            <Badge tone="warning">Last run {formatAge(sweep.ageMinutes)} ago</Badge>
          ) : (
            <Badge tone="success">Ran {formatAge(sweep.ageMinutes)} ago</Badge>
          )}
          {sweep?.ok === true && (
            <span className="text-fg-muted text-sm">
              {sweep.affected.trees_grown ?? 0} rounds settled ·{' '}
              {sweep.affected.sessions_closed ?? 0} study blocks closed
            </span>
          )}
        </div>

        {sweep?.error && (
          <p className="border-danger/30 bg-danger/8 text-fg mt-3 rounded-2xl border p-3.5 text-sm">
            {sweep.error}
          </p>
        )}

        {!sweep && (
          <p className="bg-warning/10 text-fg-muted mt-3 rounded-2xl p-3.5 text-sm leading-relaxed">
            No sweep has ever run. Overdue focus rounds and abandoned study blocks are still tidied
            when a student opens the grove or starts a block, but a student who does not open the
            app is never reached. Set <code>CRON_SECRET</code> on the deployment to switch the
            schedule on — see docs/DEPLOYMENT.md.
          </p>
        )}
      </div>
    </Card>
  );
}

function formatAge(minutes: number): string {
  if (minutes < 1) return 'less than a minute';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)} days`;
}

function PointRulesCard({ cohortId, rules }: { cohortId: string; rules: PointRules }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Record<string, number>>(rules);

  /*
   * The editable set comes from the domain, not from a list maintained here. It used to be
   * a local filter that excluded two events and forgot `achievement` — so the screen showed
   * an Achievement field that saved a number nothing ever read, while the ledger went on
   * paying 10/25/50 by tier. A cohort lead reading this screen was being told about a system
   * that did not exist.
   */
  const editable = EDITABLE_POINT_EVENTS;

  return (
    <Card>
      <CardHeader
        title="Scoring"
        description="Change what each behaviour is worth. Existing ledger entries are never rewritten."
      />
      <div className="p-5 pt-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {editable.map((key) => (
            <TextInput
              key={key}
              label={POINT_EVENT_LABELS[key]}
              type="number"
              min={0}
              max={500}
              value={draft[key] ?? 0}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, [key]: Number(e.target.value) || 0 }))
              }
            />
          ))}
        </div>
        <p className="bg-bg-sunken text-fg-muted mt-4 rounded-2xl p-3.5 text-sm">
          Quiz points are deliberately excluded from the consistency calculation, so raising them
          cannot let quiz performance overtake showing up.
        </p>

        <div className="border-border mt-5 border-t pt-4">
          <p className="eyebrow">Set automatically</p>
          <p className="text-fg-muted mt-1.5 text-sm">
            These are worked out when the award is made, so they have no single value to set here.
            The ledger and the student&rsquo;s own points page both use exactly these rules.
          </p>
          <ul className="mt-3 space-y-2">
            {COMPUTED_POINT_EVENTS.map((event) => (
              <li key={event} className="flex flex-col gap-0.5">
                <span className="text-fg text-sm font-semibold">{POINT_EVENT_LABELS[event]}</span>
                <span className="text-fg-subtle text-sm">{COMPUTED_POINT_EXPLANATIONS[event]}</span>
              </li>
            ))}
          </ul>
        </div>
        <Button
          className="mt-4"
          size="lg"
          loading={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await updatePointRulesAction(cohortId, draft);
              if (!result.ok) {
                toast.error('Could not save scoring', result.message);
                return;
              }
              toast.success('Scoring updated', 'New awards use these values from now on.');
              router.refresh();
            })
          }
        >
          Save scoring
        </Button>
      </div>
    </Card>
  );
}

function AddDayForm({ cohortId }: { cohortId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | undefined>();

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      action={(formData) =>
        startTransition(async () => {
          setMessage(undefined);
          const result = await addCalendarDayAction(null, formData);
          if (!result.ok) {
            setMessage(result.message);
            return;
          }
          toast.success('Calendar updated', 'Streaks and consistency have been recalculated.');
          router.refresh();
        })
      }
    >
      <input type="hidden" name="cohortId" value={cohortId} />
      <TextInput label="Date" name="date" type="date" required className="w-auto" />
      <TextInput
        label="Label"
        name="label"
        required
        placeholder="Diwali"
        className="min-w-[10rem] flex-1"
      />
      <Select label="Type" name="kind" defaultValue="holiday" className="w-auto">
        <option value="holiday">Holiday (no study day)</option>
        <option value="extra_study_day">Extra study day</option>
      </Select>
      <Button type="submit" size="md" loading={pending}>
        Add
      </Button>
      {message && <FormError>{message}</FormError>}
    </form>
  );
}

function DayList({
  cohortId,
  title,
  tone,
  kind,
  days,
}: {
  cohortId: string;
  title: string;
  tone: 'iris' | 'pulse';
  kind: 'holiday' | 'extra_study_day';
  days: Day[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  return (
    <div>
      <h3 className="eyebrow">{title}</h3>
      {days.length === 0 ? (
        <p className="text-fg-subtle mt-2 text-sm">None set.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {days.map((d) => (
            <li key={d.id} className="bg-bg-sunken flex items-center gap-2 rounded-xl px-3 py-2">
              <Badge tone={tone}>{d.date}</Badge>
              <span className="text-fg min-w-0 flex-1 truncate text-sm">{d.label}</span>
              <button
                type="button"
                disabled={pending}
                aria-label={`Remove ${d.label}`}
                onClick={() =>
                  startTransition(async () => {
                    const result = await removeCalendarDayAction(cohortId, d.id, kind);
                    if (!result.ok) {
                      toast.error('Could not remove', result.message);
                      return;
                    }
                    toast.success('Removed', 'Metrics recalculated.');
                    router.refresh();
                  })
                }
                className="tap text-fg-subtle hover:bg-danger/10 hover:text-danger grid size-7 shrink-0 place-items-center rounded-lg disabled:opacity-40"
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
