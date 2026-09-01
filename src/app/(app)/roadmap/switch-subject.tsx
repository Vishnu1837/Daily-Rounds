'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/form';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { switchActiveSubjectAction } from '@/server/actions/study';

type SubjectOption = { slug: string; name: string; phaseLabel: string };

/**
 * Replacing one of the two active subjects.
 *
 * Deliberately two steps. The brief asks for friction here, because the failure mode this
 * guards against is not a mis-click — it is subject-hopping, a student restarting Anatomy
 * for the third time instead of finishing it. So the confirmation names the subject, states
 * the actual percentage about to be discarded, and says plainly that the *other* subject is
 * untouched, which is the thing students are most likely to fear.
 */
export function SwitchSubjectSheet({
  open,
  onClose,
  slot,
  currentSubjectName,
  currentPct,
  subjects,
}: {
  open: boolean;
  onClose: () => void;
  slot: 'primary' | 'secondary';
  currentSubjectName: string;
  currentPct: number;
  /** Already filtered: excludes this slot's subject and the other slot's subject. */
  subjects: SubjectOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [slug, setSlug] = useState('');
  const [confirming, setConfirming] = useState(false);

  const grouped = useMemo(() => {
    const groups = new Map<string, SubjectOption[]>();
    for (const s of subjects) {
      const list = groups.get(s.phaseLabel);
      if (list) list.push(s);
      else groups.set(s.phaseLabel, [s]);
    }
    return [...groups.entries()];
  }, [subjects]);

  const chosen = subjects.find((s) => s.slug === slug) ?? null;

  function run() {
    if (!chosen) return;
    startTransition(async () => {
      const result = await switchActiveSubjectAction(slot, chosen.slug);
      if (!result.ok) {
        toast.error('Could not switch subject', result.message);
        return;
      }
      setConfirming(false);
      onClose();
      toast.success(
        `Switched to ${chosen.name}`,
        'Your roadmap is built from the syllabus, in teaching order.',
      );
      router.refresh();
    });
  }

  return (
    <>
      <Sheet open={open} onClose={onClose} title={`Change your ${slot} subject`}>
        <div className="space-y-4 p-5">
          <p className="text-fg-muted text-sm">
            You are currently studying <strong className="text-fg">{currentSubjectName}</strong>.
            Every one of the 19 MBBS subjects stays browseable in Syllabus whether or not it is one
            of your two active subjects.
          </p>

          <Select
            label="New subject"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            required
          >
            <option value="">Choose a subject…</option>
            {grouped.map(([phase, options]) => (
              <optgroup key={phase} label={phase}>
                {options.map((s) => (
                  <option key={s.slug} value={s.slug}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>

          <Button
            fullWidth
            size="lg"
            disabled={!chosen}
            onClick={() => (currentPct > 0 ? setConfirming(true) : run())}
            loading={pending && !confirming}
          >
            {currentPct > 0 ? 'Continue' : 'Switch subject'}
          </Button>
        </div>
      </Sheet>

      <Sheet
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Change ${currentSubjectName} to ${chosen?.name}?`}
      >
        <div className="space-y-4 p-5">
          <div className="border-danger/30 bg-danger/8 flex gap-3 rounded-2xl border p-4">
            <AlertTriangle className="text-danger mt-0.5 size-5 shrink-0" aria-hidden />
            <p className="text-fg text-sm">
              You currently have{' '}
              <strong>
                {currentPct}% progress in {currentSubjectName}
              </strong>
              . Replacing this active subject will reset the {currentSubjectName} roadmap progress.
              Your other active subject will remain unchanged.
            </p>
          </div>

          <div className="flex gap-3">
            <Button variant="ghost" fullWidth onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button variant="danger" fullWidth loading={pending} onClick={run}>
              Reset {currentSubjectName} &amp; switch
            </Button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
