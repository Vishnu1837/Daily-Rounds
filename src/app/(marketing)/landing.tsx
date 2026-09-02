import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Check, MessageCircle, Plus } from 'lucide-react';

import { InstagramIcon } from '@/components/brand/instagram-icon';
import { LogoMark } from '@/components/brand/logo';
import { SITE } from '@/lib/site';

import { RevealScript } from './reveal';
import { AttendanceGrid, HeroComposition, MonthArcs, RoadmapFragment } from './visuals';
import { WaitlistForm } from './waitlist-form';

/*
 * Section content stays as data at the top of the file rather than inline in the markup.
 * The copy is a deliverable in its own right — it gets revised without the layout changing —
 * and keeping it in one block means a wording edit never means reading JSX.
 *
 * Every claim below describes how the cohort is *structured*. There are no outcome
 * statistics anywhere on this page, invented or otherwise: a landing page number is a
 * promise the cohort then has to keep.
 */

/*
 * Fixed when the site is built rather than read from the clock on every render.
 *
 * The landing page is prerendered, and a value that can change between renders forces
 * the whole page to be rendered per request instead. A footer line is not worth giving
 * up a static marketing page for; a deploy in January refreshes it.
 */
const COPYRIGHT_YEAR = new Date().getFullYear();

const HERO_FACTS = [
  { value: 'Mon–Fri', label: 'Monitored study rooms' },
  { value: '19', label: 'MBBS subjects in the syllabus' },
  { value: '2', label: 'Subjects active at a time' },
  { value: '4', label: 'Focus sessions in the month' },
];

const PROBLEMS = [
  'Timetables that get made and then never followed.',
  'Notes, lectures and subscriptions that go unused.',
  'One inconsistent day quietly turning into a backlog.',
  'Knowing you should study, and not starting.',
  'Not being sure what to study next.',
];

const HOW_IT_WORKS = [
  {
    title: 'You pick two subjects',
    body: 'Onboarding turns your syllabus into a roadmap — real modules and topics, in teaching order.',
  },
  {
    title: 'You show up on weekdays',
    body: 'One focused hour in a monitored room, built to make showing up easier than not showing up.',
  },
  {
    title: 'Attendance is tracked',
    body: 'Not as surveillance. As the signal that tells someone when to check in on you.',
  },
  {
    title: 'Someone follows up',
    body: 'When your consistency starts slipping, that gets noticed and acted on within days.',
  },
  {
    title: 'Progress stays visible',
    body: 'Mark topics complete and watch subject progress move, instead of rebuilding a plan each week.',
  },
];

/*
 * `meta` is the functional descriptor in the middle of each row — the part of the product a
 * feature actually is, stated plainly next to the name it is sold under.
 */
const FEATURES = [
  {
    title: 'Mon–Fri study rooms',
    meta: 'Monitored sessions',
    body: 'One focused hour every weekday, in a room built to make starting easier.',
    featured: true,
  },
  {
    title: 'Personal accountability',
    meta: 'Attendance & follow-up',
    body: 'Participation is tracked, with follow-up when consistency starts slipping.',
  },
  {
    title: 'Syllabus-driven roadmap',
    meta: 'Two active subjects',
    body: 'Move through the real modules and topics of your MBBS syllabus in sequence.',
  },
  {
    title: 'Progress tracking',
    meta: 'Topic completion',
    body: 'Mark topics complete and see subject progress update as work is done.',
  },
  {
    title: 'Consistency leaderboard',
    meta: 'Cohort ranking',
    body: 'A light competitive layer that rewards turning up, not only test scores.',
  },
  {
    title: 'Study clarity',
    meta: 'Next-up queue',
    body: 'See what comes next instead of repeatedly rebuilding a study plan.',
  },
  {
    title: 'Peer community',
    meta: 'Cohort of medics',
    body: 'Study alongside students working on exactly the same consistency problem.',
  },
  {
    title: 'Four focus sessions',
    meta: 'Live workshops',
    body: 'LinkedIn, medical pathways, networking and productivity — beyond the study room.',
  },
];

const CAPABILITY_TAGS = [
  { label: 'Accountability', bg: 'var(--ed-blue)', ink: 'var(--ed-blue-ink)' },
  { label: 'Structure', bg: 'var(--ed-pink)', ink: 'var(--ed-pink-ink)' },
  { label: 'Visible progress', bg: 'var(--ed-mint)', ink: 'var(--ed-mint-ink)' },
  { label: 'Community', bg: 'var(--ed-yellow)', ink: 'var(--ed-yellow-ink)' },
];

const SESSIONS = [
  {
    title: 'LinkedIn for Medical Students',
    body: 'Practical use of LinkedIn early in a medical career: a credible profile, documenting your work, networking and finding opportunities.',
  },
  {
    title: 'Medical Pathways After MBBS',
    body: 'A high-level orientation to common postgraduate and licensing routes — India (FMGE / NExT for foreign medical graduates), UK, USA, Australia and the Gulf. Orientation, not an eligibility guarantee.',
  },
  {
    title: 'Networking Session',
    body: 'An interactive session for cohort members to get to know one another and share goals, challenges, experiences and resources.',
  },
  {
    title: 'Productivity & Learning',
    body: 'Realistic study blocks, reducing procrastination, active recall, spaced repetition, revision systems and habits that hold.',
  },
];

/** The cohort's logistics, as a definition list rather than a paragraph of prose. */
const SHAPE = [
  { term: 'Length', detail: '30 days' },
  { term: 'Study rooms', detail: 'Mon–Fri, 60 min' },
  { term: 'Active subjects', detail: '2 of 19' },
  { term: 'Live sessions', detail: '4' },
];

const OUTCOMES = [
  'A more structured study routine',
  'Better follow-through on what you plan',
  'Clearer direction on what to study next',
  'Progress you can actually see',
  'Practical learning and productivity methods',
  'Stronger connections with other medical students',
];

/** What sign-in actually opens onto — named, so the button is not a door with no label. */
const PORTAL = [
  'Your two-subject roadmap',
  'Daily check-in and streak',
  'Attendance and progress history',
  'The consistency leaderboard',
];

const FAQS = [
  {
    q: 'Is this another lecture platform?',
    a: 'No. Daily Rounds does not sell you content. It is a one-month guided accountability experience built around the notes, lectures and resources you already have.',
  },
  {
    q: 'How much time does it need?',
    a: 'One focused hour on weekdays in the study room, plus a short daily check-in. You set your own daily commitment during onboarding.',
  },
  {
    q: 'Which subjects can I work on?',
    a: 'Any of the 19 MBBS subjects. You keep two active at a time so your attention stays somewhere, and all 19 remain browseable in the syllabus.',
  },
  {
    q: 'What if I fall behind?',
    a: 'That is the point of the cohort. Attendance is tracked and you get followed up — falling behind is treated as a signal to act on, not a reason to drop out.',
  },
  {
    q: 'Do I need to be in a particular year?',
    a: 'No. Students across the MBBS years take part, and the roadmap follows whichever subjects you are actually studying.',
  },
  {
    q: 'Will this guarantee better marks?',
    a: 'No, and we will not claim it does. It is built to make consistent study easier to sustain. What that turns into is your work.',
  },
];

const NAV_LINKS = [
  { href: '#about', label: 'About' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#features', label: 'Features' },
  { href: '#sessions', label: 'Sessions' },
];

/* ===================================================================== page */

export function LandingPage() {
  return (
    <div className="ed" data-reveal-root>
      <RevealScript />

      <main id="main">
        <Hero />
        <Problem />
        <HowItWorks />
        <TheMonth />
        <Capabilities />
        <DarkPassage />
        <Community />
        <Access />
        <Faq />
      </main>

      <SiteFooter />
    </div>
  );
}

/* ===================================================================== hero */

/**
 * One oversized field panel carrying its own navigation.
 *
 * The header is inside the card rather than above it, which is the single decision the rest
 * of the page hangs off: it makes the first screen read as one composed object — a cover —
 * instead of a chrome bar sitting on top of a hero.
 */
function Hero() {
  return (
    <section className="ed-shell pt-3 sm:pt-5">
      <div
        className="ed-panel ed-reveal relative overflow-hidden px-5 pt-5 pb-12 sm:px-8 sm:pt-6 sm:pb-16 lg:px-12 lg:pb-20"
        style={{ borderRadius: 'var(--ed-r-hero)' }}
      >
        <SiteNav />

        <div className="mt-14 grid items-center gap-14 lg:mt-24 lg:grid-cols-[1.12fr_0.88fr] lg:gap-10">
          <div>
            <p className="ed-label">30-day cohort · {SITE.tagline}</p>

            {/* Four short lines, broken by hand. At this size the wrap is composition,
                not a consequence of the column width — and the emphasis alternates so the
                two verbs carry the statement and the two objects recede. */}
            <h1 className="ed-display mt-5">
              Stop collecting
              <br />
              <span className="ed-faint">study plans.</span>
              <br />
              Start showing
              <br />
              <span className="ed-faint">up for one.</span>
            </h1>

            <p className="ed-body mt-7 max-w-[52ch]">
              A 30-day accountability system for medical students. Monitored weekday study rooms, a
              roadmap built from your real MBBS syllabus, tracked attendance and personal follow-up
              — so consistency stops depending on motivation.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <a href="#waitlist" className="ed-btn ed-btn-solid">
                {SITE.waitlistCta}
                <ArrowRight className="size-4" aria-hidden />
              </a>
              <Link href="/login" className="ed-btn ed-btn-quiet">
                {SITE.enterCohortCta}
              </Link>
            </div>

            <p className="mt-4 text-[12px]" style={{ color: 'var(--ed-faint)' }}>
              Already enrolled? {SITE.enterCohortCta} takes you straight to your dashboard.
            </p>
          </div>

          {/* Extra right padding on desktop: the composition kicks its own fragments out
              past its box, and it needs room to do that without touching the panel edge. */}
          <div className="pr-0 pb-8 lg:pr-6 lg:pb-0">
            <HeroComposition />
          </div>
        </div>

        {/* The four structural facts, set as a rule across the foot of the panel. */}
        <ul
          className="mt-14 grid grid-cols-2 gap-x-6 gap-y-8 border-t pt-8 lg:mt-20 lg:grid-cols-4"
          style={{ borderColor: 'var(--ed-line-strong)' }}
        >
          {HERO_FACTS.map(({ value, label }) => (
            <li key={label}>
              <p className="text-[26px] font-medium tracking-[-0.035em] sm:text-[30px]">{value}</p>
              <p className="mt-1.5 text-[12px] leading-snug" style={{ color: 'var(--ed-muted)' }}>
                {label}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function SiteNav() {
  return (
    <nav className="flex items-center gap-2" aria-label="Primary">
      <Link href="/" className="flex items-center gap-2.5 pr-1" aria-label={SITE.lockup}>
        <span
          className="grid size-8 place-items-center overflow-hidden rounded-full"
          style={{ background: 'var(--ed-ink)' }}
        >
          <LogoMark size={19} className="[&_rect]:fill-none" />
        </span>
        <span className="text-[15px] font-medium tracking-[-0.03em]">{SITE.name}</span>
      </Link>

      <ul className="ml-3 hidden items-center gap-1 md:flex">
        {NAV_LINKS.map((link) => (
          <li key={link.href}>
            <a href={link.href} className="ed-navlink inline-block">
              {link.label}
            </a>
          </li>
        ))}
      </ul>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <Link href="/login" className="ed-navlink hidden sm:inline-block">
          {SITE.enterCohortCta}
        </Link>
        <a href="#waitlist" className="ed-btn ed-btn-solid ed-btn-sm">
          {SITE.waitlistCta}
        </a>
      </div>
    </nav>
  );
}

/* ================================================================== problem */

function Problem() {
  return (
    <Section id="about">
      <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
        <div className="ed-reveal">
          <p className="ed-label">The problem</p>
          <h2 className="ed-h2 mt-4 max-w-[11ch]">
            It is usually not <span className="ed-faint">an access problem.</span>
          </h2>
          <p className="ed-body mt-6 max-w-[38ch]">
            Most medical students already have good notes, good lectures and at least one
            subscription they are not using. What is missing is structure, and someone noticing when
            they stop.
          </p>

          <div
            className="mt-10 rounded-[var(--ed-r-card)] border p-6"
            style={{ borderColor: 'var(--ed-line)', background: 'var(--ed-surface)' }}
          >
            <p className="text-[17px] leading-snug font-medium tracking-[-0.025em]">
              Not another lecture platform.
            </p>
            <p className="ed-body mt-2.5 text-[14px]">
              There is no video library here and nothing to binge. If more content were the answer,
              the problem would already be solved.
            </p>
          </div>
        </div>

        <ul className="ed-reveal" style={{ '--ed-delay': '90ms' } as React.CSSProperties}>
          {PROBLEMS.map((problem, i) => (
            <li
              key={problem}
              className="flex items-baseline gap-6 border-b py-5 first:border-t"
              style={{ borderColor: 'var(--ed-line)' }}
            >
              <span
                className="w-6 shrink-0 text-[12px] tabular-nums"
                style={{ color: 'var(--ed-faint)' }}
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="text-[15px] leading-snug tracking-[-0.015em] sm:text-[17px]">
                {problem}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

/* ============================================================= how it works */

/**
 * The bento. Deliberately irregular: a tall product fragment, a numbered walkthrough, one
 * accent tile and an attendance card, on a grid whose columns do not divide evenly. A
 * three-across row of equal cards would say "template" before a visitor read a word of it.
 */
function HowItWorks() {
  return (
    <Section id="how-it-works">
      <div className="ed-reveal">
        <p className="ed-label">How the month works</p>
        <h2 className="ed-h2 mt-4 max-w-[24ch]">
          Five moving parts, <span className="ed-faint">running every weekday.</span>
        </h2>
      </div>

      <div
        className="ed-reveal mt-12 grid gap-4 lg:grid-cols-3 lg:grid-rows-[auto_auto]"
        style={{ '--ed-delay': '80ms' } as React.CSSProperties}
      >
        {/* Tall — the roadmap, cropped as an artifact rather than framed as a screenshot. */}
        <article className="ed-card flex flex-col overflow-hidden p-6 sm:p-7 lg:row-span-2">
          <p className="ed-label">Your roadmap</p>
          <h3 className="ed-h3 mt-3 max-w-[16ch]">Two subjects active. Seventeen waiting.</h3>
          <p className="ed-body mt-3 text-[14px]">
            Attention has to be somewhere. Keeping two subjects live is the constraint that stops a
            roadmap turning back into a wish list.
          </p>

          {/* Bled into the card's bottom-right corner rather than inset with a margin:
              a cropped artifact, the way a photograph runs off the edge of a page. */}
          <div
            className="mt-7 -mr-6 -mb-6 flex-1 rounded-tl-[var(--ed-r-card)] py-5 pr-6 pl-4 sm:-mr-7 sm:-mb-7 sm:pr-7"
            style={{ background: 'var(--ed-field)' }}
          >
            <RoadmapFragment />
          </div>
        </article>

        {/* Wide — the walkthrough, as compact numbered points. */}
        <article className="ed-card p-6 sm:p-7 lg:col-span-2">
          <ol className="grid gap-x-10 gap-y-5 sm:grid-cols-2">
            {HOW_IT_WORKS.map(({ title, body }, i) => (
              <li key={title} className="flex gap-4">
                <span
                  className="mt-0.5 text-[12px] tabular-nums"
                  style={{ color: 'var(--ed-accent)' }}
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div>
                  <p className="text-[14px] font-medium tracking-[-0.02em]">{title}</p>
                  <p className="ed-body mt-1 text-[13px]">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </article>

        {/* The one saturated tile on the light half of the page. */}
        <article
          className="flex flex-col justify-between p-6 sm:p-7"
          style={{
            background: 'var(--ed-accent)',
            color: '#fff',
            borderRadius: 'var(--ed-r-card)',
          }}
        >
          <p className="text-[12px]" style={{ color: 'rgba(255,255,255,0.72)' }}>
            Daily commitment
          </p>
          <div className="mt-10">
            <p className="text-[64px] leading-[0.85] font-medium tracking-[-0.05em]">60</p>
            <p className="mt-3 text-[13px] leading-snug" style={{ color: 'rgba(255,255,255,0.8)' }}>
              Minutes a day, five days a week. Set your own during onboarding — this is the shape
              most students hold.
            </p>
          </div>
        </article>

        {/* The attendance grid — twenty weekday marks, no axes, no legend. */}
        <article className="ed-card p-6 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="ed-label">Attendance</p>
              <h3 className="mt-2 text-[17px] font-medium tracking-[-0.025em]">
                Twenty weekdays, marked
              </h3>
            </div>
            <span
              className="ed-tag"
              style={{ background: 'var(--ed-mint)', color: 'var(--ed-mint-ink)' }}
            >
              Tracked
            </span>
          </div>
          <div className="mt-6 max-w-[240px]">
            <AttendanceGrid />
          </div>
          <p className="ed-body mt-5 text-[13px]">
            A gap is not a failure. It is the thing that triggers a message.
          </p>
        </article>
      </div>
    </Section>
  );
}

/* ================================================================ the month */

/**
 * The impact card.
 *
 * The arcs describe the month's structure — five rooms a week, compounding to twenty — and
 * the metric under them is that same number, not a claimed result. Storytelling with a
 * chart is fine; storytelling with a statistic nobody measured is not.
 */
function TheMonth() {
  return (
    <Section>
      <div className="ed-reveal ed-panel grid gap-12 p-7 sm:p-10 lg:grid-cols-[1fr_1.05fr] lg:items-end lg:gap-8 lg:p-14">
        <div>
          <p className="ed-h3 max-w-[19ch] text-balance">
            <LogoMark size={20} className="mr-2 inline-block -translate-y-0.5 align-middle" />
            <span className="ed-faint">The month is</span> not built on motivation.{' '}
            <span className="ed-faint">It is built on</span> a schedule you did not have to design.
          </p>

          <div className="mt-14 lg:mt-24">
            <p className="ed-metric">20</p>
            <p className="ed-body mt-5 max-w-[30ch] text-[14px]">
              Monitored study sessions across the cohort — five weekday rooms a week, for four
              weeks, with attendance and follow-up on every one.
            </p>
          </div>
        </div>

        <div className="relative">
          <MonthArcs />

          {/* Two small notifications, the way they would arrive in the product. */}
          <div className="absolute top-0 right-0 w-[210px] max-w-[62%] space-y-2.5">
            <FloatingNote
              tint="var(--ed-blue)"
              ink="var(--ed-blue-ink)"
              mark="R"
              title="Room opens 6:00 pm"
              meta="Mon–Fri · 60 minutes"
            />
            <FloatingNote
              tint="var(--ed-yellow)"
              ink="var(--ed-yellow-ink)"
              mark="F"
              title="Missed two in a row"
              meta="Follow-up sent"
            />
            <div
              className="flex items-center justify-between rounded-2xl px-4 py-3"
              style={{ background: 'var(--ed-accent)', color: '#fff' }}
            >
              <span className="text-[12px]" style={{ color: 'rgba(255,255,255,0.75)' }}>
                Full month
              </span>
              <span className="text-[15px] font-medium tabular-nums">20 / 20</span>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

function FloatingNote({
  tint,
  ink,
  mark,
  title,
  meta,
}: {
  tint: string;
  ink: string;
  mark: string;
  title: string;
  meta: string;
}) {
  return (
    <div
      className="flex items-center gap-3 rounded-2xl px-3 py-2.5"
      style={{ background: 'var(--ed-surface)', boxShadow: 'var(--ed-shadow)' }}
    >
      <span
        className="grid size-7 shrink-0 place-items-center rounded-full text-[12px] font-medium"
        style={{ background: tint, color: ink }}
        aria-hidden
      >
        {mark}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[12px] font-medium tracking-[-0.01em]">{title}</span>
        <span className="block truncate text-[11px]" style={{ color: 'var(--ed-muted)' }}>
          {meta}
        </span>
      </span>
    </div>
  );
}

/* ============================================================= capabilities */

function Capabilities() {
  return (
    <Section id="features">
      <div className="ed-reveal mx-auto max-w-[680px] text-center">
        <h2 className="ed-h2">
          Everything in the cohort, <span className="ed-faint">in one list.</span>
        </h2>
      </div>

      <div
        className="ed-reveal mt-7 flex flex-wrap justify-center gap-2"
        style={{ '--ed-delay': '60ms' } as React.CSSProperties}
      >
        {CAPABILITY_TAGS.map(({ label, bg, ink }) => (
          <span key={label} className="ed-tag" style={{ background: bg, color: ink }}>
            {label}
          </span>
        ))}
      </div>

      <ul
        className="ed-reveal mx-auto mt-12 max-w-[1120px] space-y-3"
        style={{ '--ed-delay': '120ms' } as React.CSSProperties}
      >
        {FEATURES.map(({ title, meta, body, featured }) => (
          <li key={title} className="ed-row" data-active={featured ? 'true' : undefined}>
            <Check className="ed-row-tick size-[18px]" strokeWidth={2.2} aria-hidden />
            <span className="ed-row-name">{title}</span>
            <span className="ed-row-meta">{meta}</span>
            <p className="ed-row-copy">{body}</p>
            <span className="ed-row-arrow" aria-hidden>
              <ArrowUpRight className="size-4" strokeWidth={1.8} />
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/* =========================================================== dark passage */

/**
 * The page's one high-contrast passage.
 *
 * It arrives late on purpose. Everything above is paper; dropping to near-black here resets
 * the eye, and gives the founder's own account of why this exists somewhere to sit that is
 * not just another white card in a stack of white cards.
 */
function DarkPassage() {
  return (
    <section id="sessions" className="ed-dark-scope mt-16 sm:mt-24 lg:mt-32">
      <div className="ed-shell py-20 sm:py-28 lg:py-36">
        <h2 className="ed-reveal ed-h2 max-w-[18ch]" style={{ color: '#fff' }}>
          The study room is the spine. <span className="ed-gradient-text">Four live sessions</span>{' '}
          are the rest of the month.
        </h2>

        <div
          className="ed-reveal mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-12"
          style={{ '--ed-delay': '80ms' } as React.CSSProperties}
        >
          {/* Founder statement — the tall card that anchors the masonry. */}
          <article className="ed-dark-card flex flex-col justify-between p-7 lg:col-span-5 lg:row-span-2">
            <div>
              <p className="text-[12px]" style={{ color: 'var(--ed-dark-faint)' }}>
                The founder
              </p>
              <p className="mt-6 text-[19px] leading-[1.45] tracking-[-0.02em]">
                “The gap is rarely access to content. It is structure and accountability — so I
                built a system around the studying, rather than more material to study.”
              </p>
            </div>

            <div className="mt-10 flex items-center gap-4">
              {SITE.founderPhotoUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element -- remote URL from config, not a bundled asset */
                <img
                  src={SITE.founderPhotoUrl}
                  alt={SITE.founder}
                  className="size-12 rounded-full object-cover"
                />
              ) : (
                <span
                  className="grid size-12 place-items-center rounded-full text-[15px] font-medium"
                  style={{ background: 'var(--ed-char-lift)', color: '#fff' }}
                  aria-hidden
                >
                  MI
                </span>
              )}
              <div className="min-w-0">
                <p className="text-[14px] font-medium">{SITE.founder}</p>
                <p className="text-[12px]" style={{ color: 'var(--ed-dark-muted)' }}>
                  Medical student &amp; medical-education creator
                </p>
              </div>
              <a
                href={SITE.instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto grid size-10 shrink-0 place-items-center rounded-full border transition-colors hover:bg-white hover:text-black"
                style={{ borderColor: 'var(--ed-dark-line)' }}
                aria-label={`${SITE.founder} on Instagram, ${SITE.instagramHandle}`}
              >
                <InstagramIcon className="size-4" />
              </a>
            </div>
          </article>

          {/* The four sessions, in an irregular pair of columns. */}
          {SESSIONS.map((session, i) => (
            <article
              key={session.title}
              className={`ed-dark-card p-7 ${i % 3 === 0 ? 'lg:col-span-4' : 'lg:col-span-3'}`}
            >
              <span className="text-[12px] tabular-nums" style={{ color: 'var(--ed-dark-faint)' }}>
                Session {String(i + 1).padStart(2, '0')}
              </span>
              <h3 className="mt-3 text-[17px] leading-snug font-medium tracking-[-0.025em]">
                {session.title}
              </h3>
              <p
                className="mt-3 text-[13px] leading-relaxed"
                style={{ color: 'var(--ed-dark-muted)' }}
              >
                {session.body}
              </p>
            </article>
          ))}

          {/* The logistics, stated plainly. It also squares off the masonry's last row —
              an outcomes card alone leaves five empty columns beside it. */}
          <article className="ed-dark-card p-7 lg:col-span-5">
            <p className="text-[12px]" style={{ color: 'var(--ed-dark-faint)' }}>
              The shape of it
            </p>
            <dl className="mt-5 space-y-3.5">
              {SHAPE.map(({ term, detail }) => (
                <div
                  key={term}
                  className="flex items-baseline justify-between gap-6 border-b pb-3.5 last:border-0 last:pb-0"
                  style={{ borderColor: 'var(--ed-dark-line)' }}
                >
                  <dt className="text-[13px]" style={{ color: 'var(--ed-dark-muted)' }}>
                    {term}
                  </dt>
                  <dd className="text-right text-[14px] font-medium">{detail}</dd>
                </div>
              ))}
            </dl>
          </article>

          {/* Outcomes — stated as intent, with the disclaimer attached rather than buried. */}
          <article className="ed-dark-card p-7 lg:col-span-7">
            <p className="text-[12px]" style={{ color: 'var(--ed-dark-faint)' }}>
              What a month here is meant to leave you with
            </p>
            <ul className="mt-5 flex flex-wrap gap-2">
              {OUTCOMES.map((outcome) => (
                <li
                  key={outcome}
                  className="rounded-full border px-3.5 py-2 text-[13px]"
                  style={{ borderColor: 'var(--ed-dark-line)', color: '#e9e9e9' }}
                >
                  {outcome}
                </li>
              ))}
            </ul>
            <p
              className="mt-6 text-[12px] leading-relaxed"
              style={{ color: 'var(--ed-dark-faint)' }}
            >
              Daily Rounds is a study-habit system, not a coaching guarantee. It does not promise
              exam results, and the pathways session is orientation rather than eligibility advice.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}

/* ================================================================ community */

const POSTERS = [
  { text: 'Show up.', meta: 'Mon–Fri', bg: '#d9f24a', ink: '#141a00' },
  { text: 'No new notes required.', meta: 'Bring your own', bg: '#e6dcff', ink: '#241452' },
  { text: '30 days.', meta: 'One cohort', bg: '#ffd9e7', ink: '#4a0f27' },
  { text: 'Done beats perfect.', meta: 'Every weekday', bg: '#c9f0d8', ink: '#06301b' },
];

/**
 * The only loud thing on the page, and it is fenced into four tiles.
 *
 * This is where the cohort's own voice lives — the tone of the Instagram it comes from —
 * and it earns the colour by being contained. It appears exactly once, after the dark
 * passage has already reset the eye, and nothing else on the site borrows from it.
 */
function Community() {
  return (
    <Section>
      <div className="ed-reveal flex flex-wrap items-end justify-between gap-6">
        <div className="flex-1 basis-[420px]">
          <p className="ed-label">The community</p>
          <h2 className="ed-h2 mt-4 max-w-[15ch]">
            Built in public, <span className="ed-faint">one round at a time.</span>
          </h2>
        </div>
        <a
          href={SITE.instagramUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ed-btn ed-btn-quiet"
        >
          <InstagramIcon className="size-4" />
          {SITE.instagramHandle}
        </a>
      </div>

      <div
        className="ed-reveal mt-10 grid grid-cols-2 gap-3 lg:grid-cols-4"
        style={{ '--ed-delay': '80ms' } as React.CSSProperties}
      >
        {POSTERS.map(({ text, meta, bg, ink }) => (
          <div
            key={text}
            className="flex aspect-square flex-col justify-between p-5 sm:p-6"
            style={{ background: bg, color: ink, borderRadius: 'var(--ed-r-card)' }}
          >
            <span className="text-[11px] font-medium opacity-70">{meta}</span>
            <span className="text-[26px] leading-[0.95] font-semibold tracking-[-0.04em] sm:text-[32px]">
              {text}
            </span>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* =================================================================== access */

function Access() {
  return (
    <Section id="waitlist">
      <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        {/* Waitlist — the primary route in, so it gets the paper and the space. */}
        <div className="ed-reveal ed-card p-7 sm:p-10">
          <p className="ed-label">Cohort access</p>
          <h2 className="ed-h2 mt-4 max-w-[13ch]">
            Join <span className="ed-faint">{SITE.nextCohortLabel}.</span>
          </h2>
          <p className="ed-body mt-5 max-w-[42ch] text-[14px]">
            Leave your details and we will send you the dates and joining information for the next
            intake.
          </p>
          <WaitlistForm />
        </div>

        {/* Returning members and direct enquiries. */}
        <div
          className="ed-reveal flex flex-col gap-4"
          style={{ '--ed-delay': '90ms' } as React.CSSProperties}
        >
          <div
            className="flex flex-1 flex-col justify-between p-7 sm:p-9"
            style={{
              background: 'var(--ed-ink)',
              color: '#fff',
              borderRadius: 'var(--ed-r-card)',
            }}
          >
            <div>
              <span
                className="grid size-10 place-items-center rounded-full"
                style={{ background: 'rgba(255,255,255,0.1)' }}
              >
                <LogoMark size={20} />
              </span>
              <h3 className="ed-h3 mt-6 max-w-[14ch]" style={{ color: '#fff' }}>
                Already in {SITE.cohortLabel}
              </h3>
              <p
                className="mt-3 max-w-[36ch] text-[14px] leading-relaxed"
                style={{ color: 'rgba(255,255,255,0.66)' }}
              >
                Sign in to reach your dashboard, roadmap, daily check-in and the rest of the cohort
                portal.
              </p>

              <ul className="mt-8 space-y-3">
                {PORTAL.map((item) => (
                  <li
                    key={item}
                    className="flex items-center gap-3 border-b pb-3 text-[13px] last:border-0"
                    style={{
                      borderColor: 'rgba(255,255,255,0.09)',
                      color: 'rgba(255,255,255,0.78)',
                    }}
                  >
                    <span
                      className="size-1 rounded-full"
                      style={{ background: 'var(--ed-accent-lift)' }}
                      aria-hidden
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <Link href="/login" className="ed-btn ed-btn-invert mt-9 w-full">
              {SITE.enterCohortCta}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>

          {SITE.whatsappUrl && (
            <a
              href={SITE.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ed-card flex items-center gap-4 p-6 transition-colors hover:border-[var(--ed-line-strong)]"
            >
              <span
                className="grid size-10 shrink-0 place-items-center rounded-full"
                style={{ background: 'var(--ed-mint)', color: 'var(--ed-mint-ink)' }}
              >
                <MessageCircle className="size-[18px]" aria-hidden />
              </span>
              <span>
                <span className="block text-[14px] font-medium tracking-[-0.02em]">
                  Ask before you commit
                </span>
                <span className="block text-[13px]" style={{ color: 'var(--ed-muted)' }}>
                  Message us on WhatsApp
                </span>
              </span>
              <ArrowUpRight
                className="ml-auto size-4 shrink-0"
                style={{ color: 'var(--ed-muted)' }}
                aria-hidden
              />
            </a>
          )}
        </div>
      </div>
    </Section>
  );
}

/* ====================================================================== faq */

function Faq() {
  return (
    <Section>
      <div className="grid gap-10 lg:grid-cols-[0.75fr_1.25fr] lg:gap-20">
        <div className="ed-reveal">
          <p className="ed-label">FAQ</p>
          <h2 className="ed-h2 mt-4 max-w-[11ch]">
            The questions <span className="ed-faint">we actually get.</span>
          </h2>
        </div>

        <div className="ed-reveal" style={{ '--ed-delay': '80ms' } as React.CSSProperties}>
          {FAQS.map((faq) => (
            <details key={faq.q} className="ed-faq">
              <summary>
                {faq.q}
                <Plus className="ed-faq-sign size-4" strokeWidth={1.8} aria-hidden />
              </summary>
              <p className="ed-body max-w-[62ch] pr-8 pb-6 text-[14px]">{faq.a}</p>
            </details>
          ))}
        </div>
      </div>
    </Section>
  );
}

/* =================================================================== footer */

function SiteFooter() {
  return (
    <footer className="ed-shell pt-8 pb-4">
      <div
        className="ed-panel overflow-hidden px-7 pt-12 pb-8 sm:px-10 lg:px-14"
        style={{ borderRadius: 'var(--ed-r-hero)' }}
      >
        <div className="flex flex-wrap items-start justify-between gap-10">
          <div>
            <span className="flex items-center gap-2.5">
              <span
                className="grid size-8 place-items-center rounded-full"
                style={{ background: 'var(--ed-ink)' }}
              >
                <LogoMark size={19} className="[&_rect]:fill-none" />
              </span>
              <span className="text-[15px] font-medium tracking-[-0.03em]">{SITE.name}</span>
            </span>
            <p className="ed-body mt-4 max-w-[30ch] text-[13px]">
              {SITE.lockup} · {SITE.tagline}
            </p>
          </div>

          <nav className="flex flex-wrap gap-x-10 gap-y-8" aria-label="Footer">
            <div>
              <p className="text-[12px]" style={{ color: 'var(--ed-faint)' }}>
                The cohort
              </p>
              <ul className="mt-3 space-y-2">
                {NAV_LINKS.map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      className="text-[13px] transition-colors hover:text-[var(--ed-accent)]"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="text-[12px]" style={{ color: 'var(--ed-faint)' }}>
                Get in
              </p>
              <ul className="mt-3 space-y-2">
                <li>
                  <a
                    href="#waitlist"
                    className="text-[13px] transition-colors hover:text-[var(--ed-accent)]"
                  >
                    {SITE.waitlistCta}
                  </a>
                </li>
                <li>
                  <Link
                    href="/login"
                    className="text-[13px] transition-colors hover:text-[var(--ed-accent)]"
                  >
                    {SITE.enterCohortCta}
                  </Link>
                </li>
                <li>
                  <a
                    href={SITE.instagramUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[13px] transition-colors hover:text-[var(--ed-accent)]"
                  >
                    <InstagramIcon className="size-3.5" />
                    {SITE.instagramHandle}
                  </a>
                </li>
                {SITE.whatsappUrl && (
                  <li>
                    <a
                      href={SITE.whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-[13px] transition-colors hover:text-[var(--ed-accent)]"
                    >
                      <MessageCircle className="size-3.5" aria-hidden />
                      WhatsApp
                    </a>
                  </li>
                )}
              </ul>
            </div>
          </nav>
        </div>

        {/* The wordmark, set as a rule at the foot of the page rather than as a logo. */}
        <p
          className="mt-16 leading-[0.8] font-medium tracking-[-0.05em] select-none"
          style={{ fontSize: 'clamp(3rem, 12vw, 11rem)', color: 'var(--ed-line-strong)' }}
          aria-hidden
        >
          Daily Rounds
        </p>

        <p className="mt-6 text-[12px]" style={{ color: 'var(--ed-faint)' }}>
          © {COPYRIGHT_YEAR} {SITE.name}. Built by {SITE.founder}.
        </p>
      </div>
    </footer>
  );
}

/* ==================================================================== shell */

/**
 * The vertical rhythm of the whole page: a large pause between sections, and no rules or
 * bands between them. Separation is done with space and with surface changes, never with a
 * horizontal line — a page of full-width divider lines reads as a document, not a cover.
 */
function Section({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="ed-shell scroll-mt-6 py-16 sm:py-24 lg:py-32">
      {children}
    </section>
  );
}
