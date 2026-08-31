import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/auth/session';

import { SignUpForm } from './signup-form';

export const metadata: Metadata = { title: 'Create your account' };

export default async function SignUpPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.role === 'admin' ? '/admin' : '/');

  return (
    <div className="animate-rise">
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
