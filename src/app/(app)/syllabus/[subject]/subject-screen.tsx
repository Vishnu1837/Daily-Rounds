'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, Check, ChevronRight } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Reveal } from '@/components/ui/reveal';
import { cn } from '@/lib/cn';

type NodeStatus = 'upcoming' | 'in_progress' | 'completed' | null;

type Subject = {
  name: string;
  slug: string;
  number: number;
  phaseLabel: string;
  topicCount: number;
  nodeCount: number;
  sections: {
    title: string;
    slug: string;
    topics: { title: string; slug: string; nodes: { label: string; status: NodeStatus }[] }[];
  }[];
};

/** A search hit links to /syllabus/<subject>#<section>, so the hash picks the open section. */
function subscribeToHash(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

/**
 * The subject syllabus, disclosed one level at a time.
 *
 * A subject holds up to a few hundred labels. Showing them all at once turns the syllabus
 * into a wall of text nobody reads, so the page opens on sections only: tap a section to
 * reveal its topics, tap a topic to reveal what it contains. That is also how a student
 * actually navigates a subject — by narrowing.
 */
export function SubjectSyllabusScreen({
  subject,
  hasRoadmapForSubject,
}: {
  subject: Subject;
  hasRoadmapForSubject: boolean;
}) {
  const hash = useSyncExternalStore(
    subscribeToHash,
    () => window.location.hash.slice(1),
    () => '',
  );

  /**
   * Which section is open, resolved in priority order: what the student last tapped, then
   * the section named in the URL hash, then the first section. Keeping the tap as an
   * *override* rather than as the state itself means arriving from a search link works
   * without an effect racing the first render.
   */
  const [override, setOverride] = useState<{ value: string | null } | null>(null);
  const fromHash = subject.sections.some((s) => s.slug === hash) ? hash : null;
  const openSection = override ? override.value : (fromHash ?? subject.sections[0]?.slug ?? null);

  useEffect(() => {
    if (fromHash) document.getElementById(fromHash)?.scrollIntoView({ block: 'start' });
  }, [fromHash]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={
          <Link href="/syllabus" className="hover:text-fg inline-flex items-center gap-1">
            <ArrowLeft className="size-3" aria-hidden />
            {subject.phaseLabel}
          </Link>
        }
        title={subject.name}
        description={`${subject.sections.length} sections · ${subject.topicCount} topics · ${subject.nodeCount} syllabus nodes.`}
      >
        {hasRoadmapForSubject && (
          <p className="text-fg-muted text-xs">
            Items already on your roadmap are marked as you scroll — completed ones are ticked.{' '}
            <Link href="/roadmap" className="text-iris-600 dark:text-iris-300 font-semibold">
              Open your roadmap
            </Link>
          </p>
        )}
      </PageHeader>

      <div className="space-y-3">
        {subject.sections.map((section, i) => (
          <Reveal key={section.slug} delay={i}>
            <SectionBlock
              section={section}
              open={openSection === section.slug}
              onToggle={() =>
                setOverride({ value: openSection === section.slug ? null : section.slug })
              }
            />
          </Reveal>
        ))}
      </div>
    </div>
  );
}

function SectionBlock({
  section,
  open,
  onToggle,
}: {
  section: Subject['sections'][number];
  open: boolean;
  onToggle: () => void;
}) {
  const nodeTotal = section.topics.reduce((n, t) => n + t.nodes.length, 0);
  const plannedTotal = section.topics.reduce(
    (n, t) => n + t.nodes.filter((node) => node.status !== null).length,
    0,
  );

  return (
    <Card padding="none" id={section.slug} className="scroll-mt-20 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="tap hover:bg-bg-sunken flex w-full items-center gap-3 px-5 py-4 text-left transition-colors"
      >
        <ChevronRight
          className={cn(
            'text-fg-subtle size-4 shrink-0 transition-transform duration-200',
            open && 'rotate-90',
          )}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span className="text-fg block text-sm font-bold">{section.title}</span>
          <span className="text-fg-subtle text-xs">
            {section.topics.length} topics · {nodeTotal} nodes
          </span>
        </span>
        {plannedTotal > 0 && (
          <Badge tone="iris" size="sm">
            {plannedTotal} on your plan
          </Badge>
        )}
      </button>

      {open && (
        <ul className="divide-border border-border divide-y border-t">
          {section.topics.map((topic) => (
            <li key={topic.slug}>
              <TopicBlock topic={topic} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function TopicBlock({ topic }: { topic: Subject['sections'][number]['topics'][number] }) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const done = topic.nodes.filter((n) => n.status === 'completed').length;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="tap hover:bg-bg-sunken flex w-full items-center gap-3 px-5 py-3 pl-11 text-left transition-colors"
      >
        <span className="min-w-0 flex-1">
          <span className="text-fg block text-sm font-semibold">{topic.title}</span>
          <span className="text-fg-subtle text-xs">
            {topic.nodes.length} {topic.nodes.length === 1 ? 'node' : 'nodes'}
            {done > 0 && ` · ${done} done`}
          </span>
        </span>
        <ChevronRight
          className={cn(
            'text-fg-subtle size-3.5 shrink-0 transition-transform duration-200',
            open && 'rotate-90',
          )}
          aria-hidden
        />
      </button>

      {open && (
        <motion.ul
          initial={reduce ? false : { opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
          className="flex flex-wrap gap-1.5 px-5 pb-4 pl-11"
        >
          {topic.nodes.map((node) => (
            <li key={node.label}>
              <span
                className={cn(
                  'rounded-pill inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium',
                  node.status === 'completed'
                    ? 'bg-success/14 text-success-strong dark:text-success'
                    : node.status
                      ? 'bg-iris-500/12 text-iris-700 dark:text-iris-300'
                      : 'bg-bg-sunken text-fg-muted',
                )}
              >
                {node.status === 'completed' && (
                  <Check className="size-3" strokeWidth={3} aria-hidden />
                )}
                {node.label}
              </span>
            </li>
          ))}
        </motion.ul>
      )}
    </div>
  );
}
