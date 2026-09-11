'use client';

import { useId } from 'react';
import { Coffee, Play, Sprout, Square, TreeDeciduous } from 'lucide-react';

import { AnimatedCheck, CelebrationModal } from '@/components/gamification/celebration';
import { EmptyPlot, Tree } from '@/components/grove/tree';
import { LiveDot } from '@/components/ui/badge';
import { Button, LinkButton } from '@/components/ui/button';
import { Card, CardAurora } from '@/components/ui/card';
import { LiveRegion } from '@/components/ui/feedback';
import { Segmented } from '@/components/ui/segmented';
import { cn } from '@/lib/cn';
import {
  AWAY_GRACE_SECONDS,
  FOCUS_PRESETS,
  SPECIES_NAMES,
  breakAfterRound,
  growthStage,
} from '@/lib/domain/grove';
import { SITE } from '@/lib/site';

import { type FocusRound, formatClock, plural } from './use-focus-round';

/**
 * The round, drawn.
 *
 * Pure presentation over `useFocusRound`. It is rendered in two places and must look the
 * same in both: down the middle of `/study`, and inside the floating panel the dock opens on
 * top of whatever else the student is reading. Splitting the drawing from the machine is
 * what makes that possible without a second copy of the timer — see `./use-focus-round`.
 */
export function RoundPanel({
  round,
  header,
  footer,
}: {
  round: FocusRound;
  /** The row above the card: a back link on the page, a minimise button in the dock. */
  header?: React.ReactNode;
  /** Anything that belongs under the card and is specific to where this is rendered. */
  footer?: React.ReactNode;
}) {
  const {
    view,
    tree,
    species,
    preset,
    presetKey,
    setPresetKey,
    trees,
    grown,
    withered,
    lost,
    session,
    finished,
    shortBlock,
    targetComplete,
    celebration,
    setCelebration,
    pending,
    roundRemaining,
    roundProgress,
    breakRemaining,
    breakEndsAt,
    blockElapsed,
    subjects,
    active,
    setSlot,
    subjectName,
    topicTitle,
    plannedMinutes,
    quizId,
    canSwitchSubject,
    checkedIn,
    streak,
    startRound,
    killRound,
    skipBreak,
    finishBlock,
    completeTarget,
    startAnotherBlock,
  } = round;

  /*
   * The progress ring's gradient needs an id of its own.
   *
   * Two of these panels can be in the document at once — the router keeps the page you just
   * left mounted and hidden so going back is instant, so the study screen is still there
   * underneath while the dock draws the same round over the top of something else. A fixed id
   * would make the visible ring resolve to the hidden one's gradient, and take its colours
   * from a round in a different phase.
   */
  const ringGradient = useId();

  const dark = view === 'focus';
  const ringPct =
    view === 'focus'
      ? roundProgress * 100
      : view === 'break' && breakEndsAt
        ? (1 - breakRemaining / (breakAfterRound(preset, grown) * 60)) * 100
        : 0;

  const statusLabel =
    view === 'focus'
      ? 'Growing — keep this tab open'
      : view === 'break'
        ? 'Break'
        : view === 'lost'
          ? 'Withered'
          : finished
            ? shortBlock
              ? 'Too short to count'
              : 'Block logged'
            : grown > 0
              ? 'Ready for the next round'
              : 'Ready when you are';

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <CelebrationModal payload={celebration} onClose={() => setCelebration(null)} />

      {header}

      {/*
        The screen goes dark while a round runs. Dimming the rest of the interface is the only
        honest way to signal "you are meant to be doing something else right now" — an app that
        stays bright and busy while asking for twenty-five minutes of focus is arguing with
        itself.
      */}
      <Card
        variant={dark ? 'solid' : 'surface'}
        tone="neutral"
        padding="none"
        className={cn(
          'relative overflow-hidden transition-colors duration-700',
          dark && 'text-white',
        )}
      >
        {dark && <CardAurora tone="pulse" />}

        <div className="relative flex flex-col items-center px-5 py-9 text-center sm:py-11">
          {subjectName && (
            <p
              className={cn(
                'text-2xs font-bold tracking-[0.16em] uppercase',
                dark ? 'text-white/60' : 'text-iris-700 dark:text-iris-300',
              )}
            >
              {subjectName}
            </p>
          )}
          <h1
            className={cn(
              'mt-2 max-w-md text-xl font-extrabold text-balance sm:text-2xl',
              dark ? 'text-white' : 'text-fg',
            )}
          >
            {topicTitle ?? 'Free study block'}
          </h1>
          <p className={cn('mt-2 text-sm', dark ? 'text-white/65' : 'text-fg-muted')}>
            {view === 'focus'
              ? `${SPECIES_NAMES[species]} · ${preset.focusMinutes}-minute round`
              : `Planned: ${plannedMinutes} minutes today`}
          </p>

          {/*
            Which subject this block is for.
            Only shown before anything starts: once the timer is running the block is filed
            against a topic, and changing it afterwards would misreport what the time bought.
          */}
          {canSwitchSubject && subjects.length > 1 && (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              {subjects.map((choice) => (
                <button
                  key={choice.slot}
                  type="button"
                  onClick={() => setSlot(choice.slot)}
                  aria-pressed={choice.slot === active?.slot}
                  className={cn(
                    'rounded-pill px-3 py-1.5 text-xs font-bold ring-1 transition-colors ring-inset',
                    choice.slot === active?.slot
                      ? dark
                        ? 'bg-white/20 text-white ring-white/25'
                        : 'bg-iris-100 text-iris-800 ring-iris-200 dark:bg-iris-900/40 dark:text-iris-200 dark:ring-iris-800'
                      : dark
                        ? 'text-white/65 ring-white/15 hover:bg-white/10'
                        : 'text-fg-muted ring-border hover:bg-bg-sunken',
                  )}
                >
                  {choice.subjectName ?? 'Subject'}
                </button>
              ))}
            </div>
          )}

          {/* ----------------------------------------------- the ring and tree */}
          <div className="relative mt-8 grid place-items-center">
            <svg width="248" height="248" className="-rotate-90" aria-hidden>
              <defs>
                <linearGradient id={ringGradient} x1="0" y1="0" x2="1" y2="1">
                  <stop
                    offset="0%"
                    stopColor={view === 'break' ? 'var(--color-aqua-300)' : 'var(--color-success)'}
                  />
                  <stop
                    offset="100%"
                    stopColor={
                      view === 'break' ? 'var(--color-aqua-500)' : 'var(--color-success-strong)'
                    }
                  />
                </linearGradient>
              </defs>
              <circle
                cx="124"
                cy="124"
                r="110"
                fill="none"
                strokeWidth="14"
                className={dark ? 'stroke-white/15' : 'stroke-bg-inset'}
              />
              <circle
                cx="124"
                cy="124"
                r="110"
                fill="none"
                stroke={`url(#${ringGradient})`}
                strokeWidth="14"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 110}
                strokeDashoffset={
                  2 * Math.PI * 110 * (1 - Math.max(0, Math.min(100, ringPct)) / 100)
                }
                className="ease-out-soft transition-[stroke-dashoffset] duration-700 motion-reduce:transition-none"
              />
            </svg>

            <div className="absolute inset-0 grid place-items-center">
              <div className="flex flex-col items-center">
                {view === 'break' ? (
                  <Coffee
                    className={cn('size-16', dark ? 'text-white/80' : 'text-aqua-500')}
                    strokeWidth={1.4}
                    aria-hidden
                  />
                ) : view === 'lost' && lost ? (
                  <Tree species={lost.species} status="withered" size={96} />
                ) : tree ? (
                  <Tree
                    species={species}
                    stage={growthStage(roundProgress)}
                    size={96}
                    sway
                    title={`${SPECIES_NAMES[species]} growing`}
                  />
                ) : (
                  <EmptyPlot size={96} className={dark ? 'text-white' : 'text-fg'} />
                )}

                <p
                  className={cn(
                    'stat-num text-stat-sm mt-1 tabular-nums transition-colors',
                    dark ? 'text-white' : view === 'break' ? 'text-aqua-500' : 'text-fg',
                  )}
                >
                  {view === 'focus'
                    ? formatClock(roundRemaining)
                    : view === 'break'
                      ? formatClock(breakRemaining)
                      : formatClock(preset.focusMinutes * 60)}
                </p>
                <p
                  className={cn(
                    'mt-1 text-xs font-semibold',
                    dark ? 'text-white/65' : 'text-fg-muted',
                  )}
                >
                  {statusLabel}
                </p>
              </div>
            </div>

            {view === 'focus' && (
              <span className="absolute top-1 right-6">
                <LiveDot />
              </span>
            )}
          </div>

          <LiveRegion>
            {view === 'focus'
              ? `Focus round running, ${Math.ceil(roundRemaining / 60)} minutes left.`
              : view === 'break'
                ? `Break, ${Math.ceil(breakRemaining / 60)} minutes left.`
                : view === 'lost'
                  ? 'Your tree withered.'
                  : 'No round running.'}
          </LiveRegion>

          {/* ------------------------------------------------ today's plot */}
          <div className="mt-6 w-full max-w-xs">
            <div
              className={cn(
                'rounded-panel flex min-h-16 flex-wrap items-end justify-center gap-0.5 px-3 py-2',
                dark ? 'bg-white/8 text-white' : 'bg-bg-sunken text-fg',
              )}
            >
              {trees.length === 0 ? (
                <p className={cn('py-3 text-xs', dark ? 'text-white/55' : 'text-fg-subtle')}>
                  No rounds today yet.
                </p>
              ) : (
                trees.map((t) => (
                  <Tree
                    key={t.id}
                    species={t.species}
                    status={t.status}
                    size={26}
                    title={
                      t.status === 'grown'
                        ? `${SPECIES_NAMES[t.species]}, grown`
                        : `${SPECIES_NAMES[t.species]}, withered`
                    }
                  />
                ))
              )}
            </div>
            <p className={cn('mt-2 text-xs', dark ? 'text-white/55' : 'text-fg-muted')}>
              {plural(grown, 'tree')} today
              {withered > 0 && ` · ${withered} withered`}
              {streak > 0 && ` · ${plural(streak, 'day')} planting streak`}
            </p>
            {/*
              The block clock, kept deliberately small. It is the number that pays points, but
              putting it next to the round countdown at the same weight would give the student
              two things to watch and make neither of them mean anything.
            */}
            <p className={cn('mt-1 text-xs', dark ? 'text-white/40' : 'text-fg-subtle')}>
              Study block: {Math.floor(blockElapsed / 60)} of {plannedMinutes} min
            </p>
          </div>

          {/* ---------------------------------------------------- controls */}
          <div className="mt-7 w-full max-w-xs space-y-2.5">
            {view === 'focus' ? (
              <>
                <Button
                  variant="inverse-soft"
                  size="lg"
                  fullWidth
                  onClick={() => void killRound('gave_up')}
                >
                  Give up — kill the tree
                </Button>
                <p className="text-xs leading-relaxed text-white/50">
                  Minimise this and the round keeps growing while you read anywhere in {SITE.name}.
                  Leaving for another tab or app for more than {AWAY_GRACE_SECONDS} seconds still
                  kills it. Locking your screen is fine — the tree keeps growing in the dark, and so
                  does the study room while it is open.
                </p>
              </>
            ) : view === 'break' ? (
              <>
                {/*
                  The break is the end of a round, and the end of a round is the moment the
                  block is worth logging: the student is already stopped and the work is
                  freshest. It leads because a grown tree is not the thing that ticks the day
                  off — a logged block is, and students were closing the tab on an unlogged
                  one because the only button in front of them was about the next round.
                */}
                {session && !finished && (
                  <Button size="xl" fullWidth loading={pending} onClick={finishBlock}>
                    <Square className="size-4 fill-current" aria-hidden />
                    Finish the block and log it
                  </Button>
                )}
                {/*
                  Offered here for the same reason. The check-in opens pre-filled from the
                  round that just grew, so taking it up is a read-and-confirm rather than a
                  form — which is the whole point of asking now instead of at eleven at night.
                */}
                <LinkButton href="/check-in" variant="outline" size="lg" fullWidth>
                  Log this in your check-in
                </LinkButton>
                <Button variant="outline" size="lg" fullWidth onClick={skipBreak}>
                  Skip the break
                </Button>
                <p className="text-fg-subtle text-xs">
                  Logging the block is what ticks it off today&apos;s checklist. Your tree is
                  already safe — and the next round starts when you say so, because a break that
                  starts a round for you is just a round you did not choose.
                </p>
              </>
            ) : finished && shortBlock ? (
              <div className="rounded-panel bg-warning/14 ring-warning/25 p-4 text-center ring-1 ring-inset">
                <p className="text-fg text-sm font-bold">Too short to count</p>
                <p className="text-fg-muted mt-1 text-sm">
                  You studied {shortBlock.minutes} minutes. A block needs {shortBlock.required} to
                  earn XP — start another round when you have a real stretch of time.
                </p>
              </div>
            ) : null}

            {(view === 'idle' || view === 'lost') && !finished && (
              <>
                {view === 'lost' && lost && (
                  <div className="rounded-panel bg-danger/10 ring-danger/20 p-4 text-center ring-1 ring-inset">
                    <p className="text-fg text-sm font-bold">
                      Your {SPECIES_NAMES[lost.species].toLowerCase()} withered
                    </p>
                    <p className="text-fg-muted mt-1 text-sm">
                      The stump stays in your grove. The minutes you did sit still count towards
                      your study block — the tree does not.
                    </p>
                  </div>
                )}

                <Segmented
                  ariaLabel="Round length"
                  value={presetKey}
                  onChange={setPresetKey}
                  options={FOCUS_PRESETS.map((p) => ({
                    value: p.key,
                    label: `${p.label} · ${p.focusMinutes}m`,
                  }))}
                />
                <p className="text-fg-subtle text-xs">{preset.blurb}</p>

                <Button size="xl" fullWidth loading={pending} onClick={startRound}>
                  <Sprout className="size-5" aria-hidden />
                  {grown > 0 || withered > 0 ? 'Start another round' : 'Start your study block'}
                </Button>
              </>
            )}

            {view !== 'focus' && view !== 'break' && session && !finished && (
              <Button variant="outline" size="lg" fullWidth loading={pending} onClick={finishBlock}>
                <Square className="size-4 fill-current" aria-hidden />
                Finish the block and log it
              </Button>
            )}

            {finished && !shortBlock && (
              <div className="rounded-panel bg-success/12 text-success-strong ring-success/25 dark:text-success flex items-center justify-center gap-2.5 p-4 ring-1 ring-inset">
                <AnimatedCheck size={22} />
                <span className="font-bold">Study block complete</span>
              </div>
            )}

            {finished && (
              <Button
                variant="outline"
                size="lg"
                fullWidth
                loading={pending}
                onClick={startAnotherBlock}
              >
                <Play className="size-4 fill-current" aria-hidden />
                Start another block
              </Button>
            )}
          </div>

          {view !== 'focus' && (
            <p className="text-fg-subtle mt-6 max-w-xs text-xs leading-relaxed">
              {SITE.name} doesn&apos;t try to prove you studied. It records what you committed to
              and what you actually did — the honesty is the point.
            </p>
          )}
        </div>
      </Card>

      {/* -------------------------------------------------------- next steps */}
      {!dark && (
        <Card padding="lg">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="eyebrow">Your grove</p>
              <p className="text-fg-muted mt-1 text-sm">
                Every round you sit through is a tree. Every one you walk out on is a stump.
              </p>
            </div>
            <LinkButton href="/grove" variant="outline" size="sm">
              <TreeDeciduous className="size-4" aria-hidden />
              Open
            </LinkButton>
          </div>
        </Card>
      )}

      {finished && !shortBlock && (
        <Card padding="lg" className="animate-rise">
          <p className="eyebrow">Finish the day</p>
          <div className="mt-4 space-y-2.5">
            {!targetComplete ? (
              <Button
                variant="outline"
                size="lg"
                fullWidth
                loading={pending}
                onClick={completeTarget}
              >
                Mark today&apos;s target complete
              </Button>
            ) : (
              <div className="rounded-panel bg-success/12 text-success-strong dark:text-success flex items-center gap-2.5 p-3.5 text-sm font-bold">
                <AnimatedCheck size={18} />
                Target complete
              </div>
            )}
            {quizId && (
              <LinkButton href={`/quiz/${quizId}`} variant="outline" size="lg" fullWidth>
                Take the 5-question knowledge check
              </LinkButton>
            )}
            <LinkButton
              href="/check-in"
              size="lg"
              fullWidth
              variant={checkedIn ? 'outline' : 'primary'}
            >
              {checkedIn ? 'Update your check-in' : 'Do your 60-second check-in'}
            </LinkButton>
          </div>
        </Card>
      )}

      {footer}
    </div>
  );
}
