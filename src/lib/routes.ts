/**
 * Named routes for the two halves of the product.
 *
 * The main domain belongs to the public landing page, so the student dashboard lives at
 * `/today` rather than at `/`. These constants exist so that fact is stated once: a bare
 * `'/'` scattered through redirects and nav items would be ambiguous about which of the two
 * it meant, and was exactly what made the move error-prone.
 */

/** The public marketing page. Unauthenticated; never renders student data. */
export const LANDING = '/';

/** The signed-in student dashboard — the old `/`. */
export const STUDENT_HOME = '/today';

/**
 * The XP explainer.
 *
 * Named because it is now reached from the XP number itself in four places — the header
 * pill, the desktop rail, the profile and the progress screen — and a student tapping a
 * number they do not understand should land on the same page every time.
 */
export const HOW_XP_WORKS = '/how-points-work';

/** The admin console home. */
export const ADMIN_HOME = '/admin';

/** Where a user belongs immediately after signing in. */
export function homeForRole(role: 'student' | 'admin'): string {
  return role === 'admin' ? ADMIN_HOME : STUDENT_HOME;
}
