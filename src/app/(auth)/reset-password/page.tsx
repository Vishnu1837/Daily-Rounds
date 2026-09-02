import type { Metadata } from 'next';

import { ResetPasswordForm } from './reset-form';

export const metadata: Metadata = { title: 'Set a new password' };

// Not prerendered: a one-off screen with no frame worth showing ahead of its data.
export const instant = false;

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <div className="animate-rise">
      <p className="eyebrow">Account recovery</p>
      <h1 className="text-fg mt-2 text-3xl font-extrabold tracking-tight">Set a new password</h1>
      <p className="text-fg-muted mt-2.5 text-sm">Choose something you will actually remember.</p>
      <div className="mt-8">
        <ResetPasswordForm token={token ?? ''} />
      </div>
    </div>
  );
}
