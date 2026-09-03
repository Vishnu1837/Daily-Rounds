/**
 * How an attempt turns into a result.
 *
 * Pure functions, kept away from the database, because these are the rules the product is
 * judged on and they should be readable and testable without a Postgres in the room: what
 * counts as passed, what a percentage means while half the paper is still awaiting a human,
 * and which encouraging sentence a score earns.
 */

export type QuestionKind = 'mcq' | 'image_mcq' | 'short_answer' | 'long_answer';

/** Whether this kind of question can be marked without a person reading it. */
export function isAutoGradable(type: QuestionKind): boolean {
  return type === 'mcq' || type === 'image_mcq';
}

export type ScoreTally = {
  /** Points earned on auto-gradable questions, out of the points available on them. */
  autoScore: number;
  autoTotal: number;
  /** Points a human has awarded on subjective questions, out of those available. */
  manualScore: number;
  manualTotal: number;
};

/**
 * The percentage to show, and whether it is the final word.
 *
 * A paper that is half MCQ and half essay has no honest single number until the essays are
 * marked, so the percentage is deliberately computed over *marked* questions only and
 * flagged as provisional. Showing a student 40% because the 60% still sitting with their
 * cohort lead counted as zero would be a lie the interface tells for a day.
 */
export function scorePercent(
  tally: ScoreTally,
  reviewComplete: boolean,
): {
  pct: number;
  outOf: number;
  earned: number;
  provisional: boolean;
} {
  const countManual = reviewComplete && tally.manualTotal > 0;
  const outOf = tally.autoTotal + (countManual ? tally.manualTotal : 0);
  const earned = tally.autoScore + (countManual ? tally.manualScore : 0);

  return {
    pct: outOf === 0 ? 0 : Math.round((earned / outOf) * 100),
    outOf,
    earned,
    provisional: !reviewComplete && tally.manualTotal > 0,
  };
}

/** Whether an attempt cleared the pass mark the admin set for this assessment. */
export function isPassed(pct: number, passMarkPct: number): boolean {
  return pct >= passMarkPct;
}

export type FeedbackBand = {
  key: 'excellent' | 'good' | 'revise';
  title: string;
  message: string;
  emoji: string;
};

/**
 * The band a score falls into.
 *
 * Thresholds hang off the assessment's own pass mark rather than being fixed at 80/60/40,
 * so an admin who sets a hard paper at 40% does not have every student who cleared it told
 * they need revision. Only the wording is decided here; whether it is shown at all is the
 * result screen's business.
 */
export function feedbackBand(pct: number, passMarkPct: number): FeedbackBand {
  const excellent = Math.min(95, Math.round(passMarkPct + (100 - passMarkPct) * 0.6));

  if (pct >= excellent) {
    return {
      key: 'excellent',
      title: 'Excellent recall',
      message: 'You knew this cold. Move on to the next topic with confidence.',
      emoji: '🌟',
    };
  }
  if (pct >= passMarkPct) {
    return {
      key: 'good',
      title: 'Good progress',
      message: 'Solid. Worth one more pass over the questions you missed before you move on.',
      emoji: '👍',
    };
  }
  return {
    key: 'revise',
    title: 'Needs revision',
    message: 'This topic has not landed yet. Go back over it before the next assessment.',
    emoji: '📚',
  };
}

/**
 * When a question's clock runs out, in absolute terms.
 *
 * Derived from the server's own timestamp on every read rather than counted down on the
 * client, which is what makes a refresh worthless: the deadline was fixed the moment the
 * question was first shown, and reloading re-derives the same instant.
 */
export function questionDeadline(
  startedAt: Date,
  timeLimitSeconds: number | null,
  defaultSeconds: number,
): Date {
  const seconds = timeLimitSeconds ?? defaultSeconds;
  return new Date(startedAt.getTime() + seconds * 1000);
}

/** Seconds left on a deadline, floored at zero. */
export function secondsRemaining(deadline: Date, now: Date): number {
  return Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / 1000));
}

/**
 * The grace this attempt gets before a focus loss becomes a restart.
 *
 * A small allowance is added to whatever the admin configured, because the browser reports
 * a tab as hidden for reasons that are not the student's doing — an OS notification, a
 * screen lock on a timer, a permission prompt — and the difference between five seconds and
 * five and a half is not evidence of anything.
 */
export function focusBreachThresholdMs(graceSeconds: number): number {
  return Math.max(1000, graceSeconds * 1000) + 500;
}
