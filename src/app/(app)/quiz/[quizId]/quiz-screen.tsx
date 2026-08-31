'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, X } from 'lucide-react';

import { Button, LinkButton } from '@/components/ui/button';
import { Card, CardAurora } from '@/components/ui/card';
import { FormError } from '@/components/ui/form';
import { ProgressBar } from '@/components/ui/progress';
import { cn } from '@/lib/cn';
import { type QuizResult, submitQuizAction } from '@/server/actions/quiz';

type Question = { id: string; prompt: string; options: string[] };

export function QuizScreen({
  quizId,
  title,
  topicKey,
  questions,
  attemptPoints,
  bonusPoints,
}: {
  quizId: string;
  title: string;
  topicKey: string;
  questions: Question[];
  attemptPoints: number;
  bonusPoints: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<number[]>(() => questions.map(() => -1));
  const [result, setResult] = useState<QuizResult | null>(null);
  const [error, setError] = useState<string | undefined>();

  const question = questions[index]!;
  const isLast = index === questions.length - 1;
  const chosen = answers[index] ?? -1;

  function choose(optionIndex: number) {
    setAnswers((prev) => prev.map((v, i) => (i === index ? optionIndex : v)));
  }

  function submit() {
    setError(undefined);
    startTransition(async () => {
      const res = await submitQuizAction({ quizId, answers });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setResult(res.data);
      router.refresh();
    });
  }

  /* --------------------------------------------------------------- result */
  if (result) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Card
          variant="solid"
          tone="pulse"
          padding="lg"
          glow
          className="animate-rise overflow-hidden text-center text-white"
        >
          <CardAurora tone="pulse" />
          <div className="relative py-3">
            <p className="text-2xs font-bold tracking-[0.16em] text-white/60 uppercase">
              Knowledge check
            </p>
            <p className="stat-num text-stat-xl mt-4">
              {result.score}
              <span className="text-3xl text-white/50">/{result.total}</span>
            </p>
            <p className="rounded-pill mt-5 inline-flex items-center gap-2 bg-white/15 px-3.5 py-1.5 text-sm font-bold ring-1 ring-white/20 ring-inset">
              +{result.pointsAwarded} XP for checking your understanding
            </p>
            <p className="mx-auto mt-3 max-w-sm text-sm text-balance text-white/70">
              Your score barely moves your standing — attempting is what counts here. Consistency is
              what the leaderboard measures.
            </p>
          </div>
        </Card>

        <Card padding="none" className="overflow-hidden">
          <p className="eyebrow px-5 pt-5">Review</p>
          <ul className="divide-border border-border mt-3 divide-y border-t">
            {result.review.map((r, i) => {
              const correct = r.chosenIndex === r.correctIndex;
              return (
                <li key={i} className="p-4">
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        'mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-white',
                        correct ? 'bg-success-strong' : 'bg-danger',
                      )}
                      aria-hidden
                    >
                      {correct ? (
                        <Check className="size-3.5" strokeWidth={3} />
                      ) : (
                        <X className="size-3.5" strokeWidth={3} />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="text-fg text-sm font-semibold">{r.prompt}</p>
                      <p className="text-fg-muted mt-1.5 text-sm">
                        <span className="text-fg font-bold">
                          {questions[i]?.options[r.correctIndex]}
                        </span>{' '}
                        is correct.
                      </p>
                      {r.explanation && (
                        <p className="rounded-panel bg-bg-sunken text-fg-muted mt-1.5 p-3 text-sm leading-relaxed">
                          {r.explanation}
                        </p>
                      )}
                      <span className="sr-only">
                        {correct ? 'You answered correctly' : 'You answered incorrectly'}
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>

        <div className="space-y-2.5">
          <LinkButton href="/check-in" size="lg" fullWidth>
            Do your check-in
          </LinkButton>
          <LinkButton href="/materials" variant="outline" size="lg" fullWidth>
            Back to materials
          </LinkButton>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------ questions */
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link
        href="/materials"
        className="tap text-fg-muted hover:text-fg inline-flex items-center gap-1.5 rounded-lg px-1 py-2 text-sm font-semibold transition-colors"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Materials
      </Link>

      <header className="px-1">
        <p className="eyebrow">{topicKey}</p>
        <h1 className="text-fg mt-1.5 text-2xl font-extrabold tracking-tight">{title}</h1>
        <p className="text-fg-muted mt-1.5 text-sm">
          Worth {attemptPoints} XP for attempting, up to {bonusPoints} more for accuracy.
        </p>
      </header>

      <Card padding="none" className="overflow-hidden">
        <div className="px-5 pt-5">
          <div className="flex items-center justify-between gap-3">
            <span className="eyebrow">
              Question {index + 1} of {questions.length}
            </span>
            <ol className="flex items-center gap-1.5" aria-hidden>
              {questions.map((q, i) => (
                <li
                  key={q.id}
                  className={cn(
                    'size-2 rounded-full transition-all duration-300',
                    (answers[i] ?? -1) >= 0 && i !== index
                      ? 'bg-pulse-400'
                      : i === index
                        ? 'from-pulse-500 to-pulse-600 w-5 bg-linear-to-r'
                        : 'bg-bg-inset',
                  )}
                />
              ))}
            </ol>
          </div>
          <ProgressBar
            value={((index + 1) / questions.length) * 100}
            className="mt-3"
            height="sm"
            label="Quiz progress"
          />
        </div>

        <div className="px-5 pt-6 pb-5">
          <FormError>{error}</FormError>
          {/* CSS entrance only — the question never waits on an animation. */}
          <div key={question.id} className="animate-step-in">
            <h2 className="text-fg text-lg font-bold text-balance">{question.prompt}</h2>
            <div role="radiogroup" aria-label={question.prompt} className="mt-5 space-y-2.5">
              {question.options.map((option, i) => (
                <button
                  key={i}
                  type="button"
                  role="radio"
                  aria-checked={chosen === i}
                  onClick={() => choose(i)}
                  className={cn(
                    'tap rounded-panel ease-out-soft flex w-full items-center gap-3.5 border p-4 text-left transition-all duration-200',
                    'active:scale-[0.99] motion-reduce:active:scale-100',
                    chosen === i
                      ? 'border-pulse-500 bg-pulse-500/10 shadow-glow-pulse'
                      : 'border-border bg-bg-elevated hover:border-pulse-300 hover:shadow-soft hover:-translate-y-0.5 motion-reduce:hover:translate-y-0',
                  )}
                >
                  <span
                    className={cn(
                      'grid size-8 shrink-0 place-items-center rounded-xl text-xs font-bold transition-colors',
                      chosen === i
                        ? 'from-pulse-500 to-pulse-600 bg-linear-to-br text-white'
                        : 'bg-bg-sunken text-fg-subtle',
                    )}
                    aria-hidden
                  >
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className="text-fg text-sm font-medium">{option}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="border-border bg-bg-sunken/60 flex gap-2.5 border-t px-5 py-4">
          {index > 0 && (
            <Button variant="outline" size="lg" onClick={() => setIndex((i) => i - 1)}>
              Back
            </Button>
          )}
          <Button
            size="lg"
            className="flex-1"
            disabled={chosen === -1}
            loading={pending}
            onClick={() => (isLast ? submit() : setIndex((i) => i + 1))}
          >
            {isLast ? 'Submit answers' : 'Next'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
