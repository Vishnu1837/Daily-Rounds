'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';

import { AvatarPicker } from '@/components/ui/avatar-picker';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { FormError, FormSuccess, Select, TextInput } from '@/components/ui/form';
import { PageHeader } from '@/components/ui/page-header';
import { useToast } from '@/components/ui/toast';
import { TIMEZONE_GROUPS, timezoneLabel } from '@/lib/timezones';
import { type ActionState, changePasswordAction } from '@/server/actions/auth';
import { updateProfileAction } from '@/server/actions/onboarding';
import { updateAvatarAction } from '@/server/actions/profile';

type User = {
  fullName: string;
  email: string;
  whatsapp: string | null;
  university: string | null;
  timezone: string;
  avatarUrl: string | null;
};

/**
 * The cohort lead's own profile.
 *
 * The admin console is otherwise entirely about other people, which is how the lead's own
 * name ends up as whatever the seed script happened to write. This is the same profile a
 * student edits — same action, same validation — presented in the console's own layout, so
 * the two can never drift into being different features.
 */
export function AdminProfileScreen({
  user,
  cohort,
}: {
  user: User;
  cohort: { name: string; timezone: string };
}) {
  const toast = useToast();

  return (
    <div className="space-y-4 lg:space-y-5">
      <PageHeader
        eyebrow="Admin console"
        title="Your profile"
        description="How you appear to your cohort — your name sits on every announcement, attendance mark and material you publish."
      />

      <Card padding="lg">
        <div className="flex flex-wrap items-center gap-6">
          <AvatarPicker
            name={user.fullName}
            avatarUrl={user.avatarUrl}
            onSave={updateAvatarAction}
          />
          <div className="min-w-0">
            <h2 className="text-fg truncate text-xl font-extrabold tracking-tight">
              {user.fullName}
            </h2>
            <p className="text-fg-muted truncate text-sm">{user.email}</p>
            <p className="text-fg-subtle mt-1 truncate text-sm">
              Cohort lead · {cohort.name} · {timezoneLabel(cohort.timezone)}
            </p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
        <Card>
          <CardHeader title="Your details" />
          <div className="p-5 pt-4">
            <DetailsForm user={user} onDone={() => toast.success('Profile updated')} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Password" />
          <div className="p-5 pt-4">
            <PasswordForm onDone={() => toast.success('Password updated')} />
          </div>
        </Card>
      </div>
    </div>
  );
}

function DetailsForm({ user, onDone }: { user: User; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | undefined>();

  return (
    <form
      className="space-y-4"
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
        label="Institution"
        name="university"
        defaultValue={user.university ?? ''}
        error={errors.university}
      />
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

function PasswordForm({ onDone }: { onDone: () => void }) {
  const [state, action, pending] = useActionState(changePasswordAction, initial);

  useEffect(() => {
    if (state.ok) onDone();
    // `onDone` only surfaces a toast; re-running on identity change would double it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok]);

  return (
    <form action={action} className="space-y-4" noValidate>
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
