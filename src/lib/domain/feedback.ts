/**
 * The feedback round: who is being asked, what they are being asked, and what an answer may
 * contain.
 *
 * All of it lives in one module because three surfaces have to agree about it exactly — the
 * modal that asks, the notification bell that keeps the ask alive after the modal is closed,
 * and the server action that decides whether a submission is acceptable. A limit that the
 * form enforces and the action does not is not a limit.
 *
 * Pure data and pure functions only: no database, no `server-only`, so the client bundle can
 * import the copy and the caps without dragging the server in behind them.
 */

/**
 * Which round of the survey is currently being asked.
 *
 * Everything student-facing is keyed on this string rather than on "have you ever given
 * feedback", so asking again next term is a new constant here and nothing else — no
 * migration, and nobody who answered in September is told they have already replied to a
 * question that had not been put to them yet.
 *
 * Change the key and the whole cohort is asked afresh. Do not change it to fix a typo in the
 * copy below; that would re-prompt everyone who already answered.
 */
export const FEEDBACK_PROMPT_KEY = 'bugs-and-suggestions-2026-09';

/**
 * The words the student reads.
 *
 * Held as data rather than typed into the component because the notification bell shows the
 * same request in a smaller frame, and two hand-written copies of a message signed by a
 * named person is how one of them ends up out of date.
 */
export const FEEDBACK_PROMPT = {
  key: FEEDBACK_PROMPT_KEY,
  /** The bell's one-line summary, and the modal's heading. */
  title: 'Help us fix what is broken',
  /** Sits under the title wherever the request appears in miniature. */
  summary: 'Tell us about any bugs you have hit, and what you would like us to build next.',
  /** The body of the request. Paragraphs, rendered in order. */
  body: [
    'Are there any bugs, glitches or any type of issues you are facing with the Daily Rounds app?',
    'If yes, please mention in detail what you are facing or what the issue is, and rest assured we will get on fixing it ASAP.',
    'Thank you for supporting Daily Rounds 360.',
  ],
  signature: 'Imran Sujad and his team',
  issuesLabel: 'Bugs, glitches or issues you are facing',
  issuesPlaceholder:
    'What went wrong, which screen you were on, and what you were doing at the time. The more detail the faster we can fix it.',
  suggestionsLabel: 'Suggestions or features you would like',
  suggestionsPlaceholder:
    'Anything you wish Daily Rounds 360 did, or did differently. No idea is too small.',
} as const;

/* ------------------------------------------------------------------- limits */

/** Per field. Long enough for a genuinely detailed report, short enough to stay readable. */
export const FEEDBACK_TEXT_MAX = 4000;

/**
 * How many screenshots one report may carry.
 *
 * Three is what it takes to show a bug: the screen before, the screen after, and the error.
 * A fourth is almost always the same screen again, and every one of them is bytes in the
 * database that a cohort lead has to decide to delete later.
 */
export const FEEDBACK_MAX_ATTACHMENTS = 3;

/**
 * The largest image the server will store, after the browser has already shrunk it.
 *
 * `feedback-survey.tsx` re-encodes every pick through a canvas at
 * `FEEDBACK_IMAGE_MAX_EDGE`, which typically lands a phone screenshot around 200–400 KB. So
 * this cap is not the working size — it is the backstop for a picture that would not
 * compress, and for a request that skipped the browser entirely.
 */
export const FEEDBACK_ATTACHMENT_MAX_BYTES = 2 * 1024 * 1024;

/** The longest edge a stored screenshot keeps. Text in a phone screenshot stays legible. */
export const FEEDBACK_IMAGE_MAX_EDGE = 1600;

/**
 * What the server will accept as a screenshot.
 *
 * An allowlist of raster formats, not `image/*`: SVG is an image by MIME type and a script
 * host in practice, and nothing else on this list can execute when a cohort lead opens it.
 */
export const FEEDBACK_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export type FeedbackImageType = (typeof FEEDBACK_IMAGE_TYPES)[number];

export function isFeedbackImageType(type: string): type is FeedbackImageType {
  return (FEEDBACK_IMAGE_TYPES as readonly string[]).includes(type);
}

/** The `accept` attribute for the file picker, from the same list the server enforces. */
export const FEEDBACK_ACCEPT = FEEDBACK_IMAGE_TYPES.join(',');

/* -------------------------------------------------------------------- views */

/**
 * Where a student stands with the current round.
 *
 * Two booleans rather than one, because they drive different surfaces: `answered` decides
 * whether the request exists at all any more, and `dismissed` decides whether it is still
 * allowed to interrupt them.
 */
export type FeedbackPromptState = {
  /** They have sent a report for this round. The ask is finished and disappears everywhere. */
  answered: boolean;
  /** They have closed the modal at least once, so it may not open by itself again. */
  dismissed: boolean;
};

/**
 * Everything waiting in the notification bell.
 *
 * Lives here rather than beside the query that builds it because the bell is a client
 * component, and a `server-only` module is not something a client component should be
 * naming even in a type position.
 */
export type NotificationInbox = {
  prompt: FeedbackPromptState;
  announcements: {
    id: string;
    title: string;
    body: string;
    createdAt: string;
    /** Not yet acknowledged. Drives the count on the bell. */
    unread: boolean;
  }[];
  /** Unseen announcements, plus one for a feedback request that is still outstanding. */
  unreadCount: number;
};

/** One report, as the admin console lists it. Never carries image bytes — see the schema. */
export type FeedbackReport = {
  id: string;
  /** Null once the account is gone. The report itself outlives it. */
  studentName: string | null;
  studentEmail: string | null;
  cohortName: string | null;
  /** False when the student has since left or paused; worth knowing before chasing a reply. */
  isActiveMember: boolean;
  promptKey: string;
  issues: string;
  suggestions: string;
  resolvedAt: string | null;
  resolvedByName: string | null;
  createdAt: string;
  attachments: { id: string; mimeType: string; byteSize: number }[];
};

/** Bytes as something a person can read, for the "is this worth deleting" decision. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Total image weight of a report, which is the only reason to delete one early. */
export function attachmentBytes(report: FeedbackReport): number {
  return report.attachments.reduce((sum, a) => sum + a.byteSize, 0);
}

/** Substring search over everything an admin can see on the row. */
export function matchesFeedbackQuery(report: FeedbackReport, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [report.studentName, report.studentEmail, report.issues, report.suggestions]
    .filter(Boolean)
    .some((field) => field!.toLowerCase().includes(q));
}
