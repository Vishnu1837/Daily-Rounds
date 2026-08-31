import type { Metadata } from 'next';

import { Logo } from '@/components/brand/logo';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { requireAdmin } from '@/lib/auth/guards';

export const metadata: Metadata = { title: 'No cohort' };
export const dynamic = 'force-dynamic';

export default async function AdminNoCohortPage() {
  await requireAdmin();

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6 py-10">
      <div className="mb-6 flex justify-center">
        <Logo />
      </div>
      <Card>
        <EmptyState
          emoji="🏗️"
          title="No cohort exists yet"
          description="Daily Rounds is organised around cohorts. Create one with `npm run db:seed` in development, or run the documented production bootstrap to open your first cohort."
        />
        <div className="px-6 pb-6">
          <pre className="overflow-x-auto rounded-2xl bg-bg-sunken p-4 text-xs text-fg-muted">
            npm run db:migrate{'\n'}npm run db:seed
          </pre>
        </div>
      </Card>
    </div>
  );
}
