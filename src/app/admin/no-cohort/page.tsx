import type { Metadata } from 'next';

import { Logo } from '@/components/brand/logo';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { requireAdmin } from '@/lib/auth/guards';
import { Building2 } from 'lucide-react';

export const metadata: Metadata = { title: 'No cohort' };

// Not prerendered — see the note in the admin layout. This page is all data.
export const instant = false;

export default async function AdminNoCohortPage() {
  await requireAdmin();

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6 py-10">
      <div className="mb-6 flex justify-center">
        <Logo />
      </div>
      <Card variant="outline">
        <EmptyState
          icon={<Building2 className="size-6" aria-hidden />}
          title="No cohort exists yet"
          description="Daily Rounds is organised around cohorts. Create one with `npm run db:seed` in development, or run the documented production bootstrap to open your first cohort."
        />
        <div className="px-6 pb-6">
          <pre className="rounded-panel bg-bg-sunken text-fg-muted overflow-x-auto p-4 font-mono text-xs">
            npm run db:migrate{'\n'}npm run db:seed
          </pre>
        </div>
      </Card>
    </div>
  );
}
