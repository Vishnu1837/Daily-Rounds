'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { AnimatedCheck } from '@/components/gamification/celebration';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormError, RatingScale, TextArea } from '@/components/ui/form';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import { submitWeeklyReviewAction } from '@/server/actions/check-in';

export type WeeklyReviewData = {
  weekStart: string;
  current: { consistencyPct: number; completedDays: number; activeDays: number; studyMinutes: number };
  previous: { consistencyPct: number };
  deltaPct: number;
  streak: number;
  attendancePresent: number;
  topicsCompleted: number;
};

export function WeeklyReviewCard({ review }: { review: WeeklyReviewData }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [wentWell, setWentWell] = useState('');
  const [stopped, setStopped] = useState('');
  const [change, setChange] = useState('');
  const [confidence, setConfidence] = useState<number | null>(null);
  const [error, setError] = useState<string | undefined>();

  const hours = Math.floor(review.current.studyMinutes / 60);
  const mins = review.current.studyMinutes % 60;

  function submit() {
    setError(undefined);
    const data = new FormData();
    data.set('weekStart', review.weekStart);
    data.set('whatWentWell', wentWell);
    data.set('whatStopped', stopped);
    data.set('whatToChange', change);
    data.set('subjectConfidence', String(confidence ?? 3));

    startTransition(async () => {
      const result = await submitWeeklyReviewAction(null, data);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setDone(true);
      setOpen(false);
      toast.success('Weekly review saved', `+${result.data.points} points`);
      router.refresh();
    });
  }

  if (done) {
    return (
      <Card className="flex items-center gap-3 p-5 text-success">
        <AnimatedCheck size={20} />
        <p className="text-sm font-bold">Weekly review submitted. Enjoy the weekend.</p>
      </Card>
    );
  }

  return (
    <>
      <Card className="overflow-hidden">
        <div className="bg-linear-to-br from-iris-500/12 to-transparent p-5">
          <h2 className="text-2xs font-bold tracking-[0.14em] text-fg-subtle uppercase">
            Your week
          </h2>
          <p className="mt-2 text-3xl font-extrabold text-fg">
            {review.current.consistencyPct}%
            {review.deltaPct !== 0 && (
              <span
                className={cn(
                  'ml-2 text-base font-bold',
                  review.deltaPct > 0 ? 'text-success' : 'text-danger',
                )}
              >
                {review.deltaPct > 0 ? '↑' : '↓'} {Math.abs(review.deltaPct)} pts
              </span>
            )}
          </p>
          <p className="mt-0.5 text-sm text-fg-muted">
            consistency this week{' '}
            {review.previous.consistencyPct > 0 && `· last week ${review.previous.consistencyPct}%`}
          </p>

          <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Showed up" value={`${review.current.completedDays}/${review.current.activeDays}`} />
            <Stat label="Attendance" value={`${review.attendancePresent}`} />
            <Stat label="Topics done" value={`${review.topicsCompleted}`} />
            <Stat label="Study time" value={mins ? `${hours}h ${mins}m` : `${hours}h`} />
          </dl>

          <Button size="lg" fullWidth className="mt-5" onClick={() => setOpen(true)}>
            Reflect on the week (+15)
          </Button>
        </div>
      </Card>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Weekly review"
        description="Three short answers. This is the part that actually changes next week."
        footer={
          <Button
            size="lg"
            fullWidth
            loading={pending}
            disabled={
              wentWell.trim().length < 3 ||
              stopped.trim().length < 3 ||
              change.trim().length < 3 ||
              confidence === null
            }
            onClick={submit}
          >
            Submit review
          </Button>
        }
      >
        <div className="space-y-5 pt-2">
          <FormError>{error}</FormError>
          <TextArea
            label="What went well?"
            value={wentWell}
            onChange={(e) => setWentWell(e.target.value)}
            placeholder="Joining the 6 AM room three days running — I finished the block every one of those days."
          />
          <TextArea
            label="What stopped you?"
            value={stopped}
            onChange={(e) => setStopped(e.target.value)}
            placeholder="Thursday postings ran to 8 PM and I never restarted."
          />
          <TextArea
            label="What will you change next week?"
            value={change}
            onChange={(e) => setChange(e.target.value)}
            placeholder="Drop the target to 60 minutes on posting days so I actually finish it."
          />
          <div>
            <p className="mb-2 text-sm font-semibold text-fg">
              How confident are you in your subject now?
            </p>
            <RatingScale
              name="Subject confidence"
              value={confidence}
              onChange={setConfidence}
              lowLabel="Not at all"
              highLabel="Very confident"
            />
          </div>
        </div>
      </Sheet>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-2xs font-bold tracking-[0.1em] text-fg-subtle uppercase">{label}</dt>
      <dd className="mt-1 text-lg font-extrabold text-fg">{value}</dd>
    </div>
  );
}
