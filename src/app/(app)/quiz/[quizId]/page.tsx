import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { asc, eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { quizQuestions, quizzes } from '@/db/schema';
import { requireOnboardedUser } from '@/lib/auth/guards';
import { getMemberContext } from '@/server/context';

import { QuizScreen } from './quiz-screen';

export const metadata: Metadata = { title: 'Knowledge check' };
export const dynamic = 'force-dynamic';

export default async function QuizPage({ params }: { params: Promise<{ quizId: string }> }) {
  const user = await requireOnboardedUser();
  const ctx = await getMemberContext(user);
  if (!ctx) redirect('/admin');

  const { quizId } = await params;

  const rows = await db.select().from(quizzes).where(eq(quizzes.id, quizId)).limit(1);
  const quiz = rows[0];
  if (!quiz) notFound();

  // Correct answers are deliberately not sent to the client — grading happens server-side.
  const questions = await db
    .select({
      id: quizQuestions.id,
      prompt: quizQuestions.prompt,
      options: quizQuestions.options,
    })
    .from(quizQuestions)
    .where(eq(quizQuestions.quizId, quiz.id))
    .orderBy(asc(quizQuestions.id));

  if (questions.length === 0) notFound();

  return (
    <QuizScreen
      quizId={quiz.id}
      title={quiz.title}
      topicKey={quiz.topicKey}
      questions={questions}
      attemptPoints={ctx.rules.quiz_attempt}
      bonusPoints={ctx.rules.quiz_bonus}
    />
  );
}
