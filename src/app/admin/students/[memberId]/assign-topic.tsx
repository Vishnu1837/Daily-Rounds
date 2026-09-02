'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ListTree, Search } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { Select, TextInput } from '@/components/ui/form';
import { ProgressBar } from '@/components/ui/progress';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import { assignIndividualTopicAction } from '@/server/actions/admin';
import type { StudentTopicPlan, TopicPlanTopic } from '@/server/queries/admin';

const STATUS_LABELS: Record<TopicPlanTopic['status'], string> = {
  upcoming: 'Not started',
  in_progress: 'Current',
  completed: 'Completed',
};

/**
 * Manage topics — the admin-only half of "which topic is this student on?".
 *
 * The panel states the current position for each subject *before* offering to change it,
 * because the mistake this feature invites is reassigning a student who was already where
 * they should be. Everything below the summary is one flow: pick a subject, browse or search
 * its modules, choose a topic, confirm in words that name the student and the topic.
 */
export function ManageTopicsPanel({
  cohortId,
  memberId,
  studentName,
  plan,
}: {
  cohortId: string;
  memberId: string;
  studentName: string;
  plan: StudentTopicPlan;
}) {
  const [open, setOpen] = useState(false);

  const today = plan.subjects
    .flatMap((s) =>
      s.modules.flatMap((m) => m.topics.map((t) => ({ ...t, subject: s.subjectName }))),
    )
    .find((t) => t.isToday);

  return (
    <Card>
      <CardHeader
        title="Topics"
        icon={<ListTree className="text-fg-subtle size-4" aria-hidden />}
        description="Where this student is in each of their subjects, and what they are studying today."
        action={
          <Button
            size="sm"
            variant="outline"
            onClick={() => setOpen(true)}
            disabled={plan.subjects.length === 0}
          >
            Assign individual topic
          </Button>
        }
      />

      <div className="space-y-3 p-5">
        <div className="rounded-panel bg-bg-sunken p-4">
          <p className="eyebrow">Today&apos;s topic</p>
          {today ? (
            <>
              <p className="text-fg mt-1 text-sm font-bold">{today.title}</p>
              <p className="text-fg-subtle mt-0.5 text-xs">
                {today.subject}
                {plan.todaySource === 'admin' ? ' · assigned by an admin' : ''}
              </p>
            </>
          ) : (
            <p className="text-fg-muted mt-1 text-sm">
              Nothing assigned for {plan.date}. Assign a topic below, or use the bulk action on the
              roadmaps screen.
            </p>
          )}
        </div>

        {plan.subjects.length === 0 ? (
          <EmptyState
            icon={<ListTree className="size-6" aria-hidden />}
            title="No subjects yet"
            description="Give this student a subject on the roadmaps screen and their syllabus appears here."
          />
        ) : (
          plan.subjects.map((subject) => (
            <div key={subject.roadmapId} className="rounded-panel border-border border p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-fg text-sm font-bold">
                  {subject.subjectName}
                  <Badge
                    tone={subject.slot === 'primary' ? 'pulse' : 'iris'}
                    size="sm"
                    className="ml-2"
                  >
                    {subject.slot}
                  </Badge>
                </p>
                <p className="text-fg-subtle text-xs">
                  {subject.completed}/{subject.total} topics done
                </p>
              </div>
              <p className="text-fg-muted mt-1.5 text-sm">
                Current topic:{' '}
                <span className="text-fg font-semibold">
                  {subject.current ? subject.current.title : 'everything is complete'}
                </span>
              </p>
              {subject.current && (
                <p className="text-fg-subtle mt-0.5 text-xs">
                  Position {subject.current.position + 1} of {subject.total} in the syllabus
                </p>
              )}
              <ProgressBar
                value={
                  subject.total === 0 ? 0 : Math.round((subject.completed / subject.total) * 100)
                }
                tone="iris"
                className="mt-3"
              />
            </div>
          ))
        )}
      </div>

      <AssignTopicSheet
        open={open}
        onClose={() => setOpen(false)}
        cohortId={cohortId}
        memberId={memberId}
        studentName={studentName}
        plan={plan}
      />
    </Card>
  );
}

/**
 * Subject → syllabus → topic → confirm.
 *
 * The search box filters within the selected subject rather than across everything: an
 * admin is answering "where in Anatomy do I put them", and a list mixing two subjects makes
 * the wrong row one keystroke away.
 */
function AssignTopicSheet({
  open,
  onClose,
  cohortId,
  memberId,
  studentName,
  plan,
}: {
  open: boolean;
  onClose: () => void;
  cohortId: string;
  memberId: string;
  studentName: string;
  plan: StudentTopicPlan;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [roadmapId, setRoadmapId] = useState(plan.subjects[0]?.roadmapId ?? '');
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<TopicPlanTopic | null>(null);

  const subject = plan.subjects.find((s) => s.roadmapId === roadmapId) ?? plan.subjects[0] ?? null;

  const modules = useMemo(() => {
    if (!subject) return [];
    const q = query.trim().toLowerCase();
    if (!q) return subject.modules;
    return subject.modules
      .map((m) => ({
        ...m,
        topics: m.topics.filter(
          (t) => t.title.toLowerCase().includes(q) || m.title.toLowerCase().includes(q),
        ),
      }))
      .filter((m) => m.topics.length > 0);
  }, [subject, query]);

  const close = () => {
    setPicked(null);
    setQuery('');
    onClose();
  };

  const assign = () => {
    if (!picked || !subject) return;
    startTransition(async () => {
      const result = await assignIndividualTopicAction(cohortId, {
        memberId,
        topicId: picked.id,
        date: plan.date,
        plannedMinutes: 90,
        // The warning below is what the admin answered; the server refuses without it.
        allowCompleted: picked.status === 'completed',
      });

      if (!result.ok) {
        toast.error('Could not assign that topic', result.message);
        return;
      }

      toast.success(
        'Topic assigned',
        `${result.data.topicTitle} is now ${studentName}'s current ${result.data.subjectName} topic.`,
      );
      close();
      router.refresh();
    });
  };

  if (!subject) return null;

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Assign individual topic"
      description={`Only ${studentName} is affected. No other student's topic changes.`}
      size="lg"
      footer={
        picked ? (
          <div className="space-y-3">
            <div
              className={cn(
                'rounded-panel p-3.5 text-sm',
                picked.status === 'completed'
                  ? 'bg-warning/12 ring-warning/30 ring-1 ring-inset'
                  : 'bg-bg-sunken',
              )}
            >
              <p className="text-fg font-semibold">
                Assign “{picked.title}” as the current {subject.subjectName} topic for {studentName}
                ?
              </p>
              {picked.status === 'completed' && (
                <p className="text-fg-muted mt-1.5 text-xs leading-relaxed">
                  {studentName} has already completed this topic. Assigning it makes it current
                  again, so it stops counting as done until they finish it a second time. Everything
                  else they have completed is left alone.
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button onClick={assign} loading={pending} fullWidth>
                <Check className="size-4" aria-hidden />
                Assign topic
              </Button>
              <Button variant="outline" onClick={() => setPicked(null)} disabled={pending}>
                Back
              </Button>
            </div>
          </div>
        ) : undefined
      }
    >
      <div className="space-y-4">
        <Select
          label="Subject"
          value={subject.roadmapId}
          onChange={(e) => {
            setRoadmapId(e.target.value);
            setPicked(null);
          }}
          hint="Only subjects this student is actually studying."
        >
          {plan.subjects.map((s) => (
            <option key={s.roadmapId} value={s.roadmapId}>
              {s.subjectName} ({s.slot})
            </option>
          ))}
        </Select>

        <div className="rounded-panel bg-bg-sunken p-3.5 text-sm">
          <span className="text-fg-subtle">Current position: </span>
          <span className="text-fg font-semibold">
            {subject.current ? subject.current.title : 'everything is complete'}
          </span>
        </div>

        <TextInput
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${subject.subjectName} topics`}
          aria-label="Search topics"
          leading={<Search className="size-4" aria-hidden />}
        />

        {modules.length === 0 ? (
          <EmptyState
            icon={<Search className="size-6" aria-hidden />}
            title="No topics matched"
            description="Try a shorter search, or clear it to browse the whole syllabus."
          />
        ) : (
          <div className="space-y-4">
            {modules.map((module) => (
              <div key={module.id}>
                <p className="eyebrow px-1">
                  {module.number === 99
                    ? module.title
                    : `Module ${module.number} · ${module.title}`}
                </p>
                <ul className="divide-border border-border mt-2 divide-y rounded-2xl border">
                  {module.topics.map((topic) => {
                    const selected = picked?.id === topic.id;
                    return (
                      <li key={topic.id}>
                        <button
                          type="button"
                          onClick={() => setPicked(topic)}
                          aria-pressed={selected}
                          className={cn(
                            'tap flex w-full items-center gap-3 p-3 text-left transition-colors',
                            selected ? 'bg-pulse-500/10' : 'hover:bg-bg-sunken',
                          )}
                        >
                          <span
                            className={cn(
                              'grid size-5 shrink-0 place-items-center rounded-full border-2',
                              selected
                                ? 'border-pulse-500 bg-pulse-500 text-white'
                                : 'border-border-strong text-transparent',
                            )}
                            aria-hidden
                          >
                            <Check className="size-3" strokeWidth={3.5} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="text-fg block text-sm font-semibold">
                              {topic.title}
                            </span>
                            <span className="text-fg-subtle text-xs">
                              {STATUS_LABELS[topic.status]}
                              {topic.isToday ? ' · today’s topic' : ''}
                            </span>
                          </span>
                          {topic.status === 'completed' && (
                            <Badge tone="success" size="sm">
                              Done
                            </Badge>
                          )}
                          {topic.status === 'in_progress' && (
                            <Badge tone="pulse" size="sm">
                              Current
                            </Badge>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  );
}
