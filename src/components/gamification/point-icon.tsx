import {
  AlarmClock,
  Brain,
  CalendarCheck,
  CalendarPlus,
  ClipboardCheck,
  Flame,
  Layers,
  PenLine,
  Scale,
  Sparkles,
  Target,
  Timer,
  Trophy,
  Video,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import type { PointEvent } from '@/db/schema';
import { cn } from '@/lib/cn';

/**
 * One glyph per way of earning XP.
 *
 * The ledger is a list of fourteen near-identical sentences, and a student reading back
 * their own day should be able to tell "attended the study room" from "completed the study
 * block" without reading either. The icon carries that difference; the label confirms it.
 *
 * Tone is not decoration either. Everything that counts toward consistency is a `pulse`
 * behaviour, bonuses are `iris`, and the two things that are neither — a streak milestone
 * and an admin correction — get `flame` and `neutral`. The colour of a row therefore says
 * which of the three tables further down the page it came from.
 */
export type PointEventTone = 'pulse' | 'iris' | 'flame' | 'citrus' | 'neutral';

const ICONS: Record<PointEvent, LucideIcon> = {
  daily_check_in: ClipboardCheck,
  tomorrow_plan: CalendarPlus,
  live_session_present: Video,
  live_session_late: AlarmClock,
  study_block_completed: Timer,
  daily_target_completed: Target,
  reflection: PenLine,
  quiz_attempt: Brain,
  quiz_bonus: Sparkles,
  flashcard_session: Layers,
  streak_bonus: Flame,
  achievement: Trophy,
  weekly_review: CalendarCheck,
  admin_adjustment: Scale,
};

const TONES: Record<PointEvent, PointEventTone> = {
  daily_check_in: 'pulse',
  tomorrow_plan: 'pulse',
  live_session_present: 'pulse',
  live_session_late: 'flame',
  study_block_completed: 'pulse',
  daily_target_completed: 'pulse',
  reflection: 'pulse',
  quiz_attempt: 'iris',
  quiz_bonus: 'iris',
  flashcard_session: 'iris',
  streak_bonus: 'flame',
  achievement: 'citrus',
  weekly_review: 'iris',
  admin_adjustment: 'neutral',
};

export function pointEventTone(event: PointEvent): PointEventTone {
  return TONES[event];
}

const TILE: Record<PointEventTone, string> = {
  pulse: 'bg-pulse-500/12 text-pulse-700 dark:text-pulse-300',
  iris: 'bg-iris-500/14 text-iris-700 dark:text-iris-300',
  flame: 'bg-flame-500/14 text-flame-700 dark:text-flame-300',
  citrus: 'bg-citrus-500/18 text-citrus-700 dark:text-citrus-300',
  neutral: 'bg-bg-inset text-fg-muted',
};

const SIZE = {
  sm: { box: 'size-8 rounded-lg', glyph: 'size-4' },
  md: { box: 'size-10 rounded-xl', glyph: 'size-[18px]' },
} as const;

/**
 * The tile itself.
 *
 * `muted` is the "not yet" state — the same glyph, drained of colour, so a behaviour a
 * student has not done today reads as the *same thing* they will have done by tonight
 * rather than as some other row entirely.
 */
export function PointEventIcon({
  event,
  size = 'md',
  muted,
  className,
}: {
  event: PointEvent;
  size?: keyof typeof SIZE;
  muted?: boolean;
  className?: string;
}) {
  const Glyph = ICONS[event];
  const { box, glyph } = SIZE[size];

  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center',
        box,
        muted ? 'bg-bg-inset text-fg-subtle' : TILE[TONES[event]],
        className,
      )}
      aria-hidden
    >
      <Glyph className={glyph} />
    </span>
  );
}
