'use client';

import type { ReactNode } from 'react';
import { Check, X } from 'lucide-react';

import { cn } from '@/lib/cn';
import type { CardType } from '@/lib/domain/flashcards';
import type { SessionCard } from '@/server/queries/flashcards';

/**
 * The two faces of a card, for all seven kinds of card.
 *
 * The rule this file exists to enforce: a card type changes *what is asked*, never *what a
 * card looks like*. Every front is an eyebrow, a prompt at one of two sizes, an optional
 * interactive region, and a hint at the foot; every back is a label, the answer, and an
 * optional key idea. Seven unrelated layouts would mean a student re-learning where to look
 * every time the deck changed type, which is a tax charged on exactly the wrong moment —
 * the two seconds where they are trying to remember something.
 *
 * So the differences are deliberately small and semantic: a cloze card draws a blank, a
 * choice card offers choices, an image card carries a picture. Everything else is shared.
 */

/** The label above the prompt. Says what kind of recall is being asked for. */
const TYPE_LABEL: Record<CardType, string> = {
  definition: 'Define',
  question: 'Question',
  cloze: 'Fill the blank',
  multiple_choice: 'Choose one',
  true_false: 'True or false',
  image: 'Identify',
  concept: 'Concept',
};

/** The hint at the foot of the front face. Tells the student what to do next. */
const TYPE_HINT: Record<CardType, string> = {
  definition: 'Tap to reveal the definition',
  question: 'Tap to reveal the answer',
  cloze: 'Tap to fill it in',
  multiple_choice: 'Pick the one you believe',
  true_false: 'Decide, then find out',
  image: 'Tap to reveal what this is',
  concept: 'Answer it in your head, then tap',
};

/**
 * The shell both faces sit in.
 *
 * `translateZ` on the content rather than a JS-driven offset: the card's parent is a
 * `preserve-3d` context, so lifting the content 40px toward the viewer makes it parallax
 * against the card's own surface for free whenever the card tilts. It is the real thing
 * rather than a simulation of it, and it costs one CSS property.
 */
function FaceShell({
  children,
  eyebrow,
  footer,
  className,
}: {
  children: ReactNode;
  eyebrow: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn('flex min-h-0 flex-auto flex-col p-6 sm:p-8', className)}
      style={{ transform: 'translateZ(40px)' }}
    >
      <div className="flex items-center justify-between gap-3">{eyebrow}</div>
      {/*
        `flex-auto`, emphatically not `flex-1`.

        The card is sized by its content now, and `flex-1` is `flex: 1 1 0%` — a zero basis,
        which paired with the `min-h-0` below tells the card that this region wants no height
        at all. The card then shrank to its floor and scrolled the question it was supposed
        to be showing. `flex-auto` grows and shrinks exactly the same way but bases itself on
        the content, so the card asks for the room the prompt actually needs.

        `min-h-0` and the overflow still matter for the one case that is left: a card that
        would exceed the ceiling has to shrink past its content, and scrolling is the honest
        fallback there. `justify-center-safe` rather than `justify-center` because centring
        an overflowing flex child overflows it in *both* directions — that is what put an
        eight-option question's prompt above the top edge of its own scroll container, out of
        reach of any scrollbar. The safe alignment gives up centring at exactly the point it
        would start hiding something. The scrollbar itself stays hidden for the reason the
        answer side hides its own.
      */}
      <div className="no-scrollbar flex min-h-0 flex-auto flex-col justify-center-safe overflow-y-auto overscroll-contain py-5">
        {children}
      </div>
      {footer && <div className="shrink-0">{footer}</div>}
    </div>
  );
}

function Eyebrow({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'accent' }) {
  return (
    <span className={cn('eyebrow', tone === 'accent' && 'text-pulse-600 dark:text-pulse-300')}>
      {children}
    </span>
  );
}

/**
 * Staggered entrance for the answer side.
 *
 * A CSS animation with a capped delay, matching `Reveal` — the content is in the DOM and
 * correct on the first frame, and the stagger only decorates the order in which the eye
 * arrives at it. An answer a student cannot read until an animation finishes is a worse
 * answer than one that simply appears.
 */
function Stagger({
  children,
  index,
  className,
}: {
  children: ReactNode;
  index: number;
  className?: string;
}) {
  return (
    <div
      className={cn('animate-rise', className)}
      style={{ animationDelay: `${Math.min(index * 60, 240)}ms` }}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ front */

export function CardFront({
  card,
  chosen,
  onChoose,
  disabled,
}: {
  card: SessionCard;
  /** The option a choice card's student has picked, or null. */
  chosen: number | null;
  onChoose: (index: number) => void;
  disabled?: boolean;
}) {
  const eyebrow = (
    <>
      <Eyebrow tone="accent">{TYPE_LABEL[card.type]}</Eyebrow>
      <MasteryTick mastery={card.state.mastery} />
    </>
  );

  const hint = (
    <p className="text-fg-subtle text-center text-xs font-semibold tracking-wide">
      {TYPE_HINT[card.type]}
    </p>
  );

  if (card.type === 'cloze') {
    return (
      <FaceShell eyebrow={eyebrow} footer={hint}>
        <ClozeSentence sentence={card.front} />
      </FaceShell>
    );
  }

  if (card.type === 'image') {
    return (
      <FaceShell eyebrow={eyebrow} footer={hint}>
        <div className="flex flex-col items-center gap-5">
          {card.imageUrl && (
            /*
             * A plain <img>, not next/image. The source is author-supplied and may point
             * anywhere, and an unconfigured remote host makes next/image throw at render —
             * which would take the whole session down over a picture. Sized by aspect ratio
             * so the card does not resize when it loads.
             */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={card.imageUrl}
              alt=""
              className="rounded-panel bg-bg-sunken max-h-44 w-full object-contain"
            />
          )}
          <p className="text-fg text-center text-xl font-bold text-balance sm:text-2xl">
            {card.front}
          </p>
        </div>
      </FaceShell>
    );
  }

  if (card.type === 'multiple_choice' || card.type === 'true_false') {
    return (
      <FaceShell eyebrow={eyebrow} footer={hint}>
        <p className="text-fg text-base font-bold text-balance sm:text-lg">{card.front}</p>
        <div
          role="radiogroup"
          aria-label={card.front}
          className={cn(
            'mt-4 gap-2',
            card.type === 'true_false' ? 'grid grid-cols-2' : 'flex flex-col',
          )}
        >
          {card.options.map((option, i) => (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={chosen === i}
              disabled={disabled}
              onClick={(e) => {
                // The card itself flips on click; a choice must not also flip it blindly.
                e.stopPropagation();
                onChoose(i);
              }}
              className={cn(
                'tap rounded-panel ease-out-soft flex items-center gap-3 border p-3 text-left transition-all duration-200',
                'focus-visible:outline-2',
                card.type === 'true_false' && 'justify-center py-6',
                chosen === i
                  ? 'border-pulse-500 bg-pulse-500/10 shadow-glow-pulse'
                  : 'border-border bg-bg-elevated hover:border-pulse-300 hover:shadow-soft hover:-translate-y-0.5 motion-reduce:hover:translate-y-0',
              )}
            >
              {card.type === 'multiple_choice' && (
                <span
                  className={cn(
                    'grid size-7 shrink-0 place-items-center rounded-lg text-xs font-bold transition-colors',
                    chosen === i
                      ? 'from-pulse-500 to-pulse-600 bg-linear-to-br text-white'
                      : 'bg-bg-sunken text-fg-subtle',
                  )}
                  aria-hidden
                >
                  {String.fromCharCode(65 + i)}
                </span>
              )}
              <span className="text-fg text-sm font-semibold">{option}</span>
            </button>
          ))}
        </div>
      </FaceShell>
    );
  }

  // definition, question, concept — a prompt and nothing else, at the size the length allows.
  return (
    <FaceShell eyebrow={eyebrow} footer={hint}>
      <p
        className={cn(
          'text-fg text-center font-extrabold tracking-tight text-balance',
          card.front.length > 90 ? 'text-xl sm:text-2xl' : 'text-2xl sm:text-3xl',
        )}
      >
        {card.front}
      </p>
    </FaceShell>
  );
}

/* ------------------------------------------------------------------- back */

export function CardBack({ card, chosen }: { card: SessionCard; chosen: number | null }) {
  const graded = card.correctOption !== null && chosen !== null;
  const right = graded && chosen === card.correctOption;

  return (
    <FaceShell
      eyebrow={
        <>
          <Eyebrow tone="accent">Answer</Eyebrow>
          {graded && (
            <span
              className={cn(
                'rounded-pill text-2xs inline-flex items-center gap-1.5 px-2.5 py-1 font-bold tracking-wider uppercase',
                right
                  ? 'bg-success/14 text-success-strong dark:text-success'
                  : 'bg-danger/12 text-danger-strong dark:text-danger',
              )}
            >
              {right ? (
                <Check className="size-3" strokeWidth={3} />
              ) : (
                <X className="size-3" strokeWidth={3} />
              )}
              {right ? 'You had it' : 'Not this time'}
            </span>
          )}
        </>
      }
    >
      {/*
        Scrollable, because a long explanation on a short window has to go somewhere and
        clipping an answer is not an option. `no-scrollbar` because a scrollbar track drawn
        down the side of the card breaks the illusion that it is a card — it still scrolls
        by wheel, touch and keyboard, it just does not draw furniture on top of the answer.
      */}
      <div className="no-scrollbar space-y-4 overflow-y-auto overscroll-contain">
        {/*
          The prompt is repeated small above the answer on every back face. Without it the
          card that arrives after a flip is a sentence with no question attached, and a
          student who took four seconds to think has to flip *back* to check what was asked.
        */}
        <Stagger index={0}>
          <p className="text-fg-subtle text-sm font-semibold">
            {card.type === 'cloze' ? 'The sentence reads' : card.front}
          </p>
        </Stagger>

        <Stagger index={1}>
          {card.type === 'cloze' ? (
            <ClozeSentence sentence={card.front} filled={card.back} />
          ) : (
            <p
              className={cn(
                'text-fg font-bold text-balance',
                card.back.length > 120 ? 'text-base sm:text-lg' : 'text-xl sm:text-2xl',
              )}
            >
              {card.back}
            </p>
          )}
        </Stagger>

        {card.explanation && (
          <Stagger index={2}>
            <div className="rounded-panel bg-bg-sunken border-border border p-4">
              <p className="eyebrow">Key idea</p>
              <p className="text-fg-muted mt-1.5 text-sm leading-relaxed">{card.explanation}</p>
            </div>
          </Stagger>
        )}

        {graded && !right && (
          <Stagger index={3}>
            <p className="text-fg-muted text-sm">
              You chose <span className="text-fg font-semibold">{card.options[chosen]}</span>.
            </p>
          </Stagger>
        )}
      </div>
    </FaceShell>
  );
}

/* --------------------------------------------------------------- fragments */

/**
 * A cloze sentence, with `___` rendered as a real gap.
 *
 * The blank is drawn from the marker in the sentence rather than stored separately, so the
 * front and the back can never disagree about where the gap is. When `filled` is given the
 * same component paints the answer *in place*, which is the whole trick: the student's eye
 * does not move, and the word simply arrives where the hole was.
 */
function ClozeSentence({ sentence, filled }: { sentence: string; filled?: string }) {
  const parts = sentence.split(/_{2,}/);

  return (
    <p className="text-fg text-center text-xl leading-relaxed font-bold text-balance sm:text-2xl">
      {parts.map((part, i) => (
        <span key={i}>
          {part}
          {i < parts.length - 1 &&
            (filled ? (
              <span className="from-citrus-400/45 to-citrus-300/25 text-fg dark:from-citrus-500/30 dark:to-citrus-400/15 mx-1 rounded-lg bg-linear-to-r px-2 py-0.5">
                {filled}
              </span>
            ) : (
              <span
                className="border-pulse-400/70 mx-1.5 inline-block w-24 border-b-[3px] align-middle sm:w-32"
                aria-label="blank"
              />
            ))}
        </span>
      ))}
    </p>
  );
}

/**
 * A one-glyph note of where this card stands.
 *
 * Deliberately tiny and unlabelled on the card face. It is context a student can choose to
 * notice — "ah, this is one I keep missing" — and never something competing with the
 * question. The session's own progress rail carries the readable version.
 */
function MasteryTick({ mastery }: { mastery: SessionCard['state']['mastery'] }) {
  if (mastery === 'new') return null;

  const meta = {
    learning: {
      label: 'Learning',
      className: 'bg-pulse-500/14 text-pulse-700 dark:text-pulse-300',
    },
    difficult: {
      label: 'Difficult',
      className: 'bg-flame-500/16 text-flame-700 dark:text-flame-300',
    },
    mastered: {
      label: 'Mastered',
      className: 'bg-success/14 text-success-strong dark:text-success',
    },
  }[mastery];

  return (
    <span
      className={cn(
        'rounded-pill text-2xs px-2 py-0.5 font-bold tracking-wider uppercase',
        meta.className,
      )}
    >
      {meta.label}
    </span>
  );
}
