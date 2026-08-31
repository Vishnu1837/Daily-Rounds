'use client';

import { useActionState } from 'react';
import Link from 'next/link';

import { Button, LinkButton } from '@/components/ui/button';
import { FormError, FormSuccess, TextInput } from '@/components/ui/form';
import { type ActionState, resetPasswordAction } from '@/server/actions/auth';

const initial: ActionState = {};

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, initial);

  if (!token) {
    return (
      <div className="space-y-4">
        <FormError>
          This reset link is missing its token. Request a new link and try again.
        </FormError>
        <LinkButton href="/forgot-password" size="lg" fullWidth>
          Request a new link
        </LinkButton>
      </div>
    );
  }

  if (state.ok) {
    return (
      <div className="space-y-4">
        <FormSuccess>{state.message}</FormSuccess>
        <LinkButton href="/login" size="lg" fullWidth>
          Sign in
        </LinkButton>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="token" value={token} />
      <FormError>{state.message ?? state.errors?.token}</FormError>

      <TextInput
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        error={state.errors?.password}
        hint="At least 8 characters."
      />

      <TextInput
        label="Confirm new password"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        required
        error={state.errors?.confirmPassword}
      />

      <Button type="submit" size="lg" fullWidth loading={pending}>
        Update password
      </Button>

      <p className="text-center text-sm text-fg-muted">
        <Link href="/login" className="font-semibold text-pulse-700 dark:text-pulse-400">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
