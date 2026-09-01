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
  'Hi Imran, I’m interested in Daily Rounds / Medico Consistency Cohort. ' +
  'Could you share the details for the next available cohort?';

export const SITE = {
  name: 'Daily Rounds',
  tagline: 'Medico Consistency Cohort',
  founder: 'Mohammed Imran',
  /** The recurring product identity, used across the public site and the portal header. */
  lockup: 'Daily Rounds by Mohammed Imran',
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
