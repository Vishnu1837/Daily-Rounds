'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { recomputeCohort } from '@/server/actions/admin';

/**
 * Rebuilds every derived metric from source records. Safe to press at any time — it is the
 * practical proof that nothing in this system is unrecoverable.
 */
export function RecalculateButton({ cohortId }: { cohortId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      size="sm"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await recomputeCohort(cohortId);
          if (!result.ok) {
            toast.error('Recalculation failed', result.message);
            return;
          }
          toast.success('Metrics recalculated', `${result.data.members} students refreshed`);
          router.refresh();
        })
      }
    >
      <RefreshCw className="size-4" aria-hidden />
      Recalculate
    </Button>
  );
}
