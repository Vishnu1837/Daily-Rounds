'use client';

import { useMemo, useState, useTransition } from 'react';

import { Logo } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  ChoiceGroup,
  Field,
  FormError,
  RatingScale,
  Select,
  TextArea,
  TextInput,
} from '@/components/ui/form';
import { cn } from '@/lib/cn';
import { OBSTACLE_LABELS, obstacleValues } from '@/lib/validation';
import { completeOnboardingAction } from '@/server/actions/onboarding';
import { DEFAULT_TIMEZONE, TIMEZONE_GROUPS } from '@/lib/timezones';

type Subject = { id: string; name: string; phaseLabel: string };

/** Groups the subject list by MBBS phase, preserving course order within each phase. */
function byPhase(subjects: Subject[]): { phase: string; subjects: Subject[] }[] {
  const groups: { phase: string; subjects: Subject[] }[] = [];
  for (const subject of subjects) {
    const last = groups[groups.length - 1];
    if (last && last.phase === subject.phaseLabel) last.subjects.push(subject);
    else groups.push({ phase: subject.phaseLabel, subjects: [subject] });
  }
  return groups;
}

const STEPS = [
  { key: 'welcome', title: 'Welcome to Daily Rounds' },
  { key: 'about', title: 'About you' },
  { key: 'subject', title: 'What are you studying?' },
  { key: 'commitment', title: 'Your daily commitment' },
  { key: 'baseline', title: 'Where you are starting' },
  { key: 'obstacle', title: 'What gets in the way' },
] as const;

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

export function OnboardingWizard({
  defaultName,
  subjects,
}: {
  defaultName: string;
  subjects: Subject[];
}) {
  const [step, setStep] = useState(0);
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | undefined>();
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [fullName, setFullName] = useState(defaultName);
  const [whatsapp, setWhatsapp] = useState('');
  const [university, setUniversity] = useState('');
  const [mbbsYear, setMbbsYear] = useState('');
  /*
   * Defaulted rather than auto-detected. Reading the browser's zone would disagree with
   * whatever the server rendered and produce a hydration mismatch, and the brief wants this
   * to be a student-selected value anyway — so it is an explicit choice, pre-set to the
   * cohort's most common zone.
   */
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);

  const [primarySubjectId, setPrimarySubjectId] = useState('');
  const [secondarySubjectId, setSecondarySubjectId] = useState('');
  const [cohortGoal, setCohortGoal] = useState('');

  const [dailyMinutes, setDailyMinutes] = useState('90');
  const [examName, setExamName] = useState('');
  const [examDate, setExamDate] = useState('');

  const [baselineDays, setBaselineDays] = useState<number | null>(null);
  const [baselineConsistency, setBaselineConsistency] = useState<number | null>(null);
  const [baselineConfidence, setBaselineConfidence] = useState<number | null>(null);

  const [obstacle, setObstacle] = useState<(typeof obstacleValues)[number] | null>(null);
  const [obstacleNote, setObstacleNote] = useState('');

  const current = STEPS[step]!;
  const isLast = step === STEPS.length - 1;

  const canAdvance = useMemo(() => {
    switch (current.key) {
      case 'welcome':
        return true;
      case 'about':
        return (
          fullName.trim().length >= 2 &&
          whatsapp.trim().length >= 7 &&
          university.trim().length >= 2 &&
          mbbsYear !== ''
        );
      case 'subject':
        return primarySubjectId !== '' && cohortGoal.trim().length >= 10;
      case 'commitment':
        return Number(dailyMinutes) >= 15;
      case 'baseline':
        return baselineDays !== null && baselineConsistency !== null && baselineConfidence !== null;
      case 'obstacle':
        return obstacle !== null;
    }
  }, [
    current.key,
    fullName,
    whatsapp,
    university,
    mbbsYear,
    primarySubjectId,
    cohortGoal,
    dailyMinutes,
    baselineDays,
    baselineConsistency,
    baselineConfidence,
    obstacle,
  ]);

  function submit() {
    setFormError(undefined);
    setErrors({});
    const data = new FormData();
    data.set('fullName', fullName);
    data.set('whatsapp', whatsapp);
    data.set('university', university);
    data.set('mbbsYear', mbbsYear);
    data.set('timezone', timezone);
    data.set('primarySubjectId', primarySubjectId);
    if (secondarySubjectId) data.set('secondarySubjectId', secondarySubjectId);
    data.set('cohortGoal', cohortGoal);
    data.set('dailyCommitmentMinutes', dailyMinutes);
    if (examName) data.set('examName', examName);
    if (examDate) data.set('examDate', examDate);
    data.set('baselineDaysStudiedLastWeek', String(baselineDays ?? 0));
    data.set('baselineConsistencyRating', String(baselineConsistency ?? 5));
    data.set('baselineConfidence', String(baselineConfidence ?? 3));
    data.set('biggestObstacle', obstacle ?? 'other');
    if (obstacleNote) data.set('obstacleNote', obstacleNote);

    startTransition(async () => {
      const result = await completeOnboardingAction(null, data);
      if (result && !result.ok) {
        setFormError(result.message);
        setErrors(result.errors ?? {});
      }
    });
  }

  return (
    <div>
      <div className="mb-7 flex justify-center">
        <Logo size={36} />
      </div>

      {/*
        A labelled rail rather than a bare percentage. Onboarding is the one flow where
        someone has no idea how long it is, and "step 3 of 6, and the next one is about your
        commitment" is a far better answer to that than "50%".
      */}
      <ol className="mb-5 flex items-center gap-1.5" aria-label="Onboarding steps">
        {STEPS.map((s, i) => (
          <li key={s.key} className="flex-1">
            <span
              className={cn(
                'rounded-pill ease-out-soft block h-1.5 transition-all duration-500',
                i < step
                  ? 'bg-success'
                  : i === step
                    ? 'from-pulse-500 to-iris-400 bg-linear-to-r'
                    : 'bg-bg-inset',
              )}
            />
            <span className="sr-only">
              {s.title}
              {i < step ? ' (done)' : i === step ? ' (current)' : ''}
            </span>
          </li>
        ))}
      </ol>

      <Card padding="none" className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 pt-5">
          <span className="eyebrow">
            Step {step + 1} of {STEPS.length}
          </span>
          <span className="stat-num text-pulse-700 dark:text-pulse-300 text-sm">
            {Math.round(((step + 1) / STEPS.length) * 100)}%
          </span>
        </div>

        <div className="px-5 pt-5 pb-5">
          <FormError>{formError}</FormError>

          {/* CSS entrance only — the step's content never waits on an animation. */}
          <div key={current.key} className="animate-step-in min-h-[22rem]">
            <h1 className="text-fg text-2xl font-extrabold text-balance">{current.title}</h1>

            {current.key === 'welcome' && (
              <div className="mt-4 space-y-4">
                <p className="text-fg-muted text-sm leading-relaxed">
                  You almost certainly already have enough study material. What is hard is sitting
                  down and doing the work you said you would, day after day.
                </p>
                <p className="text-fg-muted text-sm leading-relaxed">
                  Daily Rounds measures one thing:{' '}
                  <strong className="text-fg">did you show up?</strong> Not how clever you are. Not
                  your marks. Whether you turned up and did what you committed to.
                </p>
                <ul className="surface-sunken space-y-2.5 p-4">
                  {[
                    ['📋', 'Plan tomorrow the night before'],
                    ['📻', 'Show up to the study room'],
                    ['⏱️', 'Do the block you committed to'],
                    ['✅', 'Check in — takes under a minute'],
                    ['🔥', 'Watch the streak grow'],
                  ].map(([emoji, text]) => (
                    <li key={text} className="text-fg flex items-center gap-3 text-sm font-medium">
                      <span aria-hidden>{emoji}</span>
                      {text}
                    </li>
                  ))}
                </ul>
                <p className="text-fg-subtle text-sm">
                  Weekends and cohort holidays never break your streak.
                </p>
              </div>
            )}

            {current.key === 'about' && (
              <div className="mt-5 space-y-4">
                <TextInput
                  label="Full name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  error={errors.fullName}
                />
                <TextInput
                  label="WhatsApp number"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  inputMode="tel"
                  placeholder="+91 98765 43210"
                  hint="Used only by your cohort lead for reminders."
                  required
                  error={errors.whatsapp}
                />
                <TextInput
                  label="University"
                  value={university}
                  onChange={(e) => setUniversity(e.target.value)}
                  placeholder="Government Medical College, Kozhikode"
                  required
                  error={errors.university}
                />
                <Select
                  label="MBBS year"
                  value={mbbsYear}
                  onChange={(e) => setMbbsYear(e.target.value)}
                  required
                  error={errors.mbbsYear}
                >
                  <option value="">Select your year</option>
                  {[1, 2, 3, 4, 5].map((y) => (
                    <option key={y} value={y}>
                      Year {y}
                    </option>
                  ))}
                </Select>
                <Select
                  label="Timezone"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  hint="Your study days are counted in this timezone."
                >
                  {TIMEZONE_GROUPS.map((group) => (
                    <optgroup key={group.region} label={group.region}>
                      {group.zones.map((zone) => (
                        <option key={zone.id} value={zone.id}>
                          {zone.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </Select>
              </div>
            )}

            {current.key === 'subject' && (
              <div className="mt-5 space-y-4">
                <p className="text-fg-muted text-sm">
                  Everyone in the cohort works on their own subject — your roadmap is yours alone.
                </p>
                <Select
                  label="Primary subject"
                  value={primarySubjectId}
                  onChange={(e) => setPrimarySubjectId(e.target.value)}
                  required
                  error={errors.primarySubjectId}
                >
                  <option value="">Choose a subject</option>
                  {byPhase(subjects).map((group) => (
                    <optgroup key={group.phase} label={group.phase}>
                      {group.subjects.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </Select>
                <Select
                  label="Secondary subject (optional)"
                  value={secondarySubjectId}
                  onChange={(e) => setSecondarySubjectId(e.target.value)}
                >
                  <option value="">None</option>
                  {byPhase(subjects.filter((s) => s.id !== primarySubjectId)).map((group) => (
                    <optgroup key={group.phase} label={group.phase}>
                      {group.subjects.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </Select>
                <TextArea
                  label="What do you want to finish during this cohort?"
                  value={cohortGoal}
                  onChange={(e) => setCohortGoal(e.target.value)}
                  placeholder="Finish the whole of General Pathology before the second internal exam."
                  rows={3}
                  required
                  error={errors.cohortGoal}
                />
              </div>
            )}

            {current.key === 'commitment' && (
              <div className="mt-5 space-y-5">
                <Field
                  label="Realistic daily study commitment"
                  hint="Be honest rather than ambitious. A finished 60 minutes beats an abandoned 120."
                >
                  <div className="grid grid-cols-3 gap-2">
                    {[30, 45, 60, 90, 120, 150].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setDailyMinutes(String(m))}
                        className={`tap h-14 rounded-2xl border text-sm font-bold transition-all active:scale-95 ${
                          dailyMinutes === String(m)
                            ? 'border-pulse-500 bg-pulse-600 dark:bg-pulse-500 dark:text-ink-950 text-white'
                            : 'border-border bg-bg-elevated text-fg-muted hover:border-border-strong'
                        }`}
                      >
                        {m} min
                      </button>
                    ))}
                  </div>
                </Field>
                <TextInput
                  label="Upcoming exam or deadline (optional)"
                  value={examName}
                  onChange={(e) => setExamName(e.target.value)}
                  placeholder="Pathology Internal II"
                />
                <TextInput
                  label="When is it? (optional)"
                  type="date"
                  value={examDate}
                  onChange={(e) => setExamDate(e.target.value)}
                />
              </div>
            )}

            {current.key === 'baseline' && (
              <div className="mt-5 space-y-6">
                <p className="text-fg-muted text-sm">
                  We record this once so you can see exactly how much changed by the end of the
                  cohort.
                </p>
                <Field label="How many days did you study properly last week?">
                  <div className="grid grid-cols-8 gap-1.5">
                    {[0, 1, 2, 3, 4, 5, 6, 7].map((d) => (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={baselineDays === d}
                        onClick={() => setBaselineDays(d)}
                        className={`tap h-12 rounded-xl border text-sm font-bold transition-all active:scale-95 ${
                          baselineDays === d
                            ? 'border-pulse-500 bg-pulse-600 dark:bg-pulse-500 dark:text-ink-950 text-white'
                            : 'border-border bg-bg-elevated text-fg-muted hover:border-border-strong'
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="How consistent do you feel right now?">
                  <RatingScale
                    name="Consistency rating"
                    value={baselineConsistency}
                    onChange={setBaselineConsistency}
                    max={10}
                    lowLabel="Not at all"
                    highLabel="Very consistent"
                  />
                </Field>
                <Field label="How confident are you in your chosen subject?">
                  <RatingScale
                    name="Subject confidence"
                    value={baselineConfidence}
                    onChange={setBaselineConfidence}
                    max={5}
                    lowLabel="Lost"
                    highLabel="Confident"
                  />
                </Field>
              </div>
            )}

            {current.key === 'obstacle' && (
              <div className="mt-5 space-y-4">
                <p className="text-fg-muted text-sm">
                  What is the single biggest thing that breaks your consistency?
                </p>
                <ChoiceGroup
                  name="Biggest obstacle"
                  value={obstacle}
                  onChange={setObstacle}
                  options={OBSTACLE_OPTIONS}
                  columns={2}
                />
                {obstacle === 'other' && (
                  <TextInput
                    label="Tell us more"
                    value={obstacleNote}
                    onChange={(e) => setObstacleNote(e.target.value)}
                  />
                )}
              </div>
            )}
          </div>
        </div>

        <div className="border-border bg-bg-sunken/60 flex gap-2.5 border-t px-5 py-4">
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
            {isLast ? 'Start my first round' : step === 0 ? "I'm in" : 'Continue'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
