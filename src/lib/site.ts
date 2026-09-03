/**
 * Public-site configuration.
 *
 * Everything a future cohort or a change of contact details would otherwise force a code
 * edit for. Two rules shaped this file:
 *
 *  - The brief asks that cohort and CTA labels be configurable rather than hard-coded
 *    around "Cohort 01", so Cohort 02 does not mean redeploying copy changes.
 *  - It also asks the developer to *confirm* the real Instagram URL and enquiry number
 *    before production rather than assuming them. So those are environment variables with
 *    honest fallbacks, and `SITE.contactConfigured` reports whether the real ones are in
 *    place — the UI degrades to a plain "email us" rather than shipping a dead link.
 *
 * All values are read at build time via `NEXT_PUBLIC_*` so client components can use them.
 */

const handle = process.env.NEXT_PUBLIC_INSTAGRAM_HANDLE ?? 'mohd.imrxn';

/** Digits only, country code included, no `+` — the format wa.me expects. */
const whatsapp = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '';

export const ENQUIRY_MESSAGE =
  'Hi Imran, I’m interested in Daily Rounds 360 / Medico Consistency Cohort. ' +
  'Could you share the details for the next available cohort?';

/**
 * Whether anyone can create their own account from the public site.
 *
 * Closed. The cohort is a curated group: new people join the waitlist and an admin adds the
 * ones who are accepted, so a self-serve signup form would let anyone into the leaderboard,
 * the grove and the study room without ever being invited.
 *
 * This is a switch rather than deleted code because a future cohort may open registration
 * again, and because it has to be readable from both the client (to hide the route) and the
 * server (to refuse the request) — hiding the button alone is not closing signup. Set
 * `NEXT_PUBLIC_PUBLIC_SIGNUP=open` to reopen it.
 */
export const PUBLIC_SIGNUP_OPEN = process.env.NEXT_PUBLIC_PUBLIC_SIGNUP === 'open';

/** Where a new visitor is sent instead: the waitlist section of the landing page. */
export const WAITLIST_ANCHOR = '/#waitlist';

export const SITE = {
  /**
   * The product name, in full, wherever a person reads it.
   *
   * Every user-facing surface reads this rather than spelling the name out, so the next
   * time it changes it changes in one place. Routes, database keys, the package name and
   * the `dr-` id prefixes are deliberately *not* derived from it — they are addresses, not
   * copy, and renaming them would break links and migrations for no reader's benefit.
   */
  name: 'Daily Rounds 360',
  tagline: 'Medico Consistency Cohort',
  founder: 'Mohammed Imran',
  /** The recurring product identity, used across the public site and the portal header. */
  lockup: 'Daily Rounds 360 by Mohammed Imran',
  instagramHandle: `@${handle}`,
  instagramUrl: `https://instagram.com/${handle}`,

  /** Cohort-facing labels. Change these between batches instead of editing components. */
  cohortLabel: process.env.NEXT_PUBLIC_COHORT_LABEL ?? 'the current cohort',
  nextCohortLabel: process.env.NEXT_PUBLIC_NEXT_COHORT_LABEL ?? 'the next cohort',
  waitlistCta: process.env.NEXT_PUBLIC_WAITLIST_CTA ?? 'Join the waitlist',
  enterCohortCta: process.env.NEXT_PUBLIC_ENTER_COHORT_CTA ?? 'Enter cohort',

  /**
   * WhatsApp enquiry link, or null when no number has been configured.
   *
   * Null is meaningful: the landing page hides the WhatsApp route entirely rather than
   * rendering a `wa.me/` link that goes nowhere.
   */
  whatsappUrl: whatsapp
    ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(ENQUIRY_MESSAGE)}`
    : null,

  /**
   * Founder photo. A real photograph is a production asset, not something to invent, so
   * this is opt-in — the founder section falls back to a monogram when it is unset.
   */
  founderPhotoUrl: process.env.NEXT_PUBLIC_FOUNDER_PHOTO_URL ?? null,
} as const;

/** Whether the real contact details have been supplied, rather than the safe fallbacks. */
export const contactConfigured = Boolean(process.env.NEXT_PUBLIC_WHATSAPP_NUMBER);
