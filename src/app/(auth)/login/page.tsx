import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';

import { PUBLIC_SIGNUP_OPEN, SITE, WAITLIST_ANCHOR } from '@/lib/site';

import { RedirectIfSignedIn } from '../redirect-if-signed-in';

import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
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
