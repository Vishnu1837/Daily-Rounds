/**
 * The bulk question importer.
 *
 * The brief's target experience: an admin generates fifteen questions in ChatGPT or Gemini,
 * copies the whole block, pastes it once, checks the parsed cards, and publishes. So this
 * has to read what a language model actually emits when asked for questions — which is
 * never quite the format you specified. It is therefore forgiving about surface detail and
 * strict about substance:
 *
 *  - forgiving: `Q1.` / `1.` / `1)` / `**Q1.**` all start a question; `A.` / `A)` / `(A)` /
 *    `a.` all label an option; `ANSWER:` may be a letter, a number, or the answer text;
 *    `TIME: 45` and `TIME: 45 seconds` and `TIME: 1 min` all mean the same thing; markdown
 *    bold and stray bullets are stripped;
 *  - strict: nothing is ever silently repaired. A question missing its answer key, or
 *    carrying duplicate option labels, is returned as an issue attached to that question so
 *    the preview can flag it, and `hasBlockingIssues` refuses the publish until a human has
 *    looked. The parser never guesses which option was meant to be correct.
 *
 * Pure and synchronous on purpose: it is the piece most worth testing exhaustively, and it
 * runs identically in the preview on the client and in the action on the server.
 */

export type ParsedQuestionType = 'mcq' | 'image_mcq' | 'short_answer' | 'long_answer';

export type ParseIssue = {
  /** `error` blocks publishing; `warning` is worth an admin's eye but not fatal. */
  level: 'error' | 'warning';
  message: string;
};

export type ParsedQuestion = {
  /** 1-based, as the admin will see it in the preview. */
  number: number;
  type: ParsedQuestionType;
  prompt: string;
  options: string[];
  /** Index into `options`. Null when the parser could not determine it. */
  correctIndex: number | null;
  /** Model answer for a subjective question. */
  referenceAnswer: string | null;
  explanation: string | null;
  imageUrl: string | null;
  /** Null means "use the assessment's default timer". */
  timeLimitSeconds: number | null;
  issues: ParseIssue[];
};

export type ParseResult = {
  questions: ParsedQuestion[];
  /** Problems with the paste as a whole, rather than with one question. */
  issues: ParseIssue[];
};

/** The prompt an admin can copy into ChatGPT to get output this parser reads cleanly. */
export const IMPORT_PROMPT = `Write {N} exam questions on {TOPIC} for second-year MBBS students.

Use exactly this format, with a blank line between questions and no extra commentary:

Q1. <question text>
TYPE: MCQ
A. <option>
B. <option>
C. <option>
D. <option>
ANSWER: B
TIME: 45 seconds
EXPLANATION: <one or two sentences on why that answer is right>

For a written question use TYPE: SHORT_ANSWER or TYPE: LONG_ANSWER, omit the A–D options,
and put the model answer after ANSWER:.`;

/** The same shape as the prompt above, shown in the UI as "what the importer expects". */
export const IMPORT_FORMAT_EXAMPLE = `Q1. Which nerve supplies the deltoid muscle?
TYPE: MCQ
A. Musculocutaneous nerve
B. Axillary nerve
C. Radial nerve
D. Median nerve
ANSWER: B
TIME: 45 seconds
EXPLANATION: The axillary nerve (C5–C6) supplies deltoid and teres minor.

Q2. Describe the boundaries of the cubital fossa.
TYPE: SHORT_ANSWER
ANSWER: Laterally brachioradialis, medially pronator teres, superiorly a line between the epicondyles.
TIME: 3 minutes`;

/**
 * The most one paste may carry.
 *
 * Raised from two hundred when assessments became banks: an admin building a five-hundred
 * question bank pastes a model's output in chunks, and a limit that forced those chunks to
 * be smaller than what the model actually returns would just move the tedium around.
 */
const MAX_QUESTIONS = 1000;

/** Strips markdown emphasis and list bullets a model tends to add around its own format. */
function clean(line: string): string {
  return line
    .replace(/^\s*[-*•]\s+/, '')
    .replace(/\*\*/g, '')
    .replace(/^__|__$/g, '')
    .trim();
}

/** `Q1.` `Q1)` `1.` `1)` `Question 1:` — everything a model calls the start of a question. */
const QUESTION_START = /^(?:Q(?:uestion)?\s*)?(\d{1,3})\s*[.):\]]\s*(.*)$/i;

/** Whether the header carried an explicit `Q`/`Question`, which is never ambiguous. */
const EXPLICIT_QUESTION_START = /^Q(?:uestion)?\s*\d{1,3}\s*[.):\]]/i;

/** `A.` `A)` `(A)` `a -` — an option label followed by its text. */
const OPTION_LINE = /^\(?([A-Ha-h])\)?\s*[.)\]:-]\s*(.+)$/;

/** `KEY: value` where KEY is one of the metadata fields the format defines. */
const FIELD_LINE =
  /^(TYPE|ANSWER|CORRECT|CORRECT ANSWER|TIME|TIMER|TIME LIMIT|EXPLANATION|EXPLANATION:|IMAGE|IMAGE URL|REFERENCE|REFERENCE ANSWER)\s*[:\-]\s*(.*)$/i;

function parseType(raw: string): ParsedQuestionType | null {
  const v = raw
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (['mcq', 'multiple_choice', 'single_best_answer', 'sba'].includes(v)) return 'mcq';
  if (['image_mcq', 'image', 'image_based_mcq', 'picture_mcq'].includes(v)) return 'image_mcq';
  if (['short_answer', 'short', 'saq'].includes(v)) return 'short_answer';
  if (['long_answer', 'long', 'essay', 'laq'].includes(v)) return 'long_answer';
  return null;
}

/**
 * `45`, `45 seconds`, `90s`, `2 min`, `1 minute 30 seconds` → seconds.
 *
 * Returns null rather than a default when it cannot tell, so the assessment's own default
 * fills in and an explicitly supplied timer is never overwritten by one.
 */
export function parseDuration(raw: string): number | null {
  const text = raw.trim().toLowerCase();
  if (!text) return null;

  let total = 0;
  let matched = false;

  for (const m of text.matchAll(
    /(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)?\b/g,
  )) {
    const value = Number(m[1]);
    if (!Number.isFinite(value)) continue;
    const unit = m[2] ?? '';
    matched = true;
    if (/^h/.test(unit)) total += value * 3600;
    else if (/^m/.test(unit)) total += value * 60;
    else total += value; // bare number, or an explicit seconds unit
  }

  if (!matched) return null;
  const seconds = Math.round(total);
  return seconds > 0 && seconds <= 24 * 3600 ? seconds : null;
}

/**
 * Resolves `ANSWER:` against the options.
 *
 * A model will answer with a letter, with the option's number, or by repeating the option
 * text — and occasionally with `B) Axillary nerve`, which is both. All three are read;
 * anything else returns null and becomes a flagged question rather than a guess.
 */
function resolveAnswer(raw: string, options: string[]): number | null {
  const text = raw.trim().replace(/^\**|\**$/g, '');
  if (!text || options.length === 0) return null;

  const letter = text.match(/^\(?([A-Ha-h])\)?(?:[.)\]:-]|\s|$)/);
  if (letter) {
    const index = letter[1]!.toUpperCase().charCodeAt(0) - 65;
    if (index >= 0 && index < options.length) return index;
  }

  const number = text.match(/^(\d{1,2})(?:[.)\]:-]|\s|$)/);
  if (number) {
    const index = Number(number[1]) - 1;
    if (index >= 0 && index < options.length) return index;
  }

  const normalise = (v: string) => v.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.]$/, '');
  const target = normalise(text);
  const exact = options.findIndex((o) => normalise(o) === target);
  if (exact !== -1) return exact;

  // "B) Axillary nerve" — the letter was consumed above and did not resolve, so try the
  // remaining text on its own.
  const stripped = text.replace(/^\(?[A-Ha-h]\)?[.)\]:-]\s*/, '');
  if (stripped !== text) {
    const strippedTarget = normalise(stripped);
    const found = options.findIndex((o) => normalise(o) === strippedTarget);
    if (found !== -1) return found;
  }

  return null;
}

type Draft = {
  number: number;
  promptLines: string[];
  options: { label: string; text: string }[];
  type: ParsedQuestionType | null;
  answerRaw: string | null;
  timeRaw: string | null;
  explanationLines: string[];
  imageUrl: string | null;
  /** Set once a metadata field appears, so later plain lines join it and not the prompt. */
  lastField: 'explanation' | 'answer' | null;
};

function emptyDraft(number: number): Draft {
  return {
    number,
    promptLines: [],
    options: [],
    type: null,
    answerRaw: null,
    timeRaw: null,
    explanationLines: [],
    imageUrl: null,
    lastField: null,
  };
}

function finalise(draft: Draft, index: number): ParsedQuestion {
  const issues: ParseIssue[] = [];
  const prompt = draft.promptLines.join(' ').replace(/\s+/g, ' ').trim();
  const options = draft.options.map((o) => o.text);

  // The type may be stated, and is otherwise inferred from the shape of what was pasted:
  // options mean a multiple-choice question, no options mean a written one.
  const type: ParsedQuestionType =
    draft.type ?? (options.length > 0 ? 'mcq' : draft.imageUrl ? 'image_mcq' : 'short_answer');
  const isChoice = type === 'mcq' || type === 'image_mcq';

  if (!prompt) issues.push({ level: 'error', message: 'This question has no text.' });

  let correctIndex: number | null = null;
  let referenceAnswer: string | null = null;

  if (isChoice) {
    if (options.length < 2) {
      issues.push({
        level: 'error',
        message: `A multiple-choice question needs at least two options; ${options.length} found.`,
      });
    }

    const labels = draft.options.map((o) => o.label.toUpperCase());
    const duplicates = labels.filter((l, i) => labels.indexOf(l) !== i);
    if (duplicates.length > 0) {
      issues.push({
        level: 'error',
        message: `Duplicate option ${duplicates.length === 1 ? 'label' : 'labels'} ${[...new Set(duplicates)].join(', ')}.`,
      });
    }

    if (options.some((o) => !o.trim())) {
      issues.push({ level: 'error', message: 'One of the options is blank.' });
    }

    if (draft.answerRaw === null) {
      issues.push({ level: 'error', message: 'No correct answer was given.' });
    } else {
      correctIndex = resolveAnswer(draft.answerRaw, options);
      if (correctIndex === null) {
        issues.push({
          level: 'error',
          message: `Could not match the answer "${draft.answerRaw.trim()}" to any option. Pick the correct one below.`,
        });
      }
    }

    if (type === 'image_mcq' && !draft.imageUrl) {
      issues.push({
        level: 'warning',
        message: 'Marked as an image question but no IMAGE url was given.',
      });
    }
  } else {
    referenceAnswer = draft.answerRaw?.trim() || null;
    if (!referenceAnswer) {
      issues.push({
        level: 'warning',
        message:
          'No model answer given. You will be marking this one with nothing to compare against.',
      });
    }
    if (options.length > 0) {
      issues.push({
        level: 'warning',
        message: 'Options were found on a written question. They will be ignored.',
      });
    }
  }

  let timeLimitSeconds: number | null = null;
  if (draft.timeRaw !== null) {
    timeLimitSeconds = parseDuration(draft.timeRaw);
    if (timeLimitSeconds === null) {
      issues.push({
        level: 'warning',
        message: `Could not read the time limit "${draft.timeRaw.trim()}". The assessment default will be used.`,
      });
    }
  }

  return {
    number: index + 1,
    type,
    prompt,
    options: isChoice ? options : [],
    correctIndex,
    referenceAnswer,
    explanation: draft.explanationLines.join(' ').replace(/\s+/g, ' ').trim() || null,
    imageUrl: draft.imageUrl,
    timeLimitSeconds,
    issues,
  };
}

/**
 * Reads a pasted block into editable question cards.
 *
 * Never throws and never returns a partially-understood question silently: everything it
 * could not resolve comes back as an issue on the card it belongs to.
 */
export function parseQuestionBlock(input: string): ParseResult {
  const issues: ParseIssue[] = [];
  const text = input.replace(/\r\n?/g, '\n').trim();

  if (!text) return { questions: [], issues: [{ level: 'error', message: 'Nothing was pasted.' }] };

  const drafts: Draft[] = [];
  let current: Draft | null = null;
  /** Whether a blank line separated this line from the last one that carried content. */
  let afterBlank = true;

  for (const rawLine of text.split('\n')) {
    const line = clean(rawLine);
    if (!line) {
      afterBlank = true;
      continue;
    }
    const separated = afterBlank;
    afterBlank = false;

    const start = line.match(QUESTION_START);
    /*
     * A bare numbered line is ambiguous: usually it is the next question, but inside an
     * option list it can be part of the answer text, and reading that as a header silently
     * swallows the rest of the question before it. An explicit `Q1.` is never ambiguous; a
     * bare `1.` is trusted only when a blank line set it apart or when it continues the
     * numbering — which is what a real paste looks like either way.
     */
    if (start) {
      const number = Number(start[1]);
      const isNewQuestion =
        !current ||
        EXPLICIT_QUESTION_START.test(line) ||
        separated ||
        number === current.number + 1;

      if (isNewQuestion) {
        if (current) drafts.push(current);
        current = emptyDraft(number);
        const rest = start[2]?.trim();
        if (rest) current.promptLines.push(rest);
        continue;
      }
    }

    if (!current) {
      // Text before the first recognisable question header. A model preamble ("Sure! Here
      // are 15 questions:") lands here and is dropped rather than becoming question 1.
      continue;
    }

    const field = line.match(FIELD_LINE);
    if (field) {
      const key = field[1]!.toUpperCase().replace(/[: ]+$/, '');
      const value = field[2] ?? '';
      if (key === 'TYPE') {
        const parsed = parseType(value);
        if (parsed) current.type = parsed;
        else
          issues.push({
            level: 'warning',
            message: `Question ${current.number}: unrecognised TYPE "${value.trim()}".`,
          });
        current.lastField = null;
      } else if (
        key === 'ANSWER' ||
        key === 'CORRECT' ||
        key === 'CORRECT ANSWER' ||
        key === 'REFERENCE' ||
        key === 'REFERENCE ANSWER'
      ) {
        current.answerRaw = value;
        current.lastField = 'answer';
      } else if (key === 'TIME' || key === 'TIMER' || key === 'TIME LIMIT') {
        current.timeRaw = value;
        current.lastField = null;
      } else if (key === 'EXPLANATION') {
        if (value.trim()) current.explanationLines.push(value.trim());
        current.lastField = 'explanation';
      } else if (key === 'IMAGE' || key === 'IMAGE URL') {
        current.imageUrl = value.trim() || null;
        current.lastField = null;
      }
      continue;
    }

    const option = line.match(OPTION_LINE);
    if (option) {
      current.options.push({ label: option[1]!, text: option[2]!.trim() });
      current.lastField = null;
      continue;
    }

    // A plain line continues whatever it follows: the explanation, a long model answer, or
    // a question prompt that wrapped.
    if (current.lastField === 'explanation') current.explanationLines.push(line);
    else if (current.lastField === 'answer')
      current.answerRaw = `${current.answerRaw ?? ''} ${line}`.trim();
    else if (current.options.length === 0) current.promptLines.push(line);
    else current.explanationLines.push(line);
  }

  if (current) drafts.push(current);

  if (drafts.length === 0) {
    return {
      questions: [],
      issues: [
        {
          level: 'error',
          message:
            'No questions were found. Each one needs to start on its own line, like "Q1." or "1.".',
        },
      ],
    };
  }

  if (drafts.length > MAX_QUESTIONS) {
    issues.push({
      level: 'error',
      message: `${drafts.length} questions found. Import at most ${MAX_QUESTIONS} at a time.`,
    });
  }

  const questions = drafts.slice(0, MAX_QUESTIONS).map(finalise);

  // Worth saying out loud: a model asked for 15 questions sometimes returns 14, and the
  // count is the one thing an admin can check at a glance.
  const numbered = drafts.map((d) => d.number);
  const looksSequential = numbered.every((n, i) => n === i + 1);
  if (!looksSequential) {
    issues.push({
      level: 'warning',
      message: `The pasted numbering is not 1–${drafts.length}. Check nothing was cut off.`,
    });
  }

  return { questions, issues };
}

/** Whether this parse may be published, or still needs an admin to fix something. */
export function hasBlockingIssues(result: ParseResult): boolean {
  return (
    result.issues.some((i) => i.level === 'error') ||
    result.questions.some((q) => q.issues.some((i) => i.level === 'error'))
  );
}

/** Totals for the preview header: "15 questions · 2 need attention". */
export function summariseParse(result: ParseResult): {
  total: number;
  withErrors: number;
  withWarnings: number;
} {
  return {
    total: result.questions.length,
    withErrors: result.questions.filter((q) => q.issues.some((i) => i.level === 'error')).length,
    withWarnings: result.questions.filter((q) => q.issues.some((i) => i.level === 'warning'))
      .length,
  };
}
