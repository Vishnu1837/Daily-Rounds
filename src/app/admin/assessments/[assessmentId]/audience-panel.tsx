'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Search, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { TextInput } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import { setAssessmentAudienceAction } from '@/server/actions/assessments';
import type { AudienceCandidate } from '@/server/queries/assessments';

/**
 * Who a published assessment is for.
 *
 * Publishing used to be all-or-nothing, and the gap that left is one you feel every time
 * you ship a paper: there was no way to put a finished assessment in front of a single test
 * account, sit it end to end as a student would, and only then let the cohort at it. The
 * choice here is that missing step — and it is deliberately reversible in both directions,
 * so narrowing a live paper back down to one account to debug something is as easy as
 * opening it up was.
 *
 * The list is kept when the audience goes back to everyone. An admin who opens a paper up
 * and then wants it narrow again gets their selection back rather than rebuilding it, which
 * is the whole point when the selection is "my test account" and the cycle repeats.
 */
export function AudiencePanel({
  cohortId,
  assessmentId,
  status,
  candidates,
}: {
  cohortId: string;
  assessmentId: string;
  status: 'draft' | 'published' | 'archived';
  candidates: AudienceCandidate[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [audience, setAudience] = useState<'everyone' | 'selected'>(
    candidates.some((c) => c.selected) ? 'selected' : 'everyone',
  );
  const [chosen, setChosen] = useState<Set<string>>(
    () => new Set(candidates.filter((c) => c.selected).map((c) => c.memberId)),
  );
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return candidates;
    return candidates.filter(
      (c) => c.fullName.toLowerCase().includes(needle) || c.email.toLowerCase().includes(needle),
    );
  }, [candidates, query]);

  function toggle(memberId: string) {
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  }

  function save() {
    startTransition(async () => {
      const result = await setAssessmentAudienceAction(cohortId, assessmentId, {
        audience,
        memberIds: [...chosen],
      });
      if (!result.ok) {
        toast.error('Could not save that', result.message);
        return;
      }
      toast.success(
        result.data.audience === 'everyone'
          ? 'Visible to the whole cohort'
          : `Visible to ${result.data.count} ${result.data.count === 1 ? 'student' : 'students'}`,
        status === 'published' ? undefined : 'It takes effect when you publish.',
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <SectionTitle>Who can see this</SectionTitle>
        <p className="text-fg-muted mt-1 text-sm">
          {status === 'published'
            ? 'This assessment is live. Changing the audience takes effect immediately — a student who is not on the list stops seeing it, and cannot start it from a link they kept.'
            : 'Set this now and it applies the moment you publish.'}
        </p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <AudienceChoice
            checked={audience === 'everyone'}
            onSelect={() => setAudience('everyone')}
            title="Everyone in the cohort"
            body="Publishing puts it on every student's assessment list."
          />
          <AudienceChoice
            checked={audience === 'selected'}
            onSelect={() => setAudience('selected')}
            title="Only the students I pick"
            body="Nobody else sees it, or can start it. Open it up later without republishing."
          />
        </div>
      </Card>

      {audience === 'selected' && (
        <Card className="p-5">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-fg text-sm font-bold">
              {chosen.size} of {candidates.length} selected
            </p>
            <div className="ml-auto flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setChosen(new Set(candidates.map((c) => c.memberId)))}
              >
                Select all
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setChosen(new Set())}>
                Clear
              </Button>
            </div>
          </div>

          <TextInput
            label="Find a student"
            className="mt-3"
            placeholder="Name or email"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            hint="Email, because a test account is usually told apart by its address."
          />

          <ul className="divide-border mt-3 max-h-96 divide-y overflow-y-auto">
            {filtered.map((candidate) => {
              const selected = chosen.has(candidate.memberId);
              return (
                <li key={candidate.memberId}>
                  <button
                    type="button"
                    onClick={() => toggle(candidate.memberId)}
                    aria-pressed={selected}
                    className="hover:bg-bg-sunken flex w-full items-center gap-3 px-1 py-2.5 text-left"
                  >
                    <span
                      className={cn(
                        'grid size-5 shrink-0 place-items-center rounded border',
                        selected
                          ? 'border-pulse-600 bg-pulse-600 text-white'
                          : 'border-border-strong',
                      )}
                      aria-hidden
                    >
                      {selected && <Check className="size-3.5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="text-fg block truncate text-sm font-semibold">
                        {candidate.fullName}
                      </span>
                      <span className="text-fg-subtle block truncate text-xs">
                        {candidate.email}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
            {filtered.length === 0 && (
              <li className="text-fg-muted flex items-center gap-2 py-6 text-sm">
                <Search className="size-4" aria-hidden />
                Nobody in this cohort matches that.
              </li>
            )}
          </ul>
        </Card>
      )}

      <Card className="flex flex-wrap items-center gap-3 p-4">
        <Users className="text-fg-subtle size-4 shrink-0" aria-hidden />
        <p className="text-fg-muted min-w-0 flex-1 text-sm">
          {audience === 'everyone'
            ? 'Every student in the cohort will see this once it is published.'
            : chosen.size === 0
              ? 'Pick at least one student — an assessment nobody can see is not a state worth saving.'
              : `${chosen.size} ${chosen.size === 1 ? 'student' : 'students'} will see this. Nobody else can reach it, even with the link.`}
        </p>
        <Button
          size="md"
          loading={pending}
          disabled={audience === 'selected' && chosen.size === 0}
          onClick={save}
        >
          Save audience
        </Button>
      </Card>
    </div>
  );
}

function AudienceChoice({
  checked,
  onSelect,
  title,
  body,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  body: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={checked}
      className={cn(
        'rounded-panel border p-3 text-left transition-colors',
        checked
          ? 'border-pulse-500 bg-pulse-500/8'
          : 'border-border hover:border-border-strong hover:bg-bg-sunken',
      )}
    >
      <span className="flex items-center gap-2">
        <span
          className={cn(
            'grid size-4 shrink-0 place-items-center rounded-full border',
            checked ? 'border-pulse-600 bg-pulse-600' : 'border-border-strong',
          )}
          aria-hidden
        >
          {checked && <span className="size-1.5 rounded-full bg-white" />}
        </span>
        <span className="text-fg text-sm font-bold">{title}</span>
      </span>
      <span className="text-fg-muted mt-1.5 block text-xs">{body}</span>
    </button>
  );
}
