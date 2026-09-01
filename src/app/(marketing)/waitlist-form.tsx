'use client';

import { useActionState } from 'react';
import { CheckCircle2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { FormError, Select, TextArea, TextInput } from '@/components/ui/form';
import { SITE } from '@/lib/site';
import { joinWaitlistAction } from '@/server/actions/waitlist';

/**
 * Public next-cohort form.
 *
 * Name and WhatsApp are the only required fields. Everything else helps triage but is not
 * worth losing a sign-up over, so the rest are explicitly marked optional rather than being
 * quietly enforced by validation.
 */
export function WaitlistForm() {
  const [state, action, pending] = useActionState(joinWaitlistAction, null);

  if (state?.ok) {
    return (
      <div className="border-success/30 bg-success/8 mt-5 flex gap-3 rounded-2xl border p-5">
        <CheckCircle2 className="text-success mt-0.5 size-5 shrink-0" aria-hidden />
        <div>
          <p className="text-fg text-sm font-bold">You are on the list.</p>
          <p className="text-fg-muted mt-1 text-sm leading-relaxed">
            We will message you on WhatsApp with dates and joining details for{' '}
            {SITE.nextCohortLabel}.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="mt-5 space-y-3">
      <TextInput
        label="Full name"
        name="fullName"
        required
        autoComplete="name"
        placeholder="Your name"
        error={state?.ok === false ? state.errors?.fullName : undefined}
      />
      <TextInput
        label="WhatsApp number"
        name="whatsapp"
        required
        inputMode="tel"
        autoComplete="tel"
        placeholder="+91 98765 43210"
        hint="Include your country code — this is how we send joining details."
        error={state?.ok === false ? state.errors?.whatsapp : undefined}
      />
      <Select label="Year of study (optional)" name="mbbsYear" defaultValue="">
        <option value="">Prefer not to say</option>
        <option value="1">First year</option>
        <option value="2">Second year</option>
        <option value="3">Third year</option>
        <option value="4">Fourth year</option>
        <option value="5">Internship</option>
      </Select>
      <TextInput
        label="College / university (optional)"
        name="university"
        placeholder="Where you study"
        error={state?.ok === false ? state.errors?.university : undefined}
      />
      <TextArea
        label="What is your biggest consistency challenge? (optional)"
        name="challenge"
        rows={3}
        placeholder="Backlogs, procrastination, not knowing where to start…"
        error={state?.ok === false ? state.errors?.challenge : undefined}
      />

      {state?.ok === false && <FormError>{state.message}</FormError>}

      <Button type="submit" size="lg" fullWidth loading={pending}>
        {SITE.waitlistCta}
      </Button>

      <p className="text-fg-subtle text-xs leading-relaxed">
        We only use these details to contact you about {SITE.nextCohortLabel}.
      </p>
    </form>
  );
}
