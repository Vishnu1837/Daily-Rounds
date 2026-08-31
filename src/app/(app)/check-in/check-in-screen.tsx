'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import {
  AnimatedCheck,
  CelebrationModal,
  type CelebrationPayload,
} from '@/components/gamification/celebration';
import { Button, LinkButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ChoiceGroup, FormError, RatingScale, TextArea, TextInput } from '@/components/ui/form';
import { ProgressBar } from '@/components/ui/progress';
import { useToast } from '@/components/ui/toast';
import { OBSTACLE_LABELS, obstacleValues } from '@/lib/validation';
import { submitCheckInAction } from '@/server/actions/check-in';
import type { CheckInContext } from '@/server/queries/student';

import { WeeklyReviewCard } from './weekly-review';

type Completion = 'completed' | 'partial' | 'none';
type Obstacle = (typeof obstacleValues)[number] | 'none';

const OBSTACLE_OPTIONS = obstacleValues.map((value) => ({
  value,
  label: OBSTACLE_LABELS[value] ?? value,
  emoji: (
    {
      procrastination: '⏳',
      social_media: '📱',
      sleep: '😴',
      classes: '🏥',
      unclear_what_to_study: '🤷',
      lack_of_motivation: '🔋',
      personal: '🏠',
      other: '❓',
    } as Record<string, string>
  )[value],
}));

const SATISFACTION_EMOJI = ['😞', '😕', '😐', '🙂', '😄'];

export function CheckInScreen({
  today,
  context,
  weeklyReview,
}: {
  today: string;
  context: CheckInContext;
  weeklyReview: React.ComponentProps<typeof WeeklyReviewCard>['review'] | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [step, setStep] = useState(0);
  const [celebration, setCelebration] = useState<CelebrationPayload | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | undefined>();
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [completion, setCompletion] = useState<Completion | null>(
    context.existing?.completion ?? null,
  );
  const [minutes, setMinutes] = useState<string>(
    String(context.existing?.actualMinutes ?? context.sessionMinutes ?? ''),
  );
  const [whatStudied, setWhatStudied] = useState(context.existing?.whatStudied ?? '');
  const [obstacle, setObstacle] = useState<Obstacle>('none');
  const [obstacleNote, setObstacleNote] = useState('');
  const [tomorrowTarget, setTomorrowTarget] = useState(
    context.nextTopicTitle ? `${context.nextTopicTitle}` : '',
  );
  const [satisfaction, setSatisfaction] = useState<number | null>(
    context.existing?.satisfaction ?? null,
  );
  const [reflection, setReflection] = useState('');
  const [comebackReason, setComebackReason] = useState('');

  const steps = useMemo(() => {
    const base = ['completion', 'time', 'what', 'obstacle', 'tomorrow', 'satisfaction'] as const;
    return context.comeback.isComeback ? (['comeback', ...base] as const) : base;
  }, [context.comeback.isComeback]);

  const current = steps[step]!;
  const isLast = step === steps.length - 1;

  const canAdvance = (() => {
    switch (current) {
      case 'comeback':
        return true;
      case 'completion':
        return completion !== null;
      case 'time':
        return minutes !== '' && Number(minutes) >= 0;
      case 'what':
        return whatStudied.trim().length >= 3;
      case 'obstacle':
        return completion === 'completed' || obstacle !== 'none';
      case 'tomorrow':
        return true;
      case 'satisfaction':
        return satisfaction !== null;
    }
  })();

  function submit() {
    setFormError(undefined);
    setErrors({});

    const data = new FormData();
    data.set('date', today);
    data.set('completion', completion ?? 'none');
    data.set('actualMinutes', minutes || '0');
    data.set('whatStudied', whatStudied);
    data.set('obstacle', completion === 'completed' ? 'none' : obstacle);
    if (obstacleNote) data.set('obstacleNote', obstacleNote);
    if (tomorrowTarget) data.set('tomorrowTarget', tomorrowTarget);
    data.set('satisfaction', String(satisfaction ?? 3));
    if (reflection) data.set('reflection', reflection);
    if (comebackReason) data.set('comebackReason', comebackReason);

    startTransition(async () => {
      const result = await submitCheckInAction(null, data);
      if (!result.ok) {
        setFormError(result.message);
        setErrors(result.errors ?? {});
        toast.error('Check-in not saved', result.message);
        return;
      }

      setSubmitted(true);
      const { pointsAwarded, streak, milestone, achievements, wasComeback } = result.data;

      setCelebration({
        kind: milestone ? 'milestone' : wasComeback ? 'comeback' : 'day_complete',
        title: milestone
          ? `${milestone}-day streak!`
          : wasComeback
            ? 'Back on rounds'
            : 'Checked in',
        message: milestone
          ? `You have shown up on ${milestone} straight study days.`
          : wasComeback
            ? 'You missed a day and came straight back. That is the whole skill.'
            : achievements[0]
              ? `${achievements[0].emoji} ${achievements[0].name} unlocked — ${achievements[0].description}`
              : 'Logged. See you tomorrow.',
        emoji: milestone ? '🔥' : wasComeback ? '💪' : '✅',
        points: pointsAwarded,
        streak,
      });
      router.refresh();
    });
  }

  if (submitted) {
    return (
      <div className="space-y-4">
        <CelebrationModal payload={celebration} onClose={() => setCelebration(null)} />
        <Card className="p-8 text-center">
          <div className="mx-auto grid size-16 place-items-center rounded-3xl bg-success/12 text-success">
            <AnimatedCheck size={34} />
          </div>
          <h1 className="mt-5 text-2xl font-extrabold text-fg">Check-in complete</h1>
          <p className="mt-2 text-sm text-fg-muted">
            That&apos;s today recorded. Nothing else is asked of you until tomorrow.
          </p>
          <div className="mt-6 space-y-2.5">
            <LinkButton href="/" size="lg" fullWidth>
              Back to today
            </LinkButton>
            <LinkButton href="/progress" variant="outline" size="lg" fullWidth>
              See your progress
            </LinkButton>
          </div>
        </Card>
        {weeklyReview && <WeeklyReviewCard review={weeklyReview} />}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <CelebrationModal payload={celebration} onClose={() => setCelebration(null)} />

      <header className="px-1 pt-2">
        <h1 className="text-2xl font-extrabold tracking-tight text-fg">Daily check-in</h1>
        <p className="mt-1 text-sm text-fg-muted">
          {context.existing
            ? 'You already checked in today. Updating your answers will not award points twice.'
            : 'About 45 seconds. Honest answers are worth more than flattering ones.'}
        </p>
      </header>

      <Card className="overflow-hidden">
        <div className="px-5 pt-5">
          <div className="flex items-center justify-between text-2xs font-bold tracking-[0.14em] text-fg-subtle uppercase">
            <span>
              Step {step + 1} of {steps.length}
            </span>
            <span>{Math.round(((step + 1) / steps.length) * 100)}%</span>
          </div>
          <ProgressBar
            value={((step + 1) / steps.length) * 100}
            className="mt-2"
            height="sm"
            label="Check-in progress"
          />
        </div>

        <div className="px-5 pt-6 pb-5">
          <FormError>{formError}</FormError>

          {/*
            A keyed div with a CSS entrance, not AnimatePresence. `mode="wait"` defers
            mounting the next step until the previous one finishes exiting, so a stalled
            animation would strand the student on the wrong question while the step counter
            advanced. The content must never depend on an animation completing.
          */}
          <div key={current} className="animate-step-in min-h-[19rem]">
              {current === 'comeback' && (
                <Step
                  title={
                    context.comeback.missedDays.length === 1
                      ? 'Yesterday was missed. Today is your comeback.'
                      : `You missed ${context.comeback.missedDays.length} study days. Today is your comeback.`
                  }
                  hint="No judgement — naming it makes it less likely to repeat."
                >
                  <TextArea
                    label="What happened?"
                    value={comebackReason}
                    onChange={(e) => setComebackReason(e.target.value)}
                    placeholder="Postings ran late and I never restarted."
                    rows={3}
                  />
                </Step>
              )}

              {current === 'completion' && (
                <Step title="Did you complete today's target?">
                  <ChoiceGroup
                    name="Completion"
                    value={completion}
                    onChange={(v) => setCompletion(v)}
                    options={[
                      { value: 'completed', label: 'Completed', emoji: '✅', description: 'Finished what I planned.' },
                      { value: 'partial', label: 'Partially', emoji: '🌗', description: 'Made a start, did not finish.' },
                      { value: 'none', label: 'No', emoji: '⭕', description: "Didn't get to it today." },
                    ]}
                  />
                </Step>
              )}

              {current === 'time' && (
                <Step
                  title="How long did you actually study?"
                  hint={
                    context.sessionMinutes > 0
                      ? `Your tracked session was ${context.sessionMinutes} minutes — adjust if that is not the whole picture.`
                      : undefined
                  }
                >
                  <TextInput
                    label="Minutes"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={1440}
                    value={minutes}
                    onChange={(e) => setMinutes(e.target.value)}
                    error={errors.actualMinutes}
                    placeholder="90"
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[30, 45, 60, 90, 120].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMinutes(String(m))}
                        className="tap rounded-pill border border-border bg-bg-elevated px-3.5 py-1.5 text-sm font-semibold text-fg-muted transition-colors hover:border-border-strong hover:text-fg"
                      >
                        {m}m
                      </button>
                    ))}
                  </div>
                </Step>
              )}

              {current === 'what' && (
                <Step
                  title="What did you study?"
                  hint={context.topicTitle ? `Today's topic was ${context.topicTitle}.` : undefined}
                >
                  <TextArea
                    label="A sentence is plenty"
                    value={whatStudied}
                    onChange={(e) => setWhatStudied(e.target.value)}
                    placeholder="Acute inflammation — read the chapter and drew the mediator flowchart from memory."
                    rows={4}
                    error={errors.whatStudied}
                  />
                </Step>
              )}

              {current === 'obstacle' && (
                <Step
                  title={
                    completion === 'completed'
                      ? 'Anything that nearly stopped you?'
                      : 'What stopped you?'
                  }
                  hint="This is the single most useful thing you record. Patterns show up fast."
                >
                  {completion === 'completed' ? (
                    <div className="rounded-2xl bg-success/10 p-4 text-sm font-medium text-success">
                      You finished today — nothing to record here. Tap continue.
                    </div>
                  ) : (
                    <>
                      <ChoiceGroup
                        name="Obstacle"
                        value={obstacle === 'none' ? null : obstacle}
                        onChange={(v) => setObstacle(v)}
                        options={OBSTACLE_OPTIONS}
                        columns={2}
                      />
                      {obstacle === 'other' && (
                        <TextInput
                          className="mt-3"
                          label="Tell us more"
                          value={obstacleNote}
                          onChange={(e) => setObstacleNote(e.target.value)}
                          placeholder="What got in the way?"
                        />
                      )}
                    </>
                  )}
                </Step>
              )}

              {current === 'tomorrow' && (
                <Step
                  title="What's tomorrow's target?"
                  hint="Planning tomorrow is worth points because it is the single best predictor of showing up."
                >
                  <TextArea
                    label="Tomorrow's plan"
                    value={tomorrowTarget}
                    onChange={(e) => setTomorrowTarget(e.target.value)}
                    placeholder="Chronic inflammation — 90 minutes, 6 AM study room."
                    rows={3}
                  />
                  {context.nextTopicTitle && (
                    <button
                      type="button"
                      onClick={() => setTomorrowTarget(context.nextTopicTitle!)}
                      className="tap mt-2.5 rounded-pill border border-border bg-bg-elevated px-3.5 py-1.5 text-sm font-semibold text-fg-muted hover:text-fg"
                    >
                      Use next roadmap topic
                    </button>
                  )}
                </Step>
              )}

              {current === 'satisfaction' && (
                <Step title="How satisfied are you with today?">
                  <div className="mb-4 flex justify-center gap-2" aria-hidden>
                    {SATISFACTION_EMOJI.map((emoji, i) => (
                      <span
                        key={emoji}
                        className={`text-3xl transition-all duration-200 ${
                          satisfaction === i + 1 ? 'scale-125' : 'scale-90 opacity-35'
                        }`}
                      >
                        {emoji}
                      </span>
                    ))}
                  </div>
                  <RatingScale
                    name="Satisfaction"
                    value={satisfaction}
                    onChange={setSatisfaction}
                    lowLabel="Not at all"
                    highLabel="Very"
                  />
                  <div className="mt-5">
                    <TextArea
                      label="Anything worth remembering? (optional, +10 points)"
                      value={reflection}
                      onChange={(e) => setReflection(e.target.value)}
                      placeholder="The 6 AM slot works far better than evenings. Keep it."
                      rows={3}
                    />
                  </div>
                </Step>
              )}
          </div>
        </div>

        <div className="flex gap-2.5 border-t border-border px-5 py-4">
          {step > 0 && (
            <Button variant="outline" size="lg" onClick={() => setStep((s) => s - 1)}>
              Back
            </Button>
          )}
          <Button
            size="lg"
            className="flex-1"
            disabled={!canAdvance}
            loading={pending}
            onClick={() => (isLast ? submit() : setStep((s) => s + 1))}
          >
            {isLast ? 'Submit check-in' : 'Continue'}
          </Button>
        </div>
      </Card>

      {weeklyReview && <WeeklyReviewCard review={weeklyReview} />}
    </div>
  );
}

function Step({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="text-lg font-extrabold text-balance text-fg">{title}</h2>
      {hint && <p className="mt-1.5 text-sm text-fg-muted">{hint}</p>}
      <div className="mt-5">{children}</div>
    </div>
  );
}
