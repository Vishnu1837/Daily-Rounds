'use client';

import { useActionState } from 'react';

import { Button } from '@/components/ui/button';
import { FormError, TextInput } from '@/components/ui/form';
import { type ActionState, signUpAction } from '@/server/actions/auth';

const initial: ActionState = {};

export function SignUpForm() {
  const [state, action, pending] = useActionState(signUpAction, initial);

  return (
    <form action={action} className="space-y-4" noValidate>
      <FormError>{state.message}</FormError>

      <TextInput
        label="Full name"
        name="fullName"
        autoComplete="name"
        placeholder="Imran Qureshi"
        required
        error={state.errors?.fullName}
      />

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

      <TextInput
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        placeholder="At least 8 characters"
        required
        error={state.errors?.password}
        hint="At least 8 characters."
      />

      <Button type="submit" size="lg" fullWidth loading={pending}>
        Create account
      </Button>
    </form>
  );
}
