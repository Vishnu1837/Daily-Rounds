'use client';

import { useEffect } from 'react';
import Link from 'next/link';

import { Logo } from '@/components/brand/logo';
import { Button, LinkButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/feedback';

/**
 * The application-wide error boundary.
 *
 * It deliberately offers a retry *and* a way back to today, because the most common cause
 * here is a transient read failure — and a student who has just lost their streak screen to
 * a network blip should not have to work out for themselves that reloading might fix it.
 *
 * The digest is shown but the raw message is not: error text can carry internals, and it is
 * never something a student can act on.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-10">
      <div className="mb-6 flex justify-center">
        <Logo />
      </div>

      <Card>
        <ErrorState
          title="That didn't load"
          description="Something went wrong on our side. Nothing you have already recorded is affected — points and streaks live in an append-only ledger."
          action={
            <div className="flex w-full flex-col gap-2.5">
              <Button size="lg" fullWidth onClick={reset}>
                Try again
              </Button>
              <LinkButton href="/" variant="outline" size="lg" fullWidth>
                Back to today
              </LinkButton>
            </div>
          }
        />
        {error.digest && (
          <p className="text-2xs text-fg-subtle px-6 pb-6 text-center">
            Reference: <span className="font-mono">{error.digest}</span>
          </p>
        )}
      </Card>

      <p className="text-fg-subtle mt-6 text-center text-xs">
        Still stuck?{' '}
        <Link href="/login" className="underline underline-offset-2">
          Sign in again
        </Link>
      </p>
    </div>
  );
}
