import type { Metadata } from 'next';

import { Logo } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { requireUser } from '@/lib/auth/guards';
import { logoutAction } from '@/server/actions/auth';
import { Clock } from 'lucide-react';

export const metadata: Metadata = { title: 'No cohort yet' };

// Not prerendered: a one-off screen with no frame worth showing ahead of its data.
export const instant = false;

export default async function NoCohortPage() {
  const user = await requireUser();

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-10">
      <div className="mb-6 flex justify-center">
        <Logo />
      </div>
      <Card variant="outline">
        <EmptyState
          icon={<Clock className="size-6" aria-hidden />}
          title="You're not in a cohort yet"
          description={`Hi ${user.fullName.split(' ')[0]} — your account is set up, but you haven't been added to an active cohort. Your cohort lead can add you from the admin console.`}
        />
        <form action={logoutAction} className="px-6 pb-6">
          <Button type="submit" variant="outline" size="lg" fullWidth>
            Sign out
          </Button>
        </form>
      </Card>
    </div>
  );
}
