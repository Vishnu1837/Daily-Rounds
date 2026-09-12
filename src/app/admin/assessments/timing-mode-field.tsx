'use client';

import type { TimerMode } from '@/db/schema';
import { cn } from '@/lib/cn';

/**
 * How a paper is timed, as a choice an admin makes with the consequences in front of them.
 *
 * Shared by the create sheet and the settings tab rather than written twice, because the
 * two used to disagree by omission: settings offered the choice and create did not, so the
 * only way to discover that one clock for the whole paper was even possible was to make a
 * draft under the wrong timing first and go looking.
 *
 * A `<select>` would fit in less space and would also hide the only thing anyone needs in
 * order to choose — what each option does to the student's sitting. Those consequences are
 * two sentences long and they belong on screen at the moment of the decision, not in a
 * tooltip or a docs page.
 *
 * Posts through a hidden input so both hosts stay plain uncontrolled `<form>`s: the value
 * travels in the FormData with every other field, and `assessmentSchema` is what decides
 * whether the combination is legal.
 */
export function TimingModeField({
  value,
  onChange,
}: {
  value: TimerMode;
  onChange: (value: TimerMode) => void;
}) {
  return (
    <fieldset className="border-border rounded-panel border p-4">
      <legend className="text-fg px-1 text-sm font-bold">How this paper is timed</legend>
      <input type="hidden" name="timerMode" value={value} />
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <TimingChoice
          checked={value === 'per_question'}
          onSelect={() => onChange('per_question')}
          title="A timer on each question"
          body="Every question gets its own allowance and locks when it runs out, wherever the student is by then. Right for rapid recall."
        />
        <TimingChoice
          checked={value === 'whole_paper'}
          onSelect={() => onChange('whole_paper')}
          title="One timer for the whole paper"
          body="No question has a clock of its own. The student spends the total however they like and can revisit anything until it closes. Right for a mock exam."
        />
      </div>
    </fieldset>
  );
}

function TimingChoice({
  checked,
  onSelect,
  title,
  body,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  body: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={checked}
      className={cn(
        'rounded-panel border p-3 text-left transition-colors',
        checked
          ? 'border-pulse-500 bg-pulse-500/8'
          : 'border-border hover:border-border-strong hover:bg-bg-sunken',
      )}
    >
      <span className="flex items-center gap-2">
        <span
          className={cn(
            'grid size-4 shrink-0 place-items-center rounded-full border',
            checked ? 'border-pulse-600 bg-pulse-600' : 'border-border-strong',
          )}
          aria-hidden
        >
          {checked && <span className="size-1.5 rounded-full bg-white" />}
        </span>
        <span className="text-fg text-sm font-bold">{title}</span>
      </span>
      <span className="text-fg-muted mt-1.5 block text-xs">{body}</span>
    </button>
  );
}
