import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/auth/session';

import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.role === 'admin' ? '/admin' : '/');

  return (
    <div className="animate-rise">
      <p className="eyebrow">Sign in</p>
      <h1 className="text-fg mt-2 text-3xl font-extrabold tracking-tight">Welcome back</h1>
      <p className="text-fg-muted mt-2.5 text-sm">
        See today&apos;s topic and keep your streak alive.
      </p>

      <div className="mt-8">
        <LoginForm />
      </div>

      <p className="text-fg-muted mt-6 text-center text-sm">
        New here?{' '}
        <Link href="/signup" className="text-pulse-700 dark:text-pulse-300 font-semibold">
          Create an account
        </Link>
      </p>
    </div>
  );
}
