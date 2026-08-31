import type { Metadata } from 'next';
import { Compass } from 'lucide-react';

import { Logo } from '@/components/brand/logo';
import { LinkButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';

export const metadata: Metadata = { title: 'Page not found' };

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-10">
      <div className="mb-6 flex justify-center">
        <Logo />
      </div>

      <Card variant="outline">
        <EmptyState
          tone="iris"
          icon={<Compass className="size-6" aria-hidden />}
          title="That page doesn't exist"
          description="The link may be out of date, or the screen may have moved. Everything you need is one tap away from today."
          action={
            <LinkButton href="/" size="lg">
              Back to today
            </LinkButton>
          }
        />
      </Card>
    </div>
  );
}
