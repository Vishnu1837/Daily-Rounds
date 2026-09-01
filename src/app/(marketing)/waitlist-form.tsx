'use client';

import { useActionState, useId } from 'react';
import type { ReactNode } from 'react';
import { Check } from 'lucide-react';

import { SITE } from '@/lib/site';
import { joinWaitlistAction } from '@/server/actions/waitlist';

/**
 * Public next-cohort form.
 *
 * Behaviour is unchanged: same server action, same validation, same field-level errors.
 * What changed is the skin — the portal's shared controls are tuned for dense product
 * screens, and a boxed grey input inside a 24px-radius paper card reads as a form bolted
 * onto a poster. These fields are local to the public site for the same reason its buttons
 * are.
 *
 * Name and WhatsApp remain the only required fields. Everything else helps triage but is
 * not worth losing a sign-up over, so the rest are marked optional in the label rather than
 * quietly enforced by validation.
 */
export function WaitlistForm() {
  const [state, action, pending] = useActionState(joinWaitlistAction, null);
  const errors = state?.ok === false ? state.errors : undefined;

  if (state?.ok) {
    return (
      <div
        className="mt-8 flex gap-4 rounded-[var(--ed-r-card)] p-6"
        style={{ background: 'var(--ed-mint)' }}
      >
        <span
          className="grid size-8 shrink-0 place-items-center rounded-full"
          style={{ background: 'var(--ed-mint-ink)' }}
        >
          <Check className="size-4 text-white" strokeWidth={2.4} aria-hidden />
        </span>
        <div>
          <p className="text-[15px] font-medium tracking-[-0.02em]">You are on the list.</p>
          <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: 'var(--ed-mint-ink)' }}>
            We will message you on WhatsApp with dates and joining details for{' '}
            {SITE.nextCohortLabel}.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="mt-8 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <EdField label="Full name" required error={errors?.fullName}>
          {(props) => (
            <input
              {...props}
              name="fullName"
              required
              autoComplete="name"
              placeholder="Your name"
              className="ed-input"
            />
          )}
        </EdField>

        <EdField
          label="WhatsApp number"
          required
          error={errors?.whatsapp}
          hint="Include your country code."
        >
          {(props) => (
            <input
              {...props}
              name="whatsapp"
              required
              inputMode="tel"
              autoComplete="tel"
              placeholder="+91 98765 43210"
              className="ed-input"
            />
          )}
        </EdField>

        <EdField label="Year of study" optional>
          {(props) => (
            <select {...props} name="mbbsYear" defaultValue="" className="ed-input">
              <option value="">Prefer not to say</option>
              <option value="1">First year</option>
              <option value="2">Second year</option>
              <option value="3">Third year</option>
              <option value="4">Fourth year</option>
              <option value="5">Internship</option>
            </select>
          )}
        </EdField>

        <EdField label="College / university" optional error={errors?.university}>
          {(props) => (
            <input
              {...props}
              name="university"
              placeholder="Where you study"
              className="ed-input"
            />
          )}
        </EdField>
      </div>

      <EdField label="Your biggest consistency challenge" optional error={errors?.challenge}>
        {(props) => (
          <textarea
            {...props}
            name="challenge"
            rows={3}
            placeholder="Backlogs, procrastination, not knowing where to start…"
            className="ed-input resize-none"
          />
        )}
      </EdField>

      {state?.ok === false && (
        <p className="text-[13px] font-medium" style={{ color: '#c8324b' }} role="alert">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        className="ed-btn ed-btn-solid w-full"
        disabled={pending}
        aria-busy={pending}
      >
        {pending ? 'Sending…' : SITE.waitlistCta}
      </button>

      <p className="text-[12px] leading-relaxed" style={{ color: 'var(--ed-faint)' }}>
        We only use these details to contact you about {SITE.nextCohortLabel}.
      </p>
    </form>
  );
}

/**
 * Label, control and message for one field.
 *
 * The control is passed as a render prop rather than as children so the wiring — `id`,
 * `aria-invalid`, `aria-describedby` — is generated once here and cannot drift between the
 * five fields, which is exactly how a form ends up with an error message no screen reader
 * ever announces.
 */
function EdField({
  label,
  required,
  optional,
  error,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  error?: string;
  hint?: string;
  children: (props: {
    id: string;
    'aria-invalid'?: true;
    'aria-describedby'?: string;
  }) => ReactNode;
}) {
  const id = useId();
  const messageId = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-[13px] font-medium tracking-[-0.01em]">
        {label}
        {optional && (
          <span className="ml-1.5 font-normal" style={{ color: 'var(--ed-faint)' }}>
            optional
          </span>
        )}
        {required && (
          <span className="ml-1" style={{ color: 'var(--ed-accent)' }} aria-hidden>
            *
          </span>
        )}
      </label>

      {children({
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': messageId,
      })}

      {error ? (
        <p id={messageId} className="text-[12px]" style={{ color: '#c8324b' }} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="text-[12px]" style={{ color: 'var(--ed-faint)' }}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
