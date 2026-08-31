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
  applyRoadmapTemplateAction,
  bulkAssignAction,
  createRoadmapAction,
  deleteTopicAction,
  reorderTopicsAction,
  setAssignmentAction,
  updateTopicAction,
} from '@/server/actions/admin';

type TemplateOption = {
  key: string;
  title: string;
  track: string;
  subject: string;
  source: 'curated' | 'curriculum';
  weekCount: number;
  topicCount: number;
};

type RoadmapRow = {
  roadmapId: string;
  roadmapTitle: string;
  track: string | null;
  subjectId: string;
  subjectName: string;
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
  templates,
  assignments,
}: {
  cohortId: string;
  today: string;
  date: string;
  students: Student[];
  selectedMemberId: string | null;
  roadmapRows: RoadmapRow[];
  subjects: { id: string; name: string; slug: string }[];
  templates: TemplateOption[];
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
        subjectId: string;
        subjectName: string;
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
          subjectId: row.subjectId,
          subjectName: row.subjectName,
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
    return [...map.values()];
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

          {roadmaps.length === 0 ? (
            <Card>
              <EmptyState
                icon={<MapIcon className="size-6" aria-hidden />}
                title="No roadmap yet"
                description="Apply a curated template to get this student started, then edit it freely."
              />
              <div className="px-5 pb-5">
                <ApplyTemplateForm
                  cohortId={cohortId}
                  memberId={selectedMemberId}
                  templates={templates}
                  subjects={subjects}
                />
              </div>
            </Card>
          ) : (
            roadmaps.map((roadmap) => (
              <RoadmapEditor key={roadmap.id} cohortId={cohortId} roadmap={roadmap} />
            ))
          )}

          {selectedMemberId && roadmaps.length > 0 && (
            <Card className="p-5">
              <CardHeader title="Add another roadmap" className="p-0" />
              <NewRoadmapForm cohortId={cohortId} memberId={selectedMemberId} subjects={subjects} />
            </Card>
          )}
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
  roadmap,
}: {
  cohortId: string;
  roadmap: {
    id: string;
    title: string;
    track: string | null;
    subjectName: string;
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
        description={roadmap.track ?? roadmap.title}
        action={
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setWeekOpen(true)}>
              Add week
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="size-3.5" aria-hidden />
              Topic
            </Button>
          </div>
        }
      />

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
 * Template picker.
 *
 * There are ~140 templates once the curriculum sections are counted, so a single flat
 * <select> would be unusable. Picking the subject first cuts the list to the handful of
 * tracks that actually belong to it, which is also the order the admin thinks in.
 */
function ApplyTemplateForm({
  cohortId,
  memberId,
  templates,
  subjects,
}: {
  cohortId: string;
  memberId: string | null;
  templates: TemplateOption[];
  subjects: { id: string; name: string; slug: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const subjectSlugs = useMemo(
    () => subjects.filter((s) => templates.some((t) => t.subject === s.slug)),
    [subjects, templates],
  );
  const [subjectSlug, setSubjectSlug] = useState(subjectSlugs[0]?.slug ?? '');

  const forSubject = useMemo(
    () => templates.filter((t) => t.subject === subjectSlug),
    [templates, subjectSlug],
  );
  const [templateKey, setTemplateKey] = useState(forSubject[0]?.key ?? '');

  const template = forSubject.find((t) => t.key === templateKey) ?? forSubject[0];
  const subject = subjects.find((s) => s.slug === subjectSlug);

  if (!memberId) return null;

  return (
    <div className="space-y-3">
      <Select
        label="Subject"
        value={subjectSlug}
        onChange={(e) => {
          const next = e.target.value;
          setSubjectSlug(next);
          setTemplateKey(templates.find((t) => t.subject === next)?.key ?? '');
        }}
      >
        {subjectSlugs.map((s) => (
          <option key={s.slug} value={s.slug}>
            {s.name}
          </option>
        ))}
      </Select>

      <Select
        label="Track"
        value={template?.key ?? ''}
        onChange={(e) => setTemplateKey(e.target.value)}
      >
        {forSubject.map((t) => (
          <option key={t.key} value={t.key}>
            {t.track}
            {t.source === 'curated' ? ' (curated)' : ''}
          </option>
        ))}
      </Select>

      {template && (
        <p className="text-fg-muted text-xs">
          {template.weekCount} {template.weekCount === 1 ? 'week' : 'weeks'} · {template.topicCount}{' '}
          topics
          {template.source === 'curriculum' && ' · straight from the MBBS curriculum'}
        </p>
      )}

      <Button
        size="lg"
        fullWidth
        loading={pending}
        disabled={!subject || !template}
        onClick={() =>
          startTransition(async () => {
            const result = await applyRoadmapTemplateAction(
              cohortId,
              memberId,
              template!.key,
              subject!.id,
            );
            if (!result.ok) {
              toast.error('Could not apply template', result.message);
              return;
            }
            toast.success('Roadmap created', 'Every topic is editable from here.');
            router.refresh();
          })
        }
      >
        Apply template
      </Button>
    </div>
  );
}

function NewRoadmapForm({
  cohortId,
  memberId,
  subjects,
}: {
  cohortId: string;
  memberId: string;
  subjects: { id: string; name: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="mt-4 space-y-3"
      action={(formData) =>
        startTransition(async () => {
          const result = await createRoadmapAction(cohortId, null, formData);
          if (!result.ok) {
            toast.error('Could not create roadmap', result.message);
            return;
          }
          toast.success('Roadmap created');
          router.refresh();
        })
      }
    >
      <input type="hidden" name="memberId" value={memberId} />
      <Select label="Subject" name="subjectId" required>
        {subjects.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>
      <TextInput label="Title" name="title" required placeholder="Pharmacology — CNS module" />
      <TextInput label="Track (optional)" name="track" placeholder="CNS Pharmacology" />
      <Button type="submit" size="md" loading={pending}>
        Create roadmap
      </Button>
    </form>
  );
}
