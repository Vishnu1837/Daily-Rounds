'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { Button, LinkButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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

  if (result) {
    return (
      <div className="space-y-4">
        <Card className="overflow-hidden">
          <div className="bg-linear-to-br from-pulse-500/14 to-transparent p-7 text-center">
            <p className="text-5xl font-extrabold text-fg">
              {result.score}
              <span className="text-2xl text-fg-muted">/{result.total}</span>
            </p>
            <p className="mt-3 text-sm font-semibold text-fg">
              +{result.pointsAwarded} points for showing up and checking your understanding
            </p>
            <p className="mx-auto mt-2 max-w-xs text-sm text-balance text-fg-muted">
              Your score barely moves your standing — attempting is what counts here. Consistency is
              what the leaderboard measures.
            </p>
          </div>
        </Card>

        <Card className="divide-y divide-border p-0">
          {result.review.map((r, i) => {
            const correct = r.chosenIndex === r.correctIndex;
            return (
              <div key={i} className="p-4">
                <div className="flex items-start gap-2.5">
                  <span
                    className={cn(
                      'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-2xs font-bold text-white',
                      correct ? 'bg-success' : 'bg-danger',
                    )}
                    aria-hidden
                  >
                    {correct ? '✓' : '✕'}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-fg">{r.prompt}</p>
                    <p className="mt-1.5 text-sm text-fg-muted">
                      <span className="font-bold text-fg">
                        {questions[i]?.options[r.correctIndex]}
                      </span>{' '}
                      is correct.
                    </p>
                    {r.explanation && (
                      <p className="mt-1 text-sm leading-relaxed text-fg-subtle">{r.explanation}</p>
                    )}
                    <span className="sr-only">
                      {correct ? 'You answered correctly' : 'You answered incorrectly'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
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

  return (
    <div className="space-y-4">
      <Link
        href="/materials"
        className="tap inline-flex items-center gap-1.5 px-1 py-2 text-sm font-semibold text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Materials
      </Link>

      <header className="px-1">
        <h1 className="text-xl font-extrabold text-fg">{title}</h1>
        <p className="mt-1 text-sm text-fg-muted">
          {topicKey} · worth {attemptPoints} points for attempting, up to {bonusPoints} more for
          accuracy.
        </p>
      </header>

      <Card className="overflow-hidden">
        <div className="px-5 pt-5">
          <div className="flex items-center justify-between text-2xs font-bold tracking-[0.14em] text-fg-subtle uppercase">
            <span>
              Question {index + 1} of {questions.length}
            </span>
          </div>
          <ProgressBar
            value={((index + 1) / questions.length) * 100}
            className="mt-2"
            height="sm"
            label="Quiz progress"
          />
        </div>

        <div className="px-5 pt-6 pb-5">
          <FormError>{error}</FormError>
          {/* CSS entrance only — the question never waits on an animation. */}
          <div key={question.id} className="animate-step-in">
              <h2 className="text-lg font-bold text-balance text-fg">{question.prompt}</h2>
              <div role="radiogroup" aria-label={question.prompt} className="mt-5 space-y-2">
                {question.options.map((option, i) => (
                  <button
                    key={i}
                    type="button"
                    role="radio"
                    aria-checked={chosen === i}
                    onClick={() => choose(i)}
                    className={cn(
                      'tap flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-all',
                      'active:scale-[0.99] motion-reduce:active:scale-100',
                      chosen === i
                        ? 'border-pulse-500 bg-pulse-500/10 ring-2 ring-pulse-500/25'
                        : 'border-border bg-bg-elevated hover:border-border-strong hover:bg-bg-sunken',
                    )}
                  >
                    <span
                      className={cn(
                        'grid size-7 shrink-0 place-items-center rounded-lg text-xs font-bold',
                        chosen === i
                          ? 'bg-pulse-600 text-white dark:bg-pulse-500 dark:text-ink-950'
                          : 'bg-bg-sunken text-fg-subtle',
                      )}
                      aria-hidden
                    >
                      {String.fromCharCode(65 + i)}
                    </span>
                    <span className="text-sm font-medium text-fg">{option}</span>
                  </button>
                ))}
              </div>
          </div>
        </div>

        <div className="flex gap-2.5 border-t border-border px-5 py-4">
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
