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
    <div>
      <h1 className="text-3xl font-extrabold tracking-tight text-fg">Welcome back</h1>
      <p className="mt-2 text-sm text-fg-muted">
        Sign in to see today&apos;s topic and keep your streak alive.
      </p>

      <div className="mt-7">
        <LoginForm />
      </div>

      <p className="mt-6 text-center text-sm text-fg-muted">
        New here?{' '}
        <Link href="/signup" className="font-semibold text-pulse-700 dark:text-pulse-400">
          Create an account
        </Link>
      </p>
    </div>
  );
}
