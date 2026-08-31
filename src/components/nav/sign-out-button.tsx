'use client';

import { useTransition } from 'react';
import { LogOut } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { logoutAction } from '@/server/actions/auth';

/**
 * Sign out, usable anywhere. The admin console needs its own copy because an admin who is
 * not also a student in a cohort is redirected away from the student profile screen, which
 * is where the other sign-out lives.
 */
export function SignOutButton({
  variant = 'ghost',
  size = 'md',
  fullWidth,
  className,
}: {
  variant?: 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant={variant}
      size={size}
      fullWidth={fullWidth}
      loading={pending}
      className={cn(className)}
      onClick={() => startTransition(() => void logoutAction())}
    >
      <LogOut className="size-4" aria-hidden />
      Sign out
    </Button>
  );
}
