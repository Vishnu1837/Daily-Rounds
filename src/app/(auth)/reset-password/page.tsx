import type { Metadata } from 'next';

import { ResetPasswordForm } from './reset-form';

export const metadata: Metadata = { title: 'Set a new password' };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <div>
      <h1 className="text-3xl font-extrabold tracking-tight text-fg">Set a new password</h1>
      <p className="mt-2 text-sm text-fg-muted">Choose something you will actually remember.</p>
      <div className="mt-7">
        <ResetPasswordForm token={token ?? ''} />
      </div>
    </div>
  );
}
