'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { TriangleAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { TextInput } from '@/components/ui/form';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { type RestartImpact, getRestartImpact, restartCohortAction } from '@/server/actions/admin';

/**
 * Restart the cohort from day one.
 *
 * Three deliberate pieces of friction, because this touches every student at once:
 *
 *  1. The impact is *counted on the server* before the dialog opens, so the admin sees the
 *     real number of check-ins and points about to be cleared rather than a vague warning.
 *  2. The cohort name has to be typed. A click is too cheap for something irreversible.
 *  3. The dialog says explicitly what survives, because the fear here is not "did I clear
 *     progress" — it is "did I just delete everyone's accounts".
 */
export function RestartCohortPanel({
  cohortId,
  cohortName,
}: {
  cohortId: string;
  cohortName: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [impact, setImpact] = useState<RestartImpact | null>(null);
  const [confirmation, setConfirmation] = useState('');

  function openDialog() {
    startTransition(async () => {
      const result = await getRestartImpact(cohortId);
      if (!result.ok) {
        toast.error('Could not check the cohort', result.message);
        return;
      }
      setImpact(result.data);
      setConfirmation('');
      setOpen(true);
    });
  }

  function restart() {
    startTransition(async () => {
      const result = await restartCohortAction(cohortId, confirmation);
      if (!result.ok) {
        toast.error('Cohort not restarted', result.message);
        return;
      }
      setOpen(false);
      toast.success('Cohort restarted', 'Everyone is back on day one.');
      router.refresh();
    });
  }

  const matches = confirmation.trim().toLowerCase() === cohortName.trim().toLowerCase();

  return (
    <Card className="border-danger/30 p-5">
      <SectionTitle>Danger zone</SectionTitle>
      <div className="mt-4">
        <h3 className="text-fg text-sm font-bold">Restart this cohort from day one</h3>
        <p className="text-fg-muted mt-1.5 text-sm leading-relaxed">
          Clears cohort progress for every student and sets all roadmap topics back to upcoming.
          Accounts, subject choices and the roadmaps themselves are kept.
        </p>
        <Button variant="danger" className="mt-4" loading={pending && !open} onClick={openDialog}>
          <TriangleAlert className="size-4" aria-hidden />
          Restart cohort…
        </Button>
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title={`Restart ${cohortName}?`}>
        <div className="space-y-5 p-5">
          <div className="border-danger/30 bg-danger/8 rounded-2xl border p-4">
            <p className="text-fg text-sm font-semibold">
              This affects all {impact?.students ?? 0} students in this cohort at once.
            </p>
          </div>

          <div>
            <SectionTitle>What will be cleared</SectionTitle>
            <ul className="mt-3 space-y-1.5">
              <ImpactRow label="Check-ins" value={impact?.checkIns ?? 0} />
              <ImpactRow label="Attendance records" value={impact?.attendance ?? 0} />
              <ImpactRow label="Points ledger entries" value={impact?.pointsEntries ?? 0} />
              <ImpactRow label="Completed roadmap topics" value={impact?.topicsCompleted ?? 0} />
            </ul>
            <p className="text-fg-subtle mt-2 text-xs">
              Streaks, achievements, quiz attempts, study sessions, daily assignments and weekly
              reviews are cleared too.
            </p>
          </div>

          <div>
            <SectionTitle>What will be kept</SectionTitle>
            <p className="text-fg-muted mt-2 text-sm leading-relaxed">
              Student accounts and logins, cohort memberships, their chosen subjects, their goals
              and onboarding answers, and both roadmaps — reset to 0%, not deleted.
            </p>
          </div>

          <TextInput
            label={`Type "${cohortName}" to confirm`}
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder={cohortName}
            autoComplete="off"
          />

          <div className="flex gap-3">
            <Button variant="ghost" fullWidth onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              fullWidth
              disabled={!matches}
              loading={pending && open}
              onClick={restart}
            >
              Restart from day one
            </Button>
          </div>
        </div>
      </Sheet>
    </Card>
  );
}

function ImpactRow({ label, value }: { label: string; value: number }) {
  return (
    <li className="text-fg-muted flex items-center justify-between text-sm">
      <span>{label}</span>
      <span className="text-fg font-bold tabular-nums">{value.toLocaleString()}</span>
    </li>
  );
}
