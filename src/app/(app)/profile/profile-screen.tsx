'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { AvatarPicker } from '@/components/ui/avatar-picker';
import { Button } from '@/components/ui/button';
import { Card, CardAurora, CardHeader } from '@/components/ui/card';
import { FormError, FormSuccess, Select, TextInput } from '@/components/ui/form';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { levelFromPoints } from '@/lib/domain/level';
import { type ActionState, changePasswordAction, logoutAction } from '@/server/actions/auth';
import { updateProfileAction } from '@/server/actions/onboarding';
import { updateAvatarAction } from '@/server/actions/profile';
import { TIMEZONE_GROUPS, timezoneLabel } from '@/lib/timezones';

type Props = {
  user: {
    fullName: string;
    email: string;
    whatsapp: string | null;
    university: string | null;
    mbbsYear: number | null;
    timezone: string;
    role: 'student' | 'admin';
    avatarUrl: string | null;
  };
  cohort: { name: string; startDate: string; endDate: string };
  goals: {
    cohortGoal: string;
    dailyCommitmentMinutes: number;
    examName: string | null;
    examDate: string | null;
    subjectName: string | null;
  } | null;
  /** Lifetime points. The level and rank on the header are derived from this. */
  points: number;
};

export function ProfileScreen({ user, cohort, goals, points }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [signingOut, startSignOut] = useTransition();

  const level = levelFromPoints(points);

  return (
    <div className="space-y-4 lg:space-y-5">
      {/*
        The profile opens with standing rather than with settings. Who you are here is your
        rank and your commitment; the editable fields are administration, and they sit below.
      */}
      <Card variant="solid" tone="pulse" padding="lg" glow className="overflow-hidden text-white">
        <CardAurora tone="pulse" />
        <div className="relative flex flex-wrap items-center gap-5">
          <AvatarPicker
            name={user.fullName}
            avatarUrl={user.avatarUrl}
            onSave={updateAvatarAction}
          />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-extrabold tracking-tight">{user.fullName}</h1>
            <p className="truncate text-sm text-white/70">{user.email}</p>
            <p className="rounded-pill mt-2.5 inline-flex items-center gap-2 bg-white/15 px-3 py-1 text-xs font-bold ring-1 ring-white/20 ring-inset">
              Level {level.level} · {level.rank.title}
            </p>
          </div>
          <div className="w-full sm:w-56">
            <div className="text-2xs flex items-baseline justify-between font-bold tracking-[0.12em] text-white/60 uppercase">
              <span>Total XP</span>
              <span className="stat-num text-base tracking-normal text-white">
                {level.xp.toLocaleString()}
              </span>
            </div>
            <div className="rounded-pill mt-2 h-2 w-full overflow-hidden bg-white/20">
              <div
                className="rounded-pill from-citrus-300 ease-out-soft h-full bg-linear-to-r to-white transition-[width] duration-700"
                style={{ width: `${Math.max(3, level.pct)}%` }}
              />
            </div>
            <p className="text-2xs mt-2 font-semibold text-white/65">
              {level.remaining === null
                ? 'Top of the ladder'
                : `${level.remaining.toLocaleString()} XP to level ${level.level + 1}`}
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Your details"
          action={
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="text-pulse-700 dark:text-pulse-400 text-sm font-semibold"
            >
              Edit
            </button>
          }
        />
        <dl className="space-y-3 p-5 pt-4">
          <Row label="University" value={user.university ?? 'Not set'} />
          <Row label="MBBS year" value={user.mbbsYear ? `Year ${user.mbbsYear}` : 'Not set'} />
          <Row label="WhatsApp" value={user.whatsapp ?? 'Not set'} />
          <Row label="Timezone" value={timezoneLabel(user.timezone)} />
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
                <dt className="eyebrow">What you set out to finish</dt>
                <dd className="text-fg mt-1.5 text-sm leading-relaxed italic">
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

      <p className="text-fg-subtle px-1 pb-1 text-center text-xs">
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
      <dt className="text-fg-muted text-sm">{label}</dt>
      <dd className="text-fg text-right text-sm font-semibold">{value}</dd>
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
        {TIMEZONE_GROUPS.map((group) => (
          <optgroup key={group.region} label={group.region}>
            {group.zones.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.label}
              </option>
            ))}
          </optgroup>
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
      {state.ok ? (
        <FormSuccess>{state.message}</FormSuccess>
      ) : (
        <FormError>{state.message}</FormError>
      )}
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
