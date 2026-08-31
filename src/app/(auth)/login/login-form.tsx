'use client';

import { useActionState } from 'react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { FormError, TextInput } from '@/components/ui/form';
import { type ActionState, loginAction } from '@/server/actions/auth';

const initial: ActionState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initial);

  return (
    <form action={action} className="space-y-4" noValidate>
      <FormError>{state.message}</FormError>

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

      <div>
        <TextInput
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          required
          error={state.errors?.password}
        />
        <div className="mt-2 text-right">
          <Link href="/forgot-password" className="text-fg-muted text-sm font-medium underline">
            Forgot your password?
          </Link>
        </div>
      </div>

      <Button type="submit" size="lg" fullWidth loading={pending}>
        Sign in
      </Button>
    </form>
  );
}
