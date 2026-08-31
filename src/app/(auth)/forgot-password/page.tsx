'use client';

import { useActionState } from 'react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { FormError, FormSuccess, TextInput } from '@/components/ui/form';
import { type ActionState, forgotPasswordAction } from '@/server/actions/auth';

const initial: ActionState = {};

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState(forgotPasswordAction, initial);

  return (
    <div>
      <h1 className="text-3xl font-extrabold tracking-tight text-fg">Reset your password</h1>
      <p className="mt-2 text-sm text-fg-muted">
        Enter the email you signed up with and we&apos;ll send you a reset link.
      </p>

      <form action={action} className="mt-7 space-y-4" noValidate>
        {state.ok ? <FormSuccess>{state.message}</FormSuccess> : <FormError>{state.message}</FormError>}

        {state.devResetUrl && (
          <div className="rounded-2xl border border-warning/40 bg-warning/10 p-3.5 text-sm">
            <p className="font-semibold text-fg">Development mode</p>
            <p className="mt-1 text-fg-muted">
              No mail provider is configured, so here is the link directly:
            </p>
            <Link
              href={state.devResetUrl}
              className="mt-2 inline-block font-semibold break-all text-pulse-700 underline dark:text-pulse-400"
            >
              {state.devResetUrl}
            </Link>
          </div>
        )}

        <TextInput
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="you@college.edu"
          required
          error={state.errors?.email}
        />

        <Button type="submit" size="lg" fullWidth loading={pending}>
          Send reset link
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-fg-muted">
        <Link href="/login" className="font-semibold text-pulse-700 dark:text-pulse-400">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
