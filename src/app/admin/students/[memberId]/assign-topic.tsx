'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ListTree, Loader2, Search } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { Select, TextInput } from '@/components/ui/form';
import { ProgressBar } from '@/components/ui/progress';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import { assignIndividualTopicAction, assignSyllabusTopicAction } from '@/server/actions/admin';
import {
  type CurriculumSubjectTree,
  curriculumSubjectTreeAction,
} from '@/server/actions/curriculum';
import type { StudentTopicPlan, TopicPlanTopic } from '@/server/queries/admin';

const STATUS_LABELS: Record<TopicPlanTopic['status'], string> = {
  upcoming: 'Not started',
  in_progress: 'Current',
  completed: 'Completed',
};

/** A subject as the syllabus picker lists it. Small enough to send with the page. */
export type SyllabusSubject = {
  slug: string;
  name: string;
  number: number;
  phaseLabel: string;
  topicCount: number;
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
  syllabusSubjects,
}: {
  cohortId: string;
  memberId: string;
  studentName: string;
  plan: StudentTopicPlan;
  syllabusSubjects: SyllabusSubject[];
}) {
  const [open, setOpen] = useState(false);

  /* Today's topic in each subject the student is studying, whether it came from a roadmap
     or straight from the syllabus. */
  const today = plan.today.filter((t) => t.title);

  return (
    <Card>
      <CardHeader
        title="Topics"
        icon={<ListTree className="text-fg-subtle size-4" aria-hidden />}
        description="Where this student is in each of their subjects, and what they are studying today."
        action={
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            Assign a topic
          </Button>
        }
      />

      <div className="space-y-3 p-5">
        <div className="rounded-panel bg-bg-sunken p-4">
          <p className="eyebrow">{today.length > 1 ? "Today's topics" : "Today's topic"}</p>
          {today.length > 0 ? (
            <div className="space-y-2.5">
              {today.map((t) => (
                <div key={t.slot}>
                  <p className="text-fg mt-1 text-sm font-bold">{t.title}</p>
                  <p className="text-fg-subtle mt-0.5 text-xs">
                    {t.subjectName}
                    {t.source === 'admin' ? ' · assigned by an admin' : ''}
                    {t.offRoadmap ? ' · not on their roadmap' : ''}
                  </p>
                </div>
              ))}
            </div>
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
            description="Give this student a subject on the roadmaps screen and their syllabus appears here. You can still assign them any topic from the full syllabus."
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
        syllabusSubjects={syllabusSubjects}
      />
    </Card>
  );
}

type Source = 'roadmap' | 'syllabus';

/**
 * Subject → module → topic → confirm, from either of two places.
 *
 * "Their roadmap" is the everyday case and stays first: the topics are the student's own
 * rows, so picking one is guaranteed to move them along a plan that already exists. "The
 * full syllabus" is the escape hatch the roadmap cannot offer — every subject in the MBBS
 * course, whether or not this student is tracking it. The two are separate tabs rather than
 * one merged list because the consequences differ, and the footer says which one applies
 * before anything is written.
 */
function AssignTopicSheet({
  open,
  onClose,
  cohortId,
  memberId,
  studentName,
  plan,
  syllabusSubjects,
}: {
  open: boolean;
  onClose: () => void;
  cohortId: string;
  memberId: string;
  studentName: string;
  plan: StudentTopicPlan;
  syllabusSubjects: SyllabusSubject[];
}) {
  const hasRoadmap = plan.subjects.length > 0;
  const [source, setSource] = useState<Source>(hasRoadmap ? 'roadmap' : 'syllabus');

  const close = () => {
    setSource(hasRoadmap ? 'roadmap' : 'syllabus');
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Assign a topic"
      description={`Only ${studentName} is affected. No other student's topic changes.`}
      size="lg"
    >
      <div className="space-y-4">
        <div
          role="tablist"
          aria-label="Where to pick the topic from"
          className="bg-bg-sunken rounded-field flex gap-1 p-1"
        >
          {(
            [
              { id: 'roadmap', label: 'Their roadmap' },
              { id: 'syllabus', label: 'Full syllabus' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={source === tab.id}
              disabled={tab.id === 'roadmap' && !hasRoadmap}
              onClick={() => setSource(tab.id)}
              className={cn(
                'tap rounded-field flex-1 px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-40',
                source === tab.id
                  ? 'bg-bg-elevated text-fg shadow-sm'
                  : 'text-fg-muted hover:text-fg',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {source === 'roadmap' ? (
          <RoadmapPicker
            cohortId={cohortId}
            memberId={memberId}
            studentName={studentName}
            plan={plan}
            onDone={close}
          />
        ) : (
          <SyllabusPicker
            cohortId={cohortId}
            memberId={memberId}
            studentName={studentName}
            plan={plan}
            subjects={syllabusSubjects}
            onDone={close}
          />
        )}
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------- from the roadmap */

function RoadmapPicker({
  cohortId,
  memberId,
  studentName,
  plan,
  onDone,
}: {
  cohortId: string;
  memberId: string;
  studentName: string;
  plan: StudentTopicPlan;
  onDone: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [roadmapId, setRoadmapId] = useState(plan.subjects[0]?.roadmapId ?? '');
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<TopicPlanTopic | null>(null);

  const subject = plan.subjects.find((s) => s.roadmapId === roadmapId) ?? plan.subjects[0] ?? null;

  /*
   * The search box filters within the selected subject rather than across everything: an
   * admin is answering "where in Anatomy do I put them", and a list mixing two subjects
   * makes the wrong row one keystroke away.
   */
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

  if (!subject) return null;

  const assign = () => {
    if (!picked) return;
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
      onDone();
      router.refresh();
    });
  };

  return (
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
                {module.number === 99 ? module.title : `Module ${module.number} · ${module.title}`}
              </p>
              <ul className="divide-border border-border mt-2 divide-y rounded-2xl border">
                {module.topics.map((topic) => (
                  <li key={topic.id}>
                    <TopicRow
                      title={topic.title}
                      meta={`${STATUS_LABELS[topic.status]}${topic.isToday ? ' · today’s topic' : ''}`}
                      selected={picked?.id === topic.id}
                      onSelect={() => setPicked(topic)}
                      badge={
                        topic.status === 'completed' ? (
                          <Badge tone="success" size="sm">
                            Done
                          </Badge>
                        ) : topic.status === 'in_progress' ? (
                          <Badge tone="pulse" size="sm">
                            Current
                          </Badge>
                        ) : null
                      }
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {picked && (
        <ConfirmBar
          warning={
            picked.status === 'completed'
              ? `${studentName} has already completed this topic. Assigning it makes it current again, so it stops counting as done until they finish it a second time. Everything else they have completed is left alone.`
              : null
          }
          question={`Assign “${picked.title}” as the current ${subject.subjectName} topic for ${studentName}?`}
          pending={pending}
          onAssign={assign}
          onBack={() => setPicked(null)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------ from the syllabus */

/**
 * The whole MBBS curriculum, one subject at a time.
 *
 * The tree is ~5,000 lines of generated data, so the subject list arrives with the page and
 * the modules for the chosen subject are fetched on demand rather than bundled into the
 * browser. Picking is by curriculum ref — the same address quizzes and materials are filed
 * under — so the server can honour a topic that has no row for this student yet.
 */
function SyllabusPicker({
  cohortId,
  memberId,
  studentName,
  plan,
  subjects,
  onDone,
}: {
  cohortId: string;
  memberId: string;
  studentName: string;
  plan: StudentTopicPlan;
  subjects: SyllabusSubject[];
  onDone: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [slug, setSlug] = useState(subjects[0]?.slug ?? '');
  const [tree, setTree] = useState<CurriculumSubjectTree | null>(null);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<{ ref: string; title: string; module: string } | null>(null);
  const [confirmCompleted, setConfirmCompleted] = useState(false);

  /*
   * The tree carries the slug it was fetched for, so "still loading" is a comparison rather
   * than a second piece of state — which also means the previous subject's modules can
   * never flash under the new subject's heading while the fetch is in flight.
   */
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    void curriculumSubjectTreeAction(slug).then((result) => {
      if (!cancelled) setTree(result);
    });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const loaded = tree?.slug === slug ? tree : null;
  const loading = loaded === null;

  /* Matching a topic by its title *or* by one of its detail nodes, the way the student-facing
     syllabus search does — an admin looking for "brachial plexus" should not have to know
     which topic contains it. */
  const sections = useMemo(() => {
    if (!loaded) return [];
    const q = query.trim().toLowerCase();
    if (!q) return loaded.sections;
    return loaded.sections
      .map((section) => ({
        ...section,
        topics: section.topics.filter(
          (t) =>
            t.title.toLowerCase().includes(q) ||
            section.title.toLowerCase().includes(q) ||
            t.nodes.some((n) => n.toLowerCase().includes(q)),
        ),
      }))
      .filter((section) => section.topics.length > 0);
  }, [loaded, query]);

  const phases = useMemo(() => {
    const groups: { label: string; subjects: SyllabusSubject[] }[] = [];
    for (const subject of subjects) {
      const last = groups[groups.length - 1];
      if (last && last.label === subject.phaseLabel) last.subjects.push(subject);
      else groups.push({ label: subject.phaseLabel, subjects: [subject] });
    }
    return groups;
  }, [subjects]);

  /* Whether this student is tracking the chosen subject, which is what decides whether the
     topic lands on a roadmap or only on today. Said before the assignment, not after. */
  const roadmapSubject = plan.subjects.find(
    (s) => s.subjectSlug === slug || s.subjectName === loaded?.name,
  );

  const assign = () => {
    if (!picked) return;
    startTransition(async () => {
      const result = await assignSyllabusTopicAction(cohortId, {
        memberId,
        ref: picked.ref,
        date: plan.date,
        plannedMinutes: 90,
        allowCompleted: confirmCompleted,
      });

      if (!result.ok) {
        // The server refuses a completed topic once, and says so; confirming re-sends it.
        if (/already been completed/i.test(result.message ?? '') && !confirmCompleted) {
          setConfirmCompleted(true);
          toast.error('Already completed', result.message);
          return;
        }
        toast.error('Could not assign that topic', result.message);
        return;
      }

      toast.success(
        'Topic assigned',
        result.data.placement === 'off_roadmap'
          ? `${result.data.topicTitle} is ${studentName}'s topic for today. ${result.data.subjectName} is not one of their roadmap subjects, so their roadmaps are unchanged.`
          : `${result.data.topicTitle} is now ${studentName}'s current ${result.data.subjectName} topic.`,
      );
      onDone();
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <Select
        label="Subject"
        value={slug}
        onChange={(e) => {
          setSlug(e.target.value);
          setPicked(null);
          setConfirmCompleted(false);
          setQuery('');
        }}
        hint="Every subject in the MBBS course, not just the ones on this student's roadmap."
      >
        {phases.map((phase) => (
          <optgroup key={phase.label} label={phase.label}>
            {phase.subjects.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.number}. {s.name} ({s.topicCount} topics)
              </option>
            ))}
          </optgroup>
        ))}
      </Select>

      <div className="rounded-panel bg-bg-sunken p-3.5 text-sm">
        {roadmapSubject ? (
          <>
            <span className="text-fg-subtle">On their roadmap · current position: </span>
            <span className="text-fg font-semibold">
              {roadmapSubject.current ? roadmapSubject.current.title : 'everything is complete'}
            </span>
          </>
        ) : (
          <span className="text-fg-muted">
            {studentName} has no roadmap for this subject. The topic you pick becomes their focus
            for {plan.date} without changing the roadmaps they are working through.
          </span>
        )}
      </div>

      <TextInput
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={loaded ? `Search ${loaded.name}` : 'Search topics'}
        aria-label="Search the syllabus"
        leading={<Search className="size-4" aria-hidden />}
      />

      {loading ? (
        <p className="text-fg-muted flex items-center justify-center gap-2 py-10 text-sm">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Loading the syllabus…
        </p>
      ) : sections.length === 0 ? (
        <EmptyState
          icon={<Search className="size-6" aria-hidden />}
          title="No topics matched"
          description="Try a shorter search, or clear it to browse the whole subject."
        />
      ) : (
        <div className="space-y-4">
          {sections.map((section) => (
            <div key={section.ref}>
              <p className="eyebrow px-1">{section.title}</p>
              <ul className="divide-border border-border mt-2 divide-y rounded-2xl border">
                {section.topics.map((topic) => (
                  <li key={topic.ref}>
                    <TopicRow
                      title={topic.title}
                      meta={
                        topic.nodes.length > 0
                          ? topic.nodes.slice(0, 3).join(' · ') +
                            (topic.nodes.length > 3 ? ` · +${topic.nodes.length - 3} more` : '')
                          : section.title
                      }
                      selected={picked?.ref === topic.ref}
                      onSelect={() => {
                        setPicked({ ref: topic.ref, title: topic.title, module: section.title });
                        setConfirmCompleted(false);
                      }}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {picked && (
        <ConfirmBar
          warning={
            confirmCompleted
              ? `${studentName} has already completed this topic. Assigning it makes it current again, so it stops counting as done until they finish it a second time.`
              : null
          }
          question={`Assign “${picked.title}” (${picked.module}) as ${studentName}'s topic for ${plan.date}?`}
          cta={confirmCompleted ? 'Assign it anyway' : 'Assign topic'}
          pending={pending}
          onAssign={assign}
          onBack={() => {
            setPicked(null);
            setConfirmCompleted(false);
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------ shared bits */

function TopicRow({
  title,
  meta,
  selected,
  onSelect,
  badge,
}: {
  title: string;
  meta: string;
  selected: boolean;
  onSelect: () => void;
  badge?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
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
        <span className="text-fg block text-sm font-semibold">{title}</span>
        <span className="text-fg-subtle block truncate text-xs">{meta}</span>
      </span>
      {badge}
    </button>
  );
}

function ConfirmBar({
  question,
  warning,
  cta = 'Assign topic',
  pending,
  onAssign,
  onBack,
}: {
  question: string;
  warning: string | null;
  cta?: string;
  pending: boolean;
  onAssign: () => void;
  onBack: () => void;
}) {
  return (
    <div className="bg-bg-elevated border-border sticky bottom-0 space-y-3 border-t pt-3">
      <div
        className={cn(
          'rounded-panel p-3.5 text-sm',
          warning ? 'bg-warning/12 ring-warning/30 ring-1 ring-inset' : 'bg-bg-sunken',
        )}
      >
        <p className="text-fg font-semibold">{question}</p>
        {warning && <p className="text-fg-muted mt-1.5 text-xs leading-relaxed">{warning}</p>}
      </div>
      <div className="flex gap-2">
        <Button onClick={onAssign} loading={pending} fullWidth>
          <Check className="size-4" aria-hidden />
          {cta}
        </Button>
        <Button variant="outline" onClick={onBack} disabled={pending}>
          Back
        </Button>
      </div>
    </div>
  );
}
