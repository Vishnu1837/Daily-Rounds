import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';

import { FormError } from '@/components/ui/form';
import { PUBLIC_SIGNUP_OPEN, SITE, WAITLIST_ANCHOR } from '@/lib/site';

import { RedirectIfSignedIn } from '../redirect-if-signed-in';

import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

/**
 * What to say to a phone that scanned a QR which no longer worked.
 *
 * Each one names the actual next step, because they are genuinely different problems: a code
 * that ran out wants a fresh one, a code that already worked usually means the phone is
 * signed in on another tab, and an unrecognised one means the QR on the laptop has since
 * been replaced.
 */
const LINK_FAILURES: Record<string, string> = {
  expired: 'That sign-in code had run out. Show a new one on your computer and scan again.',
  'already-used':
    'That sign-in code had already been used. Codes work once — show a new one on your computer.',
  unknown:
    'We did not recognise that sign-in code. Show a new one on your computer and scan again.',
};

/**
 * The notice, in its own component so the page around it stays prerenderable.
 *
 * `searchParams` is request data: awaiting it in the page body would mean nothing of this
 * screen could be built ahead of time, and every visitor would wait on the server before
 * seeing so much as the heading — to accommodate a message almost none of them will get.
 * Behind a Suspense boundary it costs the other visitors nothing.
 */
async function LinkFailureNotice({ searchParams }: { searchParams: Promise<{ link?: string }> }) {
  const { link } = await searchParams;
  const message = link ? LINK_FAILURES[link] : undefined;
  if (!message) return null;

  return (
    <div className="mt-6">
      <FormError>{message}</FormError>
    </div>
  );
}

export default function LoginPage({ searchParams }: { searchParams: Promise<{ link?: string }> }) {
  return (
    <div className="animate-rise">
      <Suspense fallback={null}>
        <RedirectIfSignedIn />
      </Suspense>

      <p className="eyebrow">Sign in</p>
      <h1 className="text-fg mt-2 text-3xl font-extrabold tracking-tight">Welcome back</h1>
      <p className="text-fg-muted mt-2.5 text-sm">
        See today&apos;s topic and keep your streak alive.
      </p>

      <Suspense fallback={null}>
        <LinkFailureNotice searchParams={searchParams} />
      </Suspense>

      <div className="mt-8">
        <LoginForm />
      </div>

      {/*
        Existing students sign in here exactly as before. A new visitor is pointed at the
        waitlist, because that is now the only way into the cohort.
      */}
      <p className="text-fg-muted mt-6 text-center text-sm">
        New here?{' '}
        <Link
          href={PUBLIC_SIGNUP_OPEN ? '/signup' : WAITLIST_ANCHOR}
          className="text-pulse-700 dark:text-pulse-300 font-semibold"
        >
          {PUBLIC_SIGNUP_OPEN ? 'Create an account' : SITE.waitlistCta}
        </Link>
      </p>
    </div>
  );
}
