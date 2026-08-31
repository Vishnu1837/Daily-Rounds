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
    <div>
      <h1 className="text-3xl font-extrabold tracking-tight text-fg">Join the cohort</h1>
      <p className="mt-2 text-sm text-fg-muted">
        Two minutes to set up. After that it&apos;s one question a day: did you show up?
      </p>

      <div className="mt-7">
        <SignUpForm />
      </div>

      <p className="mt-6 text-center text-sm text-fg-muted">
        Already have an account?{' '}
        <Link href="/login" className="font-semibold text-pulse-700 dark:text-pulse-400">
          Sign in
        </Link>
      </p>
    </div>
  );
}
