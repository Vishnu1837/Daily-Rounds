import 'server-only';

import { headers } from 'next/headers';

/**
 * The site's own origin, as an absolute `https://host` with no trailing slash.
 *
 * A password reset link is read in a mail client, not in the browser that asked for it, so
 * the relative paths the rest of the app uses are useless there — `/reset-password?token=…`
 * resolves against the reader's mail host, or against nothing at all. Everything that
 * leaves the app has to carry its own origin.
 *
 * Three sources, in descending order of trust:
 *
 *  - `NEXT_PUBLIC_APP_URL`, when the deployment has a real domain. Set this in production:
 *    it is the only source that names the domain students actually visit.
 *  - `VERCEL_PROJECT_PRODUCTION_URL`, the project's stable production hostname. Vercel sets
 *    it on every deployment, so a preview build still links back to production rather than
 *    to its own throwaway URL.
 *  - The inbound request's `Host` header. A last resort — it is attacker-controllable, so
 *    it is only reached when neither environment variable is configured, which in practice
 *    means local development.
 */
export async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (configured) return withScheme(configured).replace(/\/+$/, '');

  const h = await headers();
  const host = h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

/** Absolute URL for an app-relative path, for anything that will be read outside the app. */
export async function absoluteUrl(path: string): Promise<string> {
  return `${await siteOrigin()}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Environment variables are written both ways; a bare hostname is the common case. */
function withScheme(value: string): string {
  return /^https?:\/\//.test(value) ? value : `https://${value}`;
}
