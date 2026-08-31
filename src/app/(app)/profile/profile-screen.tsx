'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { FormError, FormSuccess, Select, TextInput } from '@/components/ui/form';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { type ActionState, changePasswordAction, logoutAction } from '@/server/actions/auth';
import { updateProfileAction } from '@/server/actions/onboarding';

const TIMEZONES = [
  'Asia/Kolkata',
  'Asia/Karachi',
  'Asia/Dhaka',
  'Asia/Colombo',
  'Asia/Dubai',
  'Europe/London',
  'America/New_York',
  'UTC',
];

type Props = {
  user: {
    fullName: string;
    email: string;
    whatsapp: string | null;
    university: string | null;
    mbbsYear: number | null;
    timezone: string;
    role: 'student' | 'admin';
  };
  cohort: { name: string; startDate: string; endDate: string };
  goals: {
    cohortGoal: string;
    dailyCommitmentMinutes: number;
    examName: string | null;
    examDate: string | null;
    subjectName: string | null;
  } | null;
};

export function ProfileScreen({ user, cohort, goals }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [signingOut, startSignOut] = useTransition();

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-4 px-1 pt-2">
        <Avatar name={user.fullName} size="lg" />
        <div className="min-w-0">
          <h1 className="truncate text-xl font-extrabold tracking-tight text-fg">
            {user.fullName}
          </h1>
          <p className="truncate text-sm text-fg-muted">{user.email}</p>
        </div>
      </header>

      <Card>
        <CardHeader
          title="Your details"
          action={
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="text-sm font-semibold text-pulse-700 dark:text-pulse-400"
            >
              Edit
            </button>
          }
        />
        <dl className="space-y-3 p-5 pt-4">
          <Row label="University" value={user.university ?? 'Not set'} />
          <Row label="MBBS year" value={user.mbbsYear ? `Year ${user.mbbsYear}` : 'Not set'} />
          <Row label="WhatsApp" value={user.whatsapp ?? 'Not set'} />
          <Row label="Timezone" value={user.timezone} />
        </dl>
      </Card>

      <Card>
        <CardHeader title="Your commitment" />
        <dl className="space-y-3 p-5 pt-4">
          <Row label="Cohort" value={cohort.name} />
          <Row label="Runs" value={`${cohort.startDate} → ${cohort.endDate}`} />
          {goals && (
            <>
              <Row label="Subject" value={goals.subjectName ?? 'Not set'} />
              <Row label="Daily target" value={`${goals.dailyCommitmentMinutes} minutes`} />
              {goals.examName && (
                <Row
                  label="Exam"
                  value={`${goals.examName}${goals.examDate ? ` · ${goals.examDate}` : ''}`}
                />
              )}
              <div>
                <dt className="text-2xs font-bold tracking-[0.14em] text-fg-subtle uppercase">
                  What you set out to finish
                </dt>
                <dd className="mt-1.5 text-sm leading-relaxed text-fg italic">
                  “{goals.cohortGoal}”
                </dd>
              </div>
            </>
          )}
        </dl>
      </Card>

      <Card>
        <CardHeader title="Account" />
        <div className="space-y-2.5 p-5 pt-4">
          <Button variant="outline" size="lg" fullWidth onClick={() => setPasswordOpen(true)}>
            Change password
          </Button>
          {user.role === 'admin' && (
            <Link href="/admin" className="block">
              <Button variant="outline" size="lg" fullWidth>
                Open admin console
              </Button>
            </Link>
          )}
          <Button
            variant="ghost"
            size="lg"
            fullWidth
            loading={signingOut}
            onClick={() => startSignOut(() => void logoutAction())}
          >
            Sign out
          </Button>
        </div>
      </Card>

      <p className="px-1 pb-1 text-center text-xs text-fg-subtle">
        <Link href="/how-points-work" className="underline">
          How points and consistency work
        </Link>
      </p>

      {/* -------------------------------------------------------- edit sheet */}
      <Sheet open={editOpen} onClose={() => setEditOpen(false)} title="Edit your details">
        <EditProfileForm
          user={user}
          onDone={() => {
            setEditOpen(false);
            toast.success('Profile updated');
            router.refresh();
          }}
        />
      </Sheet>

      <Sheet open={passwordOpen} onClose={() => setPasswordOpen(false)} title="Change password">
        <ChangePasswordForm onDone={() => toast.success('Password updated')} />
      </Sheet>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-sm text-fg-muted">{label}</dt>
      <dd className="text-right text-sm font-semibold text-fg">{value}</dd>
    </div>
  );
}

function EditProfileForm({ user, onDone }: { user: Props['user']; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | undefined>();

  return (
    <form
      className="space-y-4 pt-2"
      action={(formData) =>
        startTransition(async () => {
          setMessage(undefined);
          setErrors({});
          const result = await updateProfileAction(null, formData);
          if (!result.ok) {
            setMessage(result.message);
            setErrors(result.errors ?? {});
            return;
          }
          onDone();
        })
      }
    >
      <FormError>{message}</FormError>
      <TextInput
        label="Full name"
        name="fullName"
        defaultValue={user.fullName}
        required
        error={errors.fullName}
      />
      <TextInput
        label="WhatsApp"
        name="whatsapp"
        defaultValue={user.whatsapp ?? ''}
        inputMode="tel"
        error={errors.whatsapp}
      />
      <TextInput
        label="University"
        name="university"
        defaultValue={user.university ?? ''}
        error={errors.university}
      />
      <Select label="MBBS year" name="mbbsYear" defaultValue={user.mbbsYear ?? ''}>
        <option value="">Not set</option>
        {[1, 2, 3, 4, 5].map((y) => (
          <option key={y} value={y}>
            Year {y}
          </option>
        ))}
      </Select>
      <Select label="Timezone" name="timezone" defaultValue={user.timezone}>
        {TIMEZONES.map((tz) => (
          <option key={tz} value={tz}>
            {tz.replace('_', ' ')}
          </option>
        ))}
      </Select>
      <Button type="submit" size="lg" fullWidth loading={pending}>
        Save changes
      </Button>
    </form>
  );
}

const initial: ActionState = {};

function ChangePasswordForm({ onDone }: { onDone: () => void }) {
  const [state, action, pending] = useActionState(changePasswordAction, initial);

  useEffect(() => {
    if (state.ok) onDone();
    // `onDone` only surfaces a toast; re-running on identity change would double it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok]);

  return (
    <form action={action} className="space-y-4 pt-2" noValidate>
      {state.ok ? <FormSuccess>{state.message}</FormSuccess> : <FormError>{state.message}</FormError>}
      <TextInput
        label="Current password"
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        required
        error={state.errors?.currentPassword}
      />
      <TextInput
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        error={state.errors?.password}
        hint="At least 8 characters."
      />
      <TextInput
        label="Confirm new password"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        required
        error={state.errors?.confirmPassword}
      />
      <Button type="submit" size="lg" fullWidth loading={pending}>
        Update password
      </Button>
    </form>
  );
}
