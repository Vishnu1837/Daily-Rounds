'use client';

import { useMemo, useState, useTransition } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, Clock, Loader2, Map as MapIcon, Repeat } from 'lucide-react';

import { AnimatedCheck } from '@/components/gamification/celebration';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAurora } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { PageHeader } from '@/components/ui/page-header';
import { ProgressBar, ProgressRing } from '@/components/ui/progress';
import { Reveal } from '@/components/ui/reveal';
import { ChipRail } from '@/components/ui/segmented';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import { progressPct } from '@/lib/roadmap/generate';
import { setTopicStatusAction } from '@/server/actions/study';
import type { RoadmapView } from '@/server/queries/student';

import { SwitchSubjectSheet } from './switch-subject';

type TopicStatus = 'upcoming' | 'in_progress' | 'completed';
type SubjectOption = { slug: string; name: string; phaseLabel: string };

/**
 * The student's two active roadmaps.
 *
 * Completion state is held *here* rather than inside each topic row, which is the fix for
 * the stale-progress bug in the brief: the ring, the bar, the module counters and the
 * subject tab percentages all read one override map, so ticking a topic moves every one of
 * them on the same frame. The server stays the source of truth — a failed write rolls the
 * override back — but nothing waits for a page refresh to look right.
 */
export function RoadmapScreen({
  roadmaps,
  subjectOptions,
}: {
  roadmaps: RoadmapView[];
  subjectOptions: SubjectOption[];
}) {
  const [activeId, setActiveId] = useState(roadmaps[0]?.id ?? '');
  const [overrides, setOverrides] = useState<Record<string, TopicStatus>>({});

  const setStatus = (topicId: string, status: TopicStatus) =>
    setOverrides((prev) => ({ ...prev, [topicId]: status }));

  /** Live counts per roadmap, folding in anything the server has not acknowledged yet. */
  const counts = useMemo(() => {
    const out = new Map<string, { completed: number; total: number; pct: number }>();
    for (const roadmap of roadmaps) {
      let completed = 0;
      let total = 0;
      for (const week of roadmap.weeks) {
        for (const topic of week.topics) {
          total += 1;
          if ((overrides[topic.id] ?? topic.status) === 'completed') completed += 1;
        }
      }
      out.set(roadmap.id, { completed, total, pct: progressPct(completed, total) });
    }
    return out;
  }, [roadmaps, overrides]);

  const active = useMemo(
    () => roadmaps.find((r) => r.id === activeId) ?? roadmaps[0] ?? null,
    [roadmaps, activeId],
  );

  if (roadmaps.length === 0 || !active) {
    return (
      <div className="space-y-5">
        <PageHeader
          eyebrow="Your plan"
          title="Roadmap"
          description="Your own topic plan, built around the subjects you chose."
        />
        <Card variant="outline">
          <EmptyState
            tone="iris"
            icon={<MapIcon className="size-6" aria-hidden />}
            title="Your roadmap is being built"
            description="Your cohort lead is putting together the topic plan for your subjects. It will appear here as soon as it is ready — until then, today's study block still counts."
          />
        </Card>
      </div>
    );
  }

  const activeCount = counts.get(active.id) ?? { completed: 0, total: 0, pct: 0 };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Your plan"
        title="Roadmap"
        description="Up to two active subjects, straight from the MBBS syllabus."
      >
        {roadmaps.length > 1 && (
          <ChipRail
            ariaLabel="Choose a subject"
            value={active.id}
            onChange={setActiveId}
            /*
             * The percentage lives in the tab itself, so both subjects stay readable
             * without switching — "Anatomy 22% · Physiology 15%" at a glance.
             */
            options={roadmaps.map((r) => ({
              value: r.id,
              label: `${r.subjectName} ${counts.get(r.id)?.pct ?? 0}%`,
            }))}
          />
        )}
      </PageHeader>

      <RoadmapBody
        key={active.id}
        roadmap={active}
        count={activeCount}
        overrides={overrides}
        onSetStatus={setStatus}
        subjectOptions={subjectOptions}
        otherSubjectSlug={roadmaps.find((r) => r.id !== active.id)?.subjectSlug ?? null}
      />
    </div>
  );
}

function RoadmapBody({
  roadmap,
  count,
  overrides,
  onSetStatus,
  subjectOptions,
  otherSubjectSlug,
}: {
  roadmap: RoadmapView;
  count: { completed: number; total: number; pct: number };
  overrides: Record<string, TopicStatus>;
  onSetStatus: (topicId: string, status: TopicStatus) => void;
  subjectOptions: SubjectOption[];
  otherSubjectSlug: string | null;
}) {
  const [switchOpen, setSwitchOpen] = useState(false);

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------------------- hero */}
      <Reveal>
        <Card variant="wash" tone="iris" padding="lg" className="overflow-hidden">
          <CardAurora tone="iris" />
          <div className="relative flex flex-wrap items-center gap-6">
            <ProgressRing
              value={count.pct}
              size={104}
              stroke={10}
              tone="iris"
              label="Roadmap progress"
            >
              <div className="text-center">
                <span className="stat-num text-fg block text-xl">{count.pct}%</span>
                <span className="text-2xs text-fg-subtle font-bold uppercase">done</span>
              </div>
            </ProgressRing>

            <div className="min-w-0 flex-1">
              <p className="eyebrow text-iris-700 dark:text-iris-300">
                {roadmap.slot === 'primary' ? 'Primary subject' : 'Secondary subject'}
              </p>
              <h2 className="text-fg mt-1.5 text-xl font-extrabold text-balance sm:text-2xl">
                {roadmap.subjectName}
              </h2>
              <p className="text-fg-muted mt-2 text-sm">
                <strong className="text-fg">{count.completed}</strong> of {count.total} topics
                complete across {roadmap.weeks.length}{' '}
                {roadmap.weeks.length === 1 ? 'module' : 'modules'}.
              </p>
              <ProgressBar
                value={count.pct}
                tone="iris"
                className="mt-4 max-w-md"
                label="Roadmap progress"
              />
              <Button
                variant="ghost"
                size="sm"
                className="mt-3 -ml-2"
                onClick={() => setSwitchOpen(true)}
              >
                <Repeat className="size-3.5" aria-hidden />
                Change subject
              </Button>
            </div>
          </div>
        </Card>
      </Reveal>

      <SwitchSubjectSheet
        open={switchOpen}
        onClose={() => setSwitchOpen(false)}
        slot={roadmap.slot}
        currentSubjectName={roadmap.subjectName}
        currentPct={count.pct}
        subjects={subjectOptions.filter(
          (s) => s.slug !== roadmap.subjectSlug && s.slug !== otherSubjectSlug,
        )}
      />

      {/*
        A timeline rather than a stack of cards.
        The rail makes the sequence legible at a glance — this is a plan with an order, and
        a grid of equal cards would flatten exactly the thing that matters about it.
      */}
      <ol className="relative space-y-4 pl-7 sm:pl-9">
        <span
          className="from-iris-400/60 via-border absolute top-3 bottom-3 left-[0.6875rem] w-px bg-linear-to-b to-transparent sm:left-[0.9375rem]"
          aria-hidden
        />
        {roadmap.weeks.map((week, i) => (
          <WeekBlock
            key={week.id}
            week={week}
            index={i}
            overrides={overrides}
            onSetStatus={onSetStatus}
          />
        ))}
      </ol>
    </div>
  );
}

function WeekBlock({
  week,
  index,
  overrides,
  onSetStatus,
}: {
  week: RoadmapView['weeks'][number];
  index: number;
  overrides: Record<string, TopicStatus>;
  onSetStatus: (topicId: string, status: TopicStatus) => void;
}) {
  const done = week.topics.filter((t) => (overrides[t.id] ?? t.status) === 'completed').length;
  const complete = week.topics.length > 0 && done === week.topics.length;
  const hasToday = week.topics.some((t) => t.isToday);

  return (
    <Reveal as="li" delay={index} className="relative">
      <span
        className={cn(
          'text-2xs absolute top-4 -left-7 grid size-6 place-items-center rounded-full border-2 font-bold sm:-left-9',
          complete
            ? 'from-success to-success-strong border-transparent bg-linear-to-br text-white'
            : hasToday
              ? 'border-pulse-500 bg-bg-elevated text-pulse-600 dark:text-pulse-300'
              : 'border-border-strong bg-bg-elevated text-fg-subtle',
        )}
        aria-hidden
      >
        {complete ? <Check className="size-3.5" strokeWidth={3.5} /> : week.weekNumber}
      </span>

      <Card padding="none" className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4 pb-3">
          <div className="min-w-0">
            <p className="eyebrow">Module {week.weekNumber}</p>
            <h3 className="text-fg mt-1 truncate text-base font-bold">{week.title}</h3>
          </div>
          <div className="flex items-center gap-2">
            {hasToday && <Badge tone="pulse">Today</Badge>}
            <span className="text-2xs text-fg-subtle font-bold tabular-nums">
              {done}/{week.topics.length}
            </span>
          </div>
        </div>

        <ul className="divide-border border-border divide-y border-t">
          {week.topics.map((topic, i) => (
            <li key={topic.id}>
              <TopicRow
                topic={topic}
                index={i}
                status={overrides[topic.id] ?? topic.status}
                onSetStatus={onSetStatus}
              />
            </li>
          ))}
        </ul>
      </Card>
    </Reveal>
  );
}

function TopicRow({
  topic,
  index,
  status,
  onSetStatus,
}: {
  topic: RoadmapView['weeks'][number]['topics'][number];
  index: number;
  status: TopicStatus;
  onSetStatus: (topicId: string, status: TopicStatus) => void;
}) {
  const reduce = useReducedMotion();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    const next: TopicStatus = status === 'completed' ? 'upcoming' : 'completed';
    const previous = status;
    // Optimistic and lifted: the tick, the module counter, the ring and the subject tab
    // percentage all move on the same frame as the tap.
    onSetStatus(topic.id, next);
    startTransition(async () => {
      const result = await setTopicStatusAction(topic.id, next);
      if (!result.ok) {
        onSetStatus(topic.id, previous);
        toast.error('Could not update that topic', result.message);
      }
    });
  };

  const done = status === 'completed';

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.2), duration: 0.25 }}
    >
      <button
        type="button"
        onClick={toggle}
        aria-pressed={done}
        className={cn(
          'tap group flex w-full items-start gap-3.5 p-4 text-left transition-colors duration-150',
          'hover:bg-bg-sunken',
          topic.isToday && !done && 'bg-pulse-500/6',
        )}
      >
        <span
          className={cn(
            'mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border-2 transition-all duration-200',
            done
              ? 'from-success to-success-strong scale-105 border-transparent bg-linear-to-br text-white'
              : status === 'in_progress'
                ? 'border-pulse-500 text-pulse-500'
                : 'border-border-strong group-hover:border-iris-400 text-transparent',
          )}
          aria-hidden
        >
          {pending ? (
            <Loader2 className="text-fg-subtle size-3.5 animate-spin" />
          ) : done ? (
            <AnimatedCheck size={14} />
          ) : status === 'in_progress' ? (
            <span className="size-2 rounded-full bg-current" />
          ) : null}
        </span>

        <span className="min-w-0 flex-1">
          <span
            className={cn(
              'block text-sm font-semibold transition-colors',
              done ? 'text-fg-subtle decoration-fg-subtle/50 line-through' : 'text-fg',
            )}
          >
            {topic.title}
          </span>
          {topic.description && !done && (
            <span className="text-fg-muted mt-0.5 block text-xs leading-relaxed">
              {topic.description}
            </span>
          )}
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {topic.isToday && !done && (
              <Badge tone="pulse" size="sm">
                Today&apos;s topic
              </Badge>
            )}
            {status === 'in_progress' && !topic.isToday && (
              <Badge tone="iris" size="sm">
                In progress
              </Badge>
            )}
            <span className="text-fg-subtle inline-flex items-center gap-1 text-xs">
              <Clock className="size-3" aria-hidden />
              {topic.estimatedMinutes} min
            </span>
          </span>
        </span>
      </button>
    </motion.div>
  );
}
