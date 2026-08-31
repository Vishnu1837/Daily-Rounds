'use client';

import { useState, useTransition } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Circle, Loader2 } from 'lucide-react';

import { AnimatedCheck } from '@/components/gamification/celebration';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { ProgressBar } from '@/components/ui/progress';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import { setTopicStatusAction } from '@/server/actions/study';
import type { RoadmapView } from '@/server/queries/student';

export function RoadmapScreen({ roadmaps }: { roadmaps: RoadmapView[] }) {
  if (roadmaps.length === 0) {
    return (
      <Card className="mt-6">
        <EmptyState
          emoji="🗺️"
          title="Your roadmap is being built"
          description="Your cohort lead is putting together the topic plan for your subject. It will appear here as soon as it's ready — until then, today's study block still counts."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <header className="px-1 pt-2">
        <h1 className="text-2xl font-extrabold tracking-tight text-fg">Your roadmap</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Yours alone — built around the subject you chose, not your year group.
        </p>
      </header>

      {roadmaps.map((roadmap) => (
        <RoadmapCard key={roadmap.id} roadmap={roadmap} />
      ))}
    </div>
  );
}

function RoadmapCard({ roadmap }: { roadmap: RoadmapView }) {
  const pct = roadmap.total === 0 ? 0 : Math.round((roadmap.completed / roadmap.total) * 100);

  return (
    <section className="space-y-3">
      <Card className="overflow-hidden">
        <div className="bg-linear-to-br from-iris-500/12 to-transparent p-5">
          <p className="text-2xs font-bold tracking-[0.14em] text-iris-600 uppercase dark:text-iris-300">
            {roadmap.subjectName}
          </p>
          <h2 className="mt-1.5 text-lg font-extrabold text-fg">{roadmap.track ?? roadmap.title}</h2>
          <div className="mt-4 flex items-center gap-3">
            <ProgressBar value={pct} tone="iris" className="flex-1" label="Roadmap progress" />
            <span className="text-sm font-extrabold tabular-nums text-fg">{pct}%</span>
          </div>
          <p className="mt-2 text-sm text-fg-muted">
            {roadmap.completed} of {roadmap.total} topics complete
          </p>
        </div>
      </Card>

      {roadmap.weeks.map((week) => (
        <div key={week.id} className="space-y-2">
          <div className="flex items-baseline gap-2 px-1">
            <h3 className="text-2xs font-bold tracking-[0.14em] text-fg-subtle uppercase">
              Week {week.weekNumber}
            </h3>
            <span className="truncate text-sm font-semibold text-fg-muted">{week.title}</span>
          </div>
          <Card className="divide-y divide-border overflow-hidden p-0">
            {week.topics.map((topic, i) => (
              <TopicRow key={topic.id} topic={topic} index={i} />
            ))}
          </Card>
        </div>
      ))}
    </section>
  );
}

function TopicRow({
  topic,
  index,
}: {
  topic: RoadmapView['weeks'][number]['topics'][number];
  index: number;
}) {
  const reduce = useReducedMotion();
  const toast = useToast();
  const [status, setStatus] = useState(topic.status);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    const next = status === 'completed' ? 'upcoming' : 'completed';
    const previous = status;
    setStatus(next); // optimistic
    startTransition(async () => {
      const result = await setTopicStatusAction(topic.id, next);
      if (!result.ok) {
        setStatus(previous);
        toast.error('Could not update that topic', result.message);
      }
    });
  };

  const done = status === 'completed';

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.2), duration: 0.25 }}
    >
      <button
        type="button"
        onClick={toggle}
        aria-pressed={done}
        className={cn(
          'tap flex w-full items-start gap-3 p-4 text-left transition-colors',
          'hover:bg-bg-sunken',
          topic.isToday && !done && 'bg-pulse-500/6',
        )}
      >
        <span
          className={cn(
            'mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border-2 transition-all',
            done
              ? 'border-success bg-success text-white'
              : status === 'in_progress'
                ? 'border-pulse-500 text-pulse-500'
                : 'border-border-strong text-transparent',
          )}
          aria-hidden
        >
          {pending ? (
            <Loader2 className="size-3.5 animate-spin text-fg-subtle" />
          ) : done ? (
            <AnimatedCheck size={14} />
          ) : status === 'in_progress' ? (
            <Circle className="size-2 fill-current" />
          ) : null}
        </span>

        <span className="min-w-0 flex-1">
          <span
            className={cn(
              'block text-sm font-semibold transition-colors',
              done ? 'text-fg-subtle line-through decoration-fg-subtle/50' : 'text-fg',
            )}
          >
            {topic.title}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            {topic.isToday && !done && <Badge tone="pulse">Today</Badge>}
            {status === 'in_progress' && !topic.isToday && <Badge tone="iris">In progress</Badge>}
            <span className="text-xs text-fg-subtle">{topic.estimatedMinutes} min</span>
          </span>
        </span>
      </button>
    </motion.div>
  );
}
