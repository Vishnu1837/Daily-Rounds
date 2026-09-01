'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronUp, Map as MapIcon, Pencil, Plus, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, SectionTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { FormError, Select, TextArea, TextInput } from '@/components/ui/form';
import { ProgressBar } from '@/components/ui/progress';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { PageHeader } from '@/components/ui/page-header';
import { Segmented } from '@/components/ui/segmented';
import { cn } from '@/lib/cn';
import {
  addRoadmapWeekAction,
  addTopicAction,
  bulkAssignAction,
  deleteRoadmapAction,
  deleteTopicAction,
  generateRoadmapAction,
  resetRoadmapAction,
  reorderTopicsAction,
  setAssignmentAction,
  updateTopicAction,
} from '@/server/actions/admin';

type RoadmapRow = {
  roadmapId: string;
  roadmapTitle: string;
  track: string | null;
  slot: 'primary' | 'secondary';
  subjectId: string;
  subjectName: string;
  subjectSlug: string;
  weekId: string | null;
  weekNumber: number | null;
  weekTitle: string | null;
  topicId: string | null;
  topicTitle: string | null;
  topicDescription: string | null;
  topicStatus: 'upcoming' | 'in_progress' | 'completed' | null;
  estimatedMinutes: number | null;
  position: number | null;
};

type Assignment = {
  memberId: string;
  name: string;
  assignmentId: string | null;
  topicId: string | null;
  topicTitle: string | null;
  plannedMinutes: number | null;
  note: string | null;
};

type Student = {
  memberId: string;
  name: string;
  roadmapPct: number;
  subjectName: string | null;
};

export function RoadmapAdminScreen({
  cohortId,
  today,
  date,
  students,
  selectedMemberId,
  roadmapRows,
  subjects,
  assignments,
}: {
  cohortId: string;
  today: string;
  date: string;
  students: Student[];
  selectedMemberId: string | null;
  roadmapRows: RoadmapRow[];
  subjects: { id: string; name: string; slug: string }[];
  assignments: Assignment[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<'assign' | 'build'>('assign');

  const selected = students.find((s) => s.memberId === selectedMemberId) ?? null;

  const roadmaps = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string;
        title: string;
        track: string | null;
        slot: 'primary' | 'secondary';
        subjectId: string;
        subjectName: string;
        subjectSlug: string;
        weeks: { id: string | null; number: number; title: string }[];
        topics: {
          id: string;
          title: string;
          description: string | null;
          status: string;
          minutes: number;
          weekId: string | null;
          position: number;
        }[];
      }
    >();

    for (const row of roadmapRows) {
      let r = map.get(row.roadmapId);
      if (!r) {
        r = {
          id: row.roadmapId,
          title: row.roadmapTitle,
          track: row.track,
          slot: row.slot,
          subjectId: row.subjectId,
          subjectName: row.subjectName,
          subjectSlug: row.subjectSlug,
          weeks: [],
          topics: [],
        };
        map.set(row.roadmapId, r);
      }
      if (row.weekId && !r.weeks.some((w) => w.id === row.weekId)) {
        r.weeks.push({ id: row.weekId, number: row.weekNumber ?? 0, title: row.weekTitle ?? '' });
      }
      if (row.topicId) {
        r.topics.push({
          id: row.topicId,
          title: row.topicTitle!,
          description: row.topicDescription,
          status: row.topicStatus!,
          minutes: row.estimatedMinutes!,
          weekId: row.weekId,
          position: row.position ?? 0,
        });
      }
    }

    for (const r of map.values()) {
      r.weeks.sort((a, b) => a.number - b.number);
      r.topics.sort((a, b) => a.position - b.position);
    }
    // Primary slot always renders first, whatever order the rows arrived in.
    return [...map.values()].sort((a, b) =>
      a.slot === b.slot ? 0 : a.slot === 'primary' ? -1 : 1,
    );
  }, [roadmapRows]);

  const unassigned = assignments.filter((a) => !a.topicId).length;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="The plan"
        title="Roadmaps & assignments"
        description="Every student has their own roadmap. Assign topics in bulk or one at a time."
      />

      <Segmented
        ariaLabel="Roadmap view"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'assign', label: 'Daily assignments' },
          { value: 'build', label: 'Build roadmaps' },
        ]}
      />

      {tab === 'assign' ? (
        <>
          <Card className="p-5">
            <CardHeader
              title="Assign today's topics"
              description="Gives every active student the next uncompleted topic on their own roadmap."
              className="p-0"
            />
            <form
              className="mt-4 flex flex-wrap items-end gap-3"
              action={(formData) =>
                startTransition(async () => {
                  const result = await bulkAssignAction(null, formData);
                  if (!result.ok) {
                    toast.error('Could not assign topics', result.message);
                    return;
                  }
                  toast.success(
                    'Topics assigned',
                    `${result.data.assigned} students now have a topic for ${date}`,
                  );
                  router.refresh();
                })
              }
            >
              <input type="hidden" name="cohortId" value={cohortId} />
              <input type="hidden" name="strategy" value="next_topic" />
              <TextInput
                label="Date"
                name="date"
                type="date"
                defaultValue={date}
                className="w-auto"
              />
              <TextInput
                label="Planned minutes"
                name="plannedMinutes"
                type="number"
                defaultValue="90"
                min={5}
                max={720}
                className="w-32"
              />
              <Button type="submit" size="md" loading={pending}>
                Assign next topic to everyone
              </Button>
            </form>
          </Card>

          <SectionTitle
            action={
              <a
                href={`/admin/roadmaps?date=${today}`}
                className="text-pulse-700 dark:text-pulse-400 text-sm font-semibold"
              >
                Today
              </a>
            }
          >
            Assignments for {date}
            {unassigned > 0 ? ` · ${unassigned} without a topic` : ''}
          </SectionTitle>

          <Card className="divide-border divide-y p-0">
            {assignments.map((a) => (
              <AssignmentRow key={a.memberId} cohortId={cohortId} date={date} assignment={a} />
            ))}
          </Card>
        </>
      ) : (
        <>
          <Card className="p-5">
            <label htmlFor="member-picker" className="text-fg block text-sm font-semibold">
              Student
            </label>
            <select
              id="member-picker"
              value={selectedMemberId ?? ''}
              onChange={(e) => router.push(`/admin/roadmaps?member=${e.target.value}`)}
              className="border-border bg-bg-elevated text-fg mt-1.5 w-full rounded-2xl border px-4 py-3"
            >
              {students.map((s) => (
                <option key={s.memberId} value={s.memberId}>
                  {s.name} — {s.subjectName ?? 'no subject'} ({s.roadmapPct}%)
                </option>
              ))}
            </select>
            {selected && (
              <ProgressBar
                value={selected.roadmapPct}
                tone="iris"
                className="mt-4"
                label="Roadmap progress"
              />
            )}
          </Card>

          {/*
            Exactly two slots, always both shown. Rendering the empty one as a picker rather
            than hiding it is what makes "maximum two active subjects" legible: an admin can
            see at a glance that a student has a free slot, and fill it without hunting for
            an "add" button.
          */}
          {selectedMemberId &&
            (['primary', 'secondary'] as const).map((slot) => {
              const roadmap = roadmaps.find((r) => r.slot === slot) ?? null;
              const other = roadmaps.find((r) => r.slot !== slot) ?? null;

              if (roadmap) {
                return (
                  <RoadmapEditor
                    key={slot}
                    cohortId={cohortId}
                    memberId={selectedMemberId}
                    roadmap={roadmap}
                    subjects={subjects}
                    otherSlotSubject={other?.subjectSlug ?? null}
                  />
                );
              }

              return (
                <Card key={slot}>
                  <EmptyState
                    icon={<MapIcon className="size-6" aria-hidden />}
                    title={slot === 'primary' ? 'No primary subject' : 'No secondary subject'}
                    description="Pick a subject and the roadmap is generated from the master syllabus, in teaching order."
                  />
                  <div className="px-5 pb-5">
                    <AssignSubjectForm
                      cohortId={cohortId}
                      memberId={selectedMemberId}
                      slot={slot}
                      subjects={subjects}
                      otherSlotSubject={other?.subjectSlug ?? null}
                    />
                  </div>
                </Card>
              );
            })}
        </>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- pieces */

function AssignmentRow({
  cohortId,
  date,
  assignment,
}: {
  cohortId: string;
  date: string;
  assignment: Assignment;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <div className="flex items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="text-fg truncate text-sm font-bold">{assignment.name}</p>
          <p className="text-fg-muted truncate text-xs">
            {assignment.topicTitle ?? 'No topic assigned'}
            {assignment.plannedMinutes ? ` · ${assignment.plannedMinutes} min` : ''}
          </p>
        </div>
        {!assignment.topicId && <Badge tone="warning">Unassigned</Badge>}
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
          <Pencil className="size-3.5" aria-hidden />
          Edit
        </Button>
      </div>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={`${assignment.name} · ${date}`}
        size="sm"
      >
        <form
          className="space-y-4 pt-2"
          action={(formData) =>
            startTransition(async () => {
              const result = await setAssignmentAction(cohortId, null, formData);
              if (!result.ok) {
                toast.error('Could not save', result.message);
                return;
              }
              toast.success('Assignment saved');
              setOpen(false);
              router.refresh();
            })
          }
        >
          <input type="hidden" name="memberId" value={assignment.memberId} />
          <input type="hidden" name="date" value={date} />
          <TextInput
            label="Planned minutes"
            name="plannedMinutes"
            type="number"
            defaultValue={assignment.plannedMinutes ?? 90}
            min={5}
            max={720}
            required
          />
          <TextArea
            label="Note for the student (optional)"
            name="note"
            defaultValue={assignment.note ?? ''}
            placeholder="Focus on the mediator table — that is what the viva asks about."
          />
          <p className="text-fg-subtle text-sm">
            The topic itself comes from this student&apos;s roadmap. Use “Assign next topic to
            everyone” to advance it, or edit their roadmap directly.
          </p>
          <Button type="submit" size="lg" fullWidth loading={pending}>
            Save assignment
          </Button>
        </form>
      </Sheet>
    </>
  );
}

function RoadmapEditor({
  cohortId,
  memberId,
  roadmap,
  subjects,
  otherSlotSubject,
}: {
  cohortId: string;
  memberId: string;
  subjects: { id: string; name: string; slug: string }[];
  /** The subject in the student's other slot — excluded from this slot's picker. */
  otherSlotSubject: string | null;
  roadmap: {
    id: string;
    title: string;
    track: string | null;
    slot: 'primary' | 'secondary';
    subjectName: string;
    subjectSlug: string;
    weeks: { id: string | null; number: number; title: string }[];
    topics: {
      id: string;
      title: string;
      description: string | null;
      status: string;
      minutes: number;
      weekId: string | null;
    }[];
  };
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<(typeof roadmap.topics)[number] | null>(null);
  const [weekOpen, setWeekOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const completed = roadmap.topics.filter((t) => t.status === 'completed').length;

  const order = roadmap.topics.map((t) => t.id);

  function move(index: number, delta: number) {
    const next = [...order];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    startTransition(async () => {
      const result = await reorderTopicsAction(cohortId, roadmap.id, next);
      if (!result.ok) {
        toast.error('Could not reorder', result.message);
        return;
      }
      router.refresh();
    });
  }

  function remove(topicId: string) {
    startTransition(async () => {
      const result = await deleteTopicAction(cohortId, roadmap.id, topicId);
      if (!result.ok) {
        toast.error('Could not delete', result.message);
        return;
      }
      toast.success('Topic removed');
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader
        title={roadmap.subjectName}
        description={`${roadmap.slot === 'primary' ? 'Primary' : 'Secondary'} · ${completed}/${roadmap.topics.length} topics done`}
        action={
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setManageOpen(true)}>
              Manage
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="size-3.5" aria-hidden />
              Topic
            </Button>
          </div>
        }
      />

      {/*
        Reset, replace and delete live together behind one "Manage" sheet rather than as
        three buttons in the header. They are the destructive operations on a student's
        work, and putting them one deliberate tap away is the friction the brief asks for.
      */}
      <Sheet
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        title={`Manage ${roadmap.subjectName}`}
      >
        <div className="space-y-6 p-5">
          <div>
            <SectionTitle>Replace this subject</SectionTitle>
            <p className="text-fg-muted mt-1 mb-3 text-xs">
              Generates a new roadmap in the {roadmap.slot} slot. The student’s other subject is
              untouched.
            </p>
            <AssignSubjectForm
              cohortId={cohortId}
              memberId={memberId}
              slot={roadmap.slot}
              subjects={subjects}
              occupiedBy={roadmap.subjectName}
              otherSlotSubject={otherSlotSubject}
            />
          </div>

          <div className="border-border border-t pt-5">
            <SectionTitle>Danger zone</SectionTitle>
            <div className="mt-3 space-y-2">
              <Button
                variant="outline"
                fullWidth
                loading={pending}
                onClick={() => setConfirmReset(true)}
              >
                Reset progress ({completed} completed)
              </Button>
              <Button variant="danger" fullWidth onClick={() => setConfirmDelete(true)}>
                <Trash2 className="size-3.5" aria-hidden />
                Delete roadmap
              </Button>
            </div>
          </div>

          <div>
            <Button variant="ghost" fullWidth onClick={() => setWeekOpen(true)}>
              Add a week manually
            </Button>
          </div>
        </div>
      </Sheet>

      <Sheet
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title={`Reset ${roadmap.subjectName} progress?`}
      >
        <div className="space-y-4 p-5">
          <p className="text-fg-muted text-sm">
            Every topic goes back to upcoming and the student starts this subject from the
            beginning. The topic list itself is kept, and their other subject is unaffected.
          </p>
          <div className="flex gap-3">
            <Button variant="ghost" fullWidth onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              fullWidth
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await resetRoadmapAction(cohortId, roadmap.id);
                  if (!result.ok) {
                    toast.error('Could not reset', result.message);
                    return;
                  }
                  setConfirmReset(false);
                  setManageOpen(false);
                  toast.success('Progress reset');
                  router.refresh();
                })
              }
            >
              Reset progress
            </Button>
          </div>
        </div>
      </Sheet>

      <Sheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete the ${roadmap.subjectName} roadmap?`}
      >
        <div className="space-y-4 p-5">
          <p className="text-fg-muted text-sm">
            This removes the roadmap and all {roadmap.topics.length} of its topics, including the{' '}
            {completed} already completed. The {roadmap.slot} slot becomes free, so you can generate
            a new subject straight afterwards.
          </p>
          <div className="flex gap-3">
            <Button variant="ghost" fullWidth onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              fullWidth
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await deleteRoadmapAction(cohortId, roadmap.id);
                  if (!result.ok) {
                    toast.error('Could not delete', result.message);
                    return;
                  }
                  setConfirmDelete(false);
                  setManageOpen(false);
                  toast.success('Roadmap deleted', 'The slot is free for a new subject.');
                  router.refresh();
                })
              }
            >
              Delete roadmap
            </Button>
          </div>
        </div>
      </Sheet>

      <ul className="divide-border mt-3 divide-y">
        {roadmap.topics.map((topic, i) => {
          const week = roadmap.weeks.find((w) => w.id === topic.weekId);
          return (
            <li key={topic.id} className="flex items-center gap-2 px-5 py-3">
              <div className="flex flex-col">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0 || pending}
                  aria-label={`Move ${topic.title} up`}
                  className="tap text-fg-subtle hover:bg-bg-sunken hover:text-fg grid size-6 place-items-center rounded disabled:opacity-30"
                >
                  <ChevronUp className="size-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === roadmap.topics.length - 1 || pending}
                  aria-label={`Move ${topic.title} down`}
                  className="tap text-fg-subtle hover:bg-bg-sunken hover:text-fg grid size-6 place-items-center rounded disabled:opacity-30"
                >
                  <ChevronDown className="size-3.5" aria-hidden />
                </button>
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-fg truncate text-sm font-semibold">{topic.title}</p>
                <p className="text-fg-subtle truncate text-xs">
                  {week ? `Week ${week.number} · ` : ''}
                  {topic.minutes} min
                </p>
              </div>

              <Badge
                tone={
                  topic.status === 'completed'
                    ? 'success'
                    : topic.status === 'in_progress'
                      ? 'pulse'
                      : 'neutral'
                }
              >
                {topic.status.replace('_', ' ')}
              </Badge>

              <button
                type="button"
                onClick={() => setEditing(topic)}
                aria-label={`Edit ${topic.title}`}
                className="tap text-fg-subtle hover:bg-bg-sunken hover:text-fg grid size-8 place-items-center rounded-lg"
              >
                <Pencil className="size-3.5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => remove(topic.id)}
                aria-label={`Delete ${topic.title}`}
                className="tap text-fg-subtle hover:bg-danger/10 hover:text-danger grid size-8 place-items-center rounded-lg"
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>

      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title="Add topic" size="sm">
        <TopicForm
          cohortId={cohortId}
          roadmapId={roadmap.id}
          weeks={roadmap.weeks}
          onDone={() => setAddOpen(false)}
        />
      </Sheet>

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title="Edit topic" size="sm">
        {editing && (
          <TopicForm
            cohortId={cohortId}
            roadmapId={roadmap.id}
            weeks={roadmap.weeks}
            topic={editing}
            onDone={() => setEditing(null)}
          />
        )}
      </Sheet>

      <Sheet open={weekOpen} onClose={() => setWeekOpen(false)} title="Add a week" size="sm">
        <form
          className="space-y-4 pt-2"
          action={(formData) =>
            startTransition(async () => {
              const result = await addRoadmapWeekAction(cohortId, null, formData);
              if (!result.ok) {
                toast.error('Could not add week', result.message);
                return;
              }
              toast.success('Week added');
              setWeekOpen(false);
              router.refresh();
            })
          }
        >
          <input type="hidden" name="roadmapId" value={roadmap.id} />
          <TextInput
            label="Week number"
            name="weekNumber"
            type="number"
            min={1}
            max={52}
            defaultValue={roadmap.weeks.length + 1}
            required
          />
          <TextInput
            label="Title"
            name="title"
            required
            placeholder="Inflammation, Healing & Haemodynamics"
          />
          <Button type="submit" size="lg" fullWidth loading={pending}>
            Add week
          </Button>
        </form>
      </Sheet>
    </Card>
  );
}

function TopicForm({
  cohortId,
  roadmapId,
  weeks,
  topic,
  onDone,
}: {
  cohortId: string;
  roadmapId: string;
  weeks: { id: string | null; number: number; title: string }[];
  topic?: {
    id: string;
    title: string;
    description: string | null;
    minutes: number;
    weekId: string | null;
  };
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
          const result = topic
            ? await updateTopicAction(cohortId, null, formData)
            : await addTopicAction(cohortId, null, formData);
          if (!result.ok) {
            setMessage(result.message);
            setErrors(result.errors ?? {});
            return;
          }
          toast.success(topic ? 'Topic updated' : 'Topic added');
          onDone();
          router.refresh();
        })
      }
    >
      <input type="hidden" name="roadmapId" value={roadmapId} />
      {topic && <input type="hidden" name="topicId" value={topic.id} />}
      <FormError>{message}</FormError>
      <TextInput
        label="Title"
        name="title"
        defaultValue={topic?.title ?? ''}
        required
        error={errors.title}
      />
      <TextArea
        label="Description (optional)"
        name="description"
        defaultValue={topic?.description ?? ''}
      />
      <Select label="Week" name="weekId" defaultValue={topic?.weekId ?? ''}>
        <option value="">Unscheduled</option>
        {weeks.map((w) => (
          <option key={w.id ?? ''} value={w.id ?? ''}>
            Week {w.number} — {w.title}
          </option>
        ))}
      </Select>
      <TextInput
        label="Estimated minutes"
        name="estimatedMinutes"
        type="number"
        min={5}
        max={720}
        defaultValue={topic?.minutes ?? 90}
        required
      />
      <Button type="submit" size="lg" fullWidth loading={pending}>
        {topic ? 'Save topic' : 'Add topic'}
      </Button>
    </form>
  );
}

/**
 * Subject picker for one roadmap slot.
 *
 * There is no template list any more. The master syllabus already holds every subject's
 * modules and topics in teaching order, so choosing the subject is the entire decision —
 * which is also the only way the brief's "syllabus is the single source of truth" rule can
 * hold. Regenerating an occupied slot is destructive, so it asks first.
 */
function AssignSubjectForm({
  cohortId,
  memberId,
  slot,
  subjects,
  occupiedBy,
  otherSlotSubject,
}: {
  cohortId: string;
  memberId: string | null;
  slot: 'primary' | 'secondary';
  subjects: { id: string; name: string; slug: string }[];
  /** Subject currently in this slot, when replacing rather than filling an empty one. */
  occupiedBy?: string | null;
  /** Subject in the student's other slot — never offered, to avoid a duplicate roadmap. */
  otherSlotSubject?: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  const available = useMemo(
    () => subjects.filter((s) => s.slug !== otherSlotSubject),
    [subjects, otherSlotSubject],
  );
  const [subjectSlug, setSubjectSlug] = useState(available[0]?.slug ?? '');

  if (!memberId) return null;

  const chosen = available.find((s) => s.slug === subjectSlug);

  function run() {
    startTransition(async () => {
      const result = await generateRoadmapAction(cohortId, memberId!, slot, subjectSlug);
      if (!result.ok) {
        toast.error('Could not generate roadmap', result.message);
        return;
      }
      setConfirming(false);
      toast.success(
        occupiedBy ? `Switched to ${chosen?.name}` : `${chosen?.name} roadmap created`,
        'Built from the master syllabus, in teaching order.',
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <Select
        label={slot === 'primary' ? 'Primary subject' : 'Secondary subject'}
        value={subjectSlug}
        onChange={(e) => setSubjectSlug(e.target.value)}
      >
        {available.map((s) => (
          <option key={s.slug} value={s.slug}>
            {s.name}
          </option>
        ))}
      </Select>

      <p className="text-fg-muted text-xs">
        Modules and topics come straight from the MBBS syllabus — nothing to type.
      </p>

      <Button
        size="lg"
        fullWidth
        variant={occupiedBy ? 'danger' : 'primary'}
        loading={pending}
        disabled={!chosen}
        onClick={() => (occupiedBy ? setConfirming(true) : run())}
      >
        {occupiedBy ? `Replace ${occupiedBy}` : 'Generate roadmap'}
      </Button>

      <Sheet
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Change ${occupiedBy} to ${chosen?.name}?`}
      >
        <div className="space-y-4 p-5">
          <p className="text-fg-muted text-sm">
            This student has progress in {occupiedBy}. Replacing this active subject will reset the{' '}
            {occupiedBy} roadmap progress. Their other active subject stays exactly as it is.
          </p>
          <div className="flex gap-3">
            <Button variant="ghost" fullWidth onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button variant="danger" fullWidth loading={pending} onClick={run}>
              Reset {occupiedBy} &amp; switch
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
