'use client';

import { useTransition } from 'react';
import { Eye } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { startStudentViewAction } from '@/server/actions/student-view';

/**
 * Drops the admin into the student app as `userId`, with no credentials.
 *
 * The action sets the "view as" cookie and redirects to the student dashboard; a bar across
 * the top of every student screen then shows whose account it is and ends the session. See
 * `@/server/actions/student-view` and `@/lib/auth/impersonation`.
 */
export function OpenStudentViewButton({
  userId,
  name,
  size = 'sm',
  variant = 'primary',
  label,
}: {
  userId: string;
  name: string;
  size?: 'sm' | 'md';
  variant?: 'primary' | 'outline' | 'ghost';
  label?: string;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant={variant}
      size={size}
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await startStudentViewAction(userId);
          // The success path redirects and never returns; only a failure lands here.
          if (result && !result.ok) {
            toast.error('Could not open student view', result.message);
          }
        })
      }
    >
      <Eye className="size-3.5" aria-hidden />
      {label ?? `Open as ${name.split(' ')[0]}`}
    </Button>
  );
}
