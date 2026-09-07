/**
 * What the app already knows about a student's day, before they type anything.
 *
 * The check-in is the only place several numbers come from, and it is a six-step form at the
 * end of a long day. When it is not filled in, the work still happened — the study block ran,
 * the rounds grew, the topic was assigned — but the day scores as though it did not, because
 * `daily_check_in` and `tomorrow_plan` are behaviour events and the minutes are read from the
 * check-in in preference to the tracked session. Real work disappearing because a form was
 * not completed is the failure this module exists to reduce.
 *
 * So the form opens already answered, from records the student cannot dispute because they
 * made them. Three rules keep that honest:
 *
 *   1. **Everything is editable.** These are defaults, never submissions. The student is the
 *      authority on their own day and the full form stays exactly as it was.
 *   2. **Nothing is invented.** A field is pre-filled only where a source record says
 *      something specific. With no evidence the field is left empty rather than guessed at,
 *      because a wrong default is worse than an empty one: it is a number the student did not
 *      choose, arriving under their own name.
 *   3. **Nothing is pre-filled downward.** `completion` is never guessed as `none` — see
 *      `inferCompletion`. Telling someone their day was a failure is a claim that needs
 *      evidence this module does not have.
 *
 * Pure, so both the pre-fill and its tests read the same rules.
 */
export type CheckInEvidence = {
  /** Topic titles assigned for the day, in slot order. */
  assignedTopics: string[];
  /** Minutes banked by study blocks today, from the server's own timing. */
  sessionMinutes: number;
  /** Focus rounds that grew today, and the minutes they were worth. */
  grownRounds: number;
  groveMinutes: number;
  /** True when the student ticked today's target off. */
  targetCompleted: boolean;
};

export type CheckInPrefill = {
  /** Suggested answer for "what did you study?", or null when nothing is known. */
  whatStudied: string | null;
  /** Suggested minutes, or null when nothing was tracked. */
  actualMinutes: number | null;
  /** Suggested completion, or null when the evidence does not support one. */
  completion: 'completed' | 'partial' | null;
  /** One line explaining where the suggestion came from, shown next to it. */
  source: string | null;
};

/**
 * The minutes to offer.
 *
 * The larger of the two measures, because they count different things and either can be the
 * honest one: a student who sat rounds without starting a block has grove minutes and no
 * session, and a student who ran the block through a lecture has the reverse. Taking the
 * larger risks over-crediting by the overlap; taking the sum would double-count the common
 * case, where a round is sat *inside* a block, and would routinely hand people twice the
 * minutes they did.
 */
export function suggestedMinutes(evidence: CheckInEvidence): number | null {
  const best = Math.max(evidence.sessionMinutes, evidence.groveMinutes);
  return best > 0 ? best : null;
}

/**
 * The completion to offer, or null.
 *
 * `completed` needs the student's own explicit act — ticking the target off. `partial` needs
 * real tracked time. Anything less offers nothing, and in particular **`none` is never
 * suggested**: the absence of a record is not evidence that nothing happened, and a form that
 * opens with "I did nothing" pre-selected is one bad tap away from writing that down.
 */
export function inferCompletion(evidence: CheckInEvidence): 'completed' | 'partial' | null {
  if (evidence.targetCompleted) return 'completed';
  if (suggestedMinutes(evidence) !== null) return 'partial';
  return null;
}

/**
 * The text to offer for "what did you study?".
 *
 * The assigned topics, which is what the day was actually about. Rounds are mentioned
 * alongside them when there were any, because "2 focus rounds" is the part a student is most
 * likely to have forgotten by the evening and the part that most makes the entry feel like a
 * record of their day rather than a form.
 */
export function suggestedWhatStudied(evidence: CheckInEvidence): string | null {
  const topics = evidence.assignedTopics.filter((t) => t.trim().length > 0);
  if (topics.length === 0) return null;

  const subject = topics.join(' · ');
  if (evidence.grownRounds === 0) return subject;
  return `${subject} — ${evidence.grownRounds} focus ${evidence.grownRounds === 1 ? 'round' : 'rounds'}`;
}

/** How the suggestion was arrived at, in the student's own terms. */
function describeSource(evidence: CheckInEvidence): string | null {
  const parts: string[] = [];
  if (evidence.grownRounds > 0) {
    parts.push(`${evidence.grownRounds} focus ${evidence.grownRounds === 1 ? 'round' : 'rounds'}`);
  }
  if (evidence.sessionMinutes > 0) parts.push(`${evidence.sessionMinutes} min tracked`);
  if (evidence.targetCompleted) parts.push("today's target ticked off");
  if (parts.length === 0) return null;
  return `From ${parts.join(', ')}. Change anything that is not right.`;
}

export function buildCheckInPrefill(evidence: CheckInEvidence): CheckInPrefill {
  return {
    whatStudied: suggestedWhatStudied(evidence),
    actualMinutes: suggestedMinutes(evidence),
    completion: inferCompletion(evidence),
    source: describeSource(evidence),
  };
}

/** True when there is enough evidence to be worth offering a pre-filled check-in at all. */
export function hasEvidence(evidence: CheckInEvidence): boolean {
  return (
    evidence.targetCompleted ||
    evidence.grownRounds > 0 ||
    evidence.sessionMinutes > 0 ||
    evidence.groveMinutes > 0
  );
}
