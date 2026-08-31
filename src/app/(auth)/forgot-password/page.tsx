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
    <div className="animate-rise">
      <p className="eyebrow">Account recovery</p>
      <h1 className="text-fg mt-2 text-3xl font-extrabold tracking-tight">Reset your password</h1>
      <p className="text-fg-muted mt-2.5 text-sm">
        Enter the email you signed up with and we&apos;ll send you a reset link.
      </p>

      <form action={action} className="mt-8 space-y-4" noValidate>
        {state.ok ? (
          <FormSuccess>{state.message}</FormSuccess>
        ) : (
          <FormError>{state.message}</FormError>
        )}

        {state.devResetUrl && (
          <div className="rounded-panel border-warning/40 bg-warning/12 border p-3.5 text-sm">
            <p className="text-fg font-semibold">Development mode</p>
            <p className="text-fg-muted mt-1">
              No mail provider is configured, so here is the link directly:
            </p>
            <Link
              href={state.devResetUrl}
              className="text-pulse-700 dark:text-pulse-400 mt-2 inline-block font-semibold break-all underline"
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

      <p className="text-fg-muted mt-6 text-center text-sm">
        <Link href="/login" className="text-pulse-700 dark:text-pulse-400 font-semibold">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
