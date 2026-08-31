'use client';

import {
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  forwardRef,
  useId,
} from 'react';

import { cn } from '@/lib/cn';

const CONTROL =
  'w-full rounded-2xl border border-border bg-bg-elevated px-4 py-3 text-fg ' +
  'placeholder:text-fg-subtle transition-[border-color,box-shadow] duration-150 ' +
  'focus:border-pulse-500 focus:outline-none focus:ring-4 focus:ring-pulse-500/15 ' +
  'disabled:cursor-not-allowed disabled:opacity-60 ' +
  'aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/15';

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
  className,
  required,
}: {
  label: ReactNode;
  htmlFor?: string;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
  required?: boolean;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-fg">
        {label}
        {required && (
          <span className="ml-1 text-danger" aria-hidden>
            *
          </span>
        )}
      </label>
      {children}
      {error ? (
        <p className="flex items-start gap-1.5 text-sm font-medium text-danger" role="alert">
          <span aria-hidden>⚠</span>
          {error}
        </p>
      ) : hint ? (
        <p className="text-sm text-fg-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

export type TextInputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: ReactNode;
  error?: string;
  hint?: ReactNode;
};

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { label, error, hint, className, id, required, ...props },
  ref,
) {
  const generated = useId();
  const inputId = id ?? generated;
  const input = (
    <input
      ref={ref}
      id={inputId}
      required={required}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${inputId}-error` : undefined}
      className={cn(CONTROL, className)}
      {...props}
    />
  );

  if (!label) return input;
  return (
    <Field label={label} htmlFor={inputId} error={error} hint={hint} required={required}>
      {input}
    </Field>
  );
});

export type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: ReactNode;
  error?: string;
  hint?: ReactNode;
};

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { label, error, hint, className, id, required, rows = 3, ...props },
  ref,
) {
  const generated = useId();
  const inputId = id ?? generated;
  const field = (
    <textarea
      ref={ref}
      id={inputId}
      rows={rows}
      required={required}
      aria-invalid={error ? true : undefined}
      className={cn(CONTROL, 'resize-y leading-relaxed', className)}
      {...props}
    />
  );
  if (!label) return field;
  return (
    <Field label={label} htmlFor={inputId} error={error} hint={hint} required={required}>
      {field}
    </Field>
  );
});

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: ReactNode;
  error?: string;
  hint?: ReactNode;
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, hint, className, id, required, children, ...props },
  ref,
) {
  const generated = useId();
  const inputId = id ?? generated;
  const field = (
    <div className="relative">
      <select
        ref={ref}
        id={inputId}
        required={required}
        aria-invalid={error ? true : undefined}
        className={cn(CONTROL, 'appearance-none pr-10', className)}
        {...props}
      >
        {children}
      </select>
      <span
        className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-fg-subtle"
        aria-hidden
      >
        ▾
      </span>
    </div>
  );
  if (!label) return field;
  return (
    <Field label={label} htmlFor={inputId} error={error} hint={hint} required={required}>
      {field}
    </Field>
  );
});

/** Large tap-friendly choice chips — used heavily in onboarding and the check-in. */
export function ChoiceGroup<T extends string>({
  name,
  value,
  onChange,
  options,
  columns = 1,
  className,
}: {
  name: string;
  value: T | null;
  onChange: (value: T) => void;
  options: { value: T; label: string; description?: string; emoji?: string }[];
  columns?: 1 | 2 | 3;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={name}
      className={cn(
        'grid gap-2',
        columns === 2 && 'grid-cols-2',
        columns === 3 && 'grid-cols-3',
        className,
      )}
    >
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'tap flex items-center gap-3 rounded-2xl border p-3.5 text-left transition-all duration-150',
              'active:scale-[0.98] motion-reduce:active:scale-100',
              selected
                ? 'border-pulse-500 bg-pulse-500/10 ring-2 ring-pulse-500/25'
                : 'border-border bg-bg-elevated hover:border-border-strong hover:bg-bg-sunken',
            )}
          >
            {option.emoji && (
              <span className="text-xl" aria-hidden>
                {option.emoji}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  'block text-sm font-semibold',
                  selected ? 'text-pulse-700 dark:text-pulse-200' : 'text-fg',
                )}
              >
                {option.label}
              </span>
              {option.description && (
                <span className="mt-0.5 block text-xs text-fg-muted">{option.description}</span>
              )}
            </span>
            <span
              className={cn(
                'grid size-5 shrink-0 place-items-center rounded-full border-2 transition-colors',
                selected ? 'border-pulse-500 bg-pulse-500' : 'border-border-strong',
              )}
              aria-hidden
            >
              {selected && <span className="size-1.5 rounded-full bg-white" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** 1–N rating scale with accessible labels. */
export function RatingScale({
  value,
  onChange,
  max = 5,
  lowLabel,
  highLabel,
  name,
}: {
  value: number | null;
  onChange: (value: number) => void;
  max?: number;
  lowLabel?: string;
  highLabel?: string;
  name: string;
}) {
  return (
    <div className="space-y-2">
      <div role="radiogroup" aria-label={name} className="flex gap-1.5">
        {Array.from({ length: max }, (_, i) => i + 1).map((n) => {
          const selected = value === n;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${n} out of ${max}`}
              onClick={() => onChange(n)}
              className={cn(
                'tap h-12 flex-1 rounded-xl border text-sm font-bold transition-all duration-150',
                'active:scale-95 motion-reduce:active:scale-100',
                selected
                  ? 'border-pulse-500 bg-pulse-600 text-white shadow-soft dark:bg-pulse-500 dark:text-ink-950'
                  : 'border-border bg-bg-elevated text-fg-muted hover:border-border-strong hover:bg-bg-sunken',
              )}
            >
              {n}
            </button>
          );
        })}
      </div>
      {(lowLabel || highLabel) && (
        <div className="flex justify-between text-xs text-fg-subtle">
          <span>{lowLabel}</span>
          <span>{highLabel}</span>
        </div>
      )}
    </div>
  );
}

/** Inline non-field error, e.g. "that email and password do not match". */
export function FormError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-2xl border border-danger/30 bg-danger/8 p-3.5 text-sm font-medium text-danger"
    >
      <span aria-hidden>⚠</span>
      <span>{children}</span>
    </div>
  );
}

export function FormSuccess({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <div
      role="status"
      className="flex items-start gap-2.5 rounded-2xl border border-success/30 bg-success/8 p-3.5 text-sm font-medium text-success"
    >
      <span aria-hidden>✓</span>
      <span>{children}</span>
    </div>
  );
}
