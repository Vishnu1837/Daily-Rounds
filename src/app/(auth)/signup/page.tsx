import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';

import { RedirectIfSignedIn } from '../redirect-if-signed-in';

import { SignUpForm } from './signup-form';

export const metadata: Metadata = { title: 'Create your account' };

export default function SignUpPage() {
  return (
    <div className="animate-rise">
      <Suspense fallback={null}>
        <RedirectIfSignedIn />
      </Suspense>

      <p className="eyebrow">Create an account</p>
      <h1 className="text-fg mt-2 text-3xl font-extrabold tracking-tight">Join the cohort</h1>
      <p className="text-fg-muted mt-2.5 text-sm">
        Two minutes to set up. After that it&apos;s one question a day: did you show up?
      </p>

      <div className="mt-8">
        <SignUpForm />
      </div>

      <p className="text-fg-muted mt-6 text-center text-sm">
        Already have an account?{' '}
        <Link href="/login" className="text-pulse-700 dark:text-pulse-300 font-semibold">
          Sign in
        </Link>
      </p>
    </div>
  );
}
