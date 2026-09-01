'use client';

import {
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  forwardRef,
  useId,
} from 'react';
import { Check, ChevronDown } from 'lucide-react';

import { cn } from '@/lib/cn';

/*
 * One control skin, everywhere.
 *
 * The focus treatment is a colour change plus a soft ring rather than a hard outline: at
 * four pixels of low-opacity indigo it reads as the field "waking up", which is legible at
 * a glance without the boxed-in look that makes long forms feel like paperwork.
 */
const CONTROL =
  'w-full rounded-panel border border-border bg-bg-elevated px-4 py-3 text-fg ' +
  'placeholder:text-fg-subtle transition-[border-color,box-shadow,background-color] duration-150 ' +
  'hover:border-border-strong ' +
  'focus:border-pulse-500 focus:outline-none focus:ring-4 focus:ring-pulse-500/16 ' +
  'disabled:cursor-not-allowed disabled:bg-bg-sunken disabled:opacity-60 ' +
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
      <label htmlFor={htmlFor} className="text-fg block text-sm font-semibold">
        {label}
        {required && (
          <span className="text-danger ml-1" aria-hidden>
            *
          </span>
        )}
      </label>
      {children}
      {error ? (
        <p className="text-danger flex items-start gap-1.5 text-sm font-medium" role="alert">
          <span aria-hidden>⚠</span>
          {error}
        </p>
      ) : hint ? (
        <p className="text-fg-subtle text-sm">{hint}</p>
      ) : null}
    </div>
  );
}

export type TextInputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: ReactNode;
  error?: string;
  hint?: ReactNode;
  /** Rendered inside the field, before the text. Icons only — keep it to one glyph. */
  leading?: ReactNode;
};

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { label, error, hint, className, id, required, leading, ...props },
  ref,
) {
  const generated = useId();
  const inputId = id ?? generated;
  const input = (
    <div className={cn(leading && 'relative')}>
      {leading && (
        <span
          className="text-fg-subtle pointer-events-none absolute top-1/2 left-4 -translate-y-1/2"
          aria-hidden
        >
          {leading}
        </span>
      )}
      <input
        ref={ref}
        id={inputId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-error` : undefined}
        className={cn(CONTROL, leading && 'pl-11', className)}
        {...props}
      />
    </div>
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
        className={cn(CONTROL, 'appearance-none pr-11', className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="text-fg-subtle pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2"
        aria-hidden
      />
    </div>
  );
  if (!label) return field;
  return (
    <Field label={label} htmlFor={inputId} error={error} hint={hint} required={required}>
      {field}
    </Field>
  );
});

/**
 * Large tap-friendly choice cards — used heavily in onboarding and the check-in.
 *
 * The selected state changes three things at once (border, fill, and a filled tick) because
 * a single one of them is easy to miss on a phone held at arm's length in a corridor, which
 * is where most check-ins actually happen.
 */
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
        'grid gap-2.5',
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
              'tap group rounded-panel relative flex items-center gap-3 overflow-hidden border p-3.5 text-left',
              'ease-out-soft transition-all duration-200 active:scale-[0.985] motion-reduce:active:scale-100',
              selected
                ? 'border-pulse-500 bg-pulse-500/10 shadow-glow-pulse'
                : 'border-border bg-bg-elevated hover:border-pulse-300 hover:shadow-soft hover:-translate-y-0.5 motion-reduce:hover:translate-y-0',
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
                <span className="text-fg-muted mt-0.5 block text-xs">{option.description}</span>
              )}
            </span>
            <span
              className={cn(
                'grid size-5 shrink-0 place-items-center rounded-full border-2 transition-all duration-200',
                selected
                  ? 'border-pulse-500 bg-pulse-500 scale-110 text-white'
                  : 'border-border-strong text-transparent',
              )}
              aria-hidden
            >
              <Check className="size-3" strokeWidth={3.5} />
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * The same control as `ChoiceGroup`, for questions where more than one answer is true.
 *
 * Kept as a separate component rather than a `multiple` flag on the one above, because the
 * two differ in more than behaviour: this one is a group of checkboxes with square ticks
 * and no "one of these replaces the others" expectation, and conflating them is how a
 * radio group ends up silently accepting two answers.
 */
export function MultiChoiceGroup<T extends string>({
  name,
  values,
  onChange,
  options,
  columns = 1,
  className,
}: {
  name: string;
  values: T[];
  onChange: (values: T[]) => void;
  options: { value: T; label: string; description?: string; emoji?: string }[];
  columns?: 1 | 2 | 3;
  className?: string;
}) {
  const toggle = (value: T) =>
    onChange(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);

  return (
    <div
      role="group"
      aria-label={name}
      className={cn(
        'grid gap-2.5',
        columns === 2 && 'grid-cols-2',
        columns === 3 && 'grid-cols-3',
        className,
      )}
    >
      {options.map((option) => {
        const selected = values.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            role="checkbox"
            aria-checked={selected}
            onClick={() => toggle(option.value)}
            className={cn(
              'tap group rounded-panel relative flex items-center gap-3 overflow-hidden border p-3.5 text-left',
              'ease-out-soft transition-all duration-200 active:scale-[0.985] motion-reduce:active:scale-100',
              selected
                ? 'border-pulse-500 bg-pulse-500/10 shadow-glow-pulse'
                : 'border-border bg-bg-elevated hover:border-pulse-300 hover:shadow-soft hover:-translate-y-0.5 motion-reduce:hover:translate-y-0',
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
                <span className="text-fg-muted mt-0.5 block text-xs">{option.description}</span>
              )}
            </span>
            <span
              className={cn(
                // A square tick, against the radio group's round one: the shape is the only
                // cue that says "more than one of these can be true".
                'grid size-5 shrink-0 place-items-center rounded-md border-2 transition-all duration-200',
                selected
                  ? 'border-pulse-500 bg-pulse-500 scale-110 text-white'
                  : 'border-border-strong text-transparent',
              )}
              aria-hidden
            >
              <Check className="size-3" strokeWidth={3.5} />
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
      <div role="radiogroup" aria-label={name} className="flex gap-2">
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
                'tap rounded-field ease-out-soft h-13 flex-1 border text-base font-bold transition-all duration-200',
                'active:scale-95 motion-reduce:active:scale-100',
                selected
                  ? 'from-pulse-500 to-pulse-600 shadow-glow-pulse scale-105 border-transparent bg-linear-to-b text-white'
                  : 'border-border bg-bg-elevated text-fg-muted hover:border-pulse-300 hover:text-fg',
              )}
            >
              {n}
            </button>
          );
        })}
      </div>
      {(lowLabel || highLabel) && (
        <div className="text-fg-subtle flex justify-between text-xs">
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
      className="animate-rise rounded-panel border-danger/30 bg-danger/8 text-danger flex items-start gap-2.5 border p-3.5 text-sm font-medium"
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
      className="animate-rise rounded-panel border-success/30 bg-success/8 text-success-strong dark:text-success flex items-start gap-2.5 border p-3.5 text-sm font-medium"
    >
      <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </div>
  );
}
