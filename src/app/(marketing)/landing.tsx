import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  CalendarCheck,
  CheckCircle2,
  Compass,
  LineChart,
  ListChecks,
  MessageCircle,
  Trophy,
  UserCheck,
  Users,
} from 'lucide-react';

import { InstagramIcon } from '@/components/brand/instagram-icon';
import { Logo, LogoMark } from '@/components/brand/logo';
import { Badge } from '@/components/ui/badge';
import { LinkButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SITE } from '@/lib/site';

import { WaitlistForm } from './waitlist-form';

/*
 * Section content lives as data at the top of the file rather than inline in the markup.
 * The brief treats this copy as the deliverable — it will be revised without the layout
 * changing — and keeping it in one block means a copy edit never means reading JSX.
 */

const PROBLEMS = [
  'Timetables that get made and then never followed.',
  'Notes, lectures and subscriptions that go unused.',
  'One inconsistent day quietly turning into a backlog.',
  'Knowing you should study, and not starting.',
  'Not being sure what to study next.',
];

const HOW_IT_WORKS = [
  {
    icon: CalendarCheck,
    title: 'Monitored weekday study rooms',
    body: 'One focused hour every weekday, in a room built to make showing up easier than not showing up.',
  },
  {
    icon: UserCheck,
    title: 'Attendance and follow-up',
    body: 'Showing up is tracked, and someone actually follows up when your consistency starts slipping.',
  },
  {
    icon: ListChecks,
    title: 'A roadmap from your syllabus',
    body: 'Two active MBBS subjects, broken into their real modules and topics in teaching order.',
  },
  {
    icon: LineChart,
    title: 'Progress you can see',
    body: 'Mark topics complete and watch subject progress move. No rebuilding the plan every week.',
  },
  {
    icon: Trophy,
    title: 'A consistency leaderboard',
    body: 'A light competitive layer that rewards turning up and following through, not just test scores.',
  },
  {
    icon: Users,
    title: 'Peers in the same fight',
    body: 'Study alongside medical students working on exactly the same consistency problem.',
  },
];

const FEATURES = [
  {
    title: 'Mon–Fri study rooms',
    body: 'One focused hour every weekday in a monitored environment built to make showing up easier.',
  },
  {
    title: 'Personal accountability',
    body: 'Attendance and participation are tracked, with follow-up when consistency starts slipping.',
  },
  {
    title: 'Syllabus-driven roadmap',
    body: 'Choose up to two active MBBS subjects and move through their syllabus in a clear sequence.',
  },
  {
    title: 'Progress tracking',
    body: 'Mark topics complete and see subject progress update as work is completed.',
  },
  {
    title: 'Consistency leaderboard',
    body: 'A light competitive layer that rewards participation and follow-through rather than only test scores.',
  },
  {
    title: 'Study clarity',
    body: 'See what comes next instead of repeatedly rebuilding a study plan.',
  },
  {
    title: 'Peer community',
    body: 'Study alongside medical students working on the same consistency problem.',
  },
  {
    title: 'Four focus sessions',
    body: 'LinkedIn, medical pathways, networking and productivity — beyond the study room.',
  },
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

const OUTCOMES = [
  'A more structured study routine',
  'Better follow-through on what you plan',
  'Clearer direction on what to study next',
  'Progress you can actually see',
  'Practical learning and productivity methods',
  'Stronger connections with other medical students',
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

export function LandingPage() {
  return (
    <>
      <SiteNav />

      <main id="main">
        <Hero />
        <Problem />
        <WhatItIs />
        <HowTheMonthWorks />
        <InsideTheSoftware />
        <Features />
        <FocusSessions />
        <Outcomes />
        <Founder />
        <CohortAccess />
        <Faq />
      </main>

      <SiteFooter />
    </>
  );
}

/* ------------------------------------------------------------------- nav */

const NAV_LINKS = [
  { href: '#about', label: 'About' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#features', label: 'Features' },
  { href: '#sessions', label: 'Sessions' },
];

function SiteNav() {
  return (
    <header className="border-border bg-bg/85 sticky top-0 z-50 border-b backdrop-blur-xl">
      <nav className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5" aria-label="Primary">
        <Link href="/" className="flex items-center gap-2.5" aria-label={SITE.lockup}>
          <Logo size={30} />
          <span className="text-fg-subtle hidden text-xs font-semibold sm:inline">
            by {SITE.founder}
          </span>
        </Link>

        <ul className="ml-auto hidden items-center gap-6 lg:flex">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="text-fg-muted hover:text-fg text-sm font-semibold transition-colors"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <LinkButton href="/login" variant="ghost" size="sm">
            {SITE.enterCohortCta}
          </LinkButton>
          <LinkButton href="#waitlist" size="sm">
            {SITE.waitlistCta}
          </LinkButton>
        </div>
      </nav>
    </header>
  );
}

/* ------------------------------------------------------------------ hero */

function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* A single soft wash rather than decorative medical imagery. */}
      <div
        className="from-pulse-500/10 via-iris-500/5 pointer-events-none absolute inset-0 bg-linear-to-br to-transparent"
        aria-hidden
      />
      <div className="relative mx-auto max-w-6xl px-5 py-20 sm:py-28">
        <Badge tone="iris">30-day cohort · {SITE.tagline}</Badge>

        <h1 className="font-display text-fg mt-6 max-w-3xl text-4xl leading-[1.05] font-extrabold tracking-[-0.03em] text-balance sm:text-5xl lg:text-6xl">
          Stop collecting study plans.{' '}
          <span className="from-pulse-600 to-iris-500 dark:from-pulse-300 dark:to-iris-300 bg-linear-to-r bg-clip-text text-transparent">
            Start showing up for one.
          </span>
        </h1>

        <p className="text-fg-muted mt-6 max-w-2xl text-lg leading-relaxed text-pretty">
          Daily Rounds is a 30-day accountability system for medical students. Monitored weekday
          study rooms, a roadmap built from your actual MBBS syllabus, tracked attendance and
          personal follow-up — so consistency stops depending on motivation.
        </p>

        <div className="mt-9 flex flex-wrap items-center gap-3">
          <LinkButton href="#waitlist" size="xl">
            {SITE.waitlistCta}
            <ArrowRight className="size-4" aria-hidden />
          </LinkButton>
          <LinkButton href="/login" variant="outline" size="xl">
            {SITE.enterCohortCta}
          </LinkButton>
        </div>

        <p className="text-fg-subtle mt-4 text-xs">
          Already enrolled? {SITE.enterCohortCta} takes you straight to your dashboard.
        </p>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- problem */

function Problem() {
  return (
    <Section id="about" eyebrow="The problem" title="It is usually not an access problem.">
      <p className="text-fg-muted max-w-2xl text-base leading-relaxed">
        Most medical students already have good notes, good lectures and at least one subscription
        they are not using. What is missing is structure and someone noticing when they stop.
      </p>

      <ul className="mt-8 grid gap-3 sm:grid-cols-2">
        {PROBLEMS.map((problem) => (
          <li
            key={problem}
            className="border-border bg-bg-elevated text-fg-muted flex items-start gap-3 rounded-2xl border p-4 text-sm"
          >
            <span className="bg-danger/60 mt-1.5 size-1.5 shrink-0 rounded-full" aria-hidden />
            {problem}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function WhatItIs() {
  return (
    <Section eyebrow="What Daily Rounds is" title="A month of structure around your own study.">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card variant="wash" tone="iris" padding="lg">
          <p className="text-fg text-lg leading-relaxed font-semibold text-balance">
            A one-month guided accountability experience.
          </p>
          <p className="text-fg-muted mt-3 text-sm leading-relaxed">
            You bring the resources you already trust. Daily Rounds provides the roadmap, the room,
            the tracking and the follow-up that makes using them consistently far more likely.
          </p>
        </Card>
        <Card variant="outline" padding="lg">
          <p className="text-fg text-lg leading-relaxed font-semibold text-balance">
            Not another lecture platform.
          </p>
          <p className="text-fg-muted mt-3 text-sm leading-relaxed">
            There is no video library here and nothing to binge. If more content were the answer,
            the problem would already be solved.
          </p>
        </Card>
      </div>
    </Section>
  );
}

/* --------------------------------------------------------- how it works */

function HowTheMonthWorks() {
  return (
    <Section
      id="how-it-works"
      eyebrow="How the month works"
      title="Six things, running every weekday."
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {HOW_IT_WORKS.map(({ icon: Icon, title, body }) => (
          <Card key={title} padding="lg" className="h-full">
            <span className="bg-pulse-500/12 text-pulse-600 dark:text-pulse-300 grid size-10 place-items-center rounded-xl">
              <Icon className="size-5" aria-hidden />
            </span>
            <h3 className="text-fg mt-4 text-base font-bold">{title}</h3>
            <p className="text-fg-muted mt-2 text-sm leading-relaxed">{body}</p>
          </Card>
        ))}
      </div>
    </Section>
  );
}

/* ------------------------------------------------- inside the software */

/**
 * Placeholder for real product screenshots.
 *
 * The brief asks for actual screenshots "once the UI is stable". Rather than ship stock
 * imagery or an empty gap in the meantime, each panel states plainly what that screen does.
 * Swapping in a real image later is a one-element change per panel.
 */
const SCREENS = [
  { icon: ListChecks, label: 'Two-subject roadmap', hint: 'Anatomy 22% · Physiology 15%' },
  { icon: BookOpen, label: 'Full 19-subject syllabus', hint: 'Browse any subject, any time' },
  { icon: LineChart, label: 'Progress & consistency', hint: 'Streaks, bands and history' },
  { icon: Trophy, label: 'Consistency leaderboard', hint: 'Ranked on showing up' },
];

function InsideTheSoftware() {
  return (
    <Section eyebrow="Inside the software" title="What you actually get access to.">
      <div className="grid gap-4 sm:grid-cols-2">
        {SCREENS.map(({ icon: Icon, label, hint }) => (
          <Card key={label} variant="outline" padding="lg" className="h-full">
            <div className="border-border bg-bg-sunken grid aspect-16/10 place-items-center rounded-2xl border border-dashed">
              <div className="text-center">
                <Icon className="text-fg-subtle mx-auto size-8" aria-hidden />
                <p className="text-fg-subtle mt-2 text-xs font-semibold">{hint}</p>
              </div>
            </div>
            <p className="text-fg mt-4 text-sm font-bold">{label}</p>
          </Card>
        ))}
      </div>
    </Section>
  );
}

/* -------------------------------------------------------------- features */

function Features() {
  return (
    <Section id="features" eyebrow="Features" title="What is in the cohort.">
      <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
        {FEATURES.map((feature) => (
          <div key={feature.title} className="flex gap-3">
            <CheckCircle2 className="text-success mt-0.5 size-5 shrink-0" aria-hidden />
            <div>
              <h3 className="text-fg text-sm font-bold">{feature.title}</h3>
              <p className="text-fg-muted mt-1 text-sm leading-relaxed">{feature.body}</p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* -------------------------------------------------------------- sessions */

function FocusSessions() {
  return (
    <Section id="sessions" eyebrow="Four focus sessions" title="Beyond the study room.">
      <div className="grid gap-4 sm:grid-cols-2">
        {SESSIONS.map((session, i) => (
          <Card key={session.title} padding="lg" className="h-full">
            <span className="text-2xs text-fg-subtle font-bold tabular-nums">0{i + 1}</span>
            <h3 className="text-fg mt-2 text-base font-bold text-balance">{session.title}</h3>
            <p className="text-fg-muted mt-2 text-sm leading-relaxed">{session.body}</p>
          </Card>
        ))}
      </div>
    </Section>
  );
}

/* -------------------------------------------------------------- outcomes */

function Outcomes() {
  return (
    <Section eyebrow="Expected outcomes" title="What a month here is meant to leave you with.">
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {OUTCOMES.map((outcome) => (
          <li
            key={outcome}
            className="border-border bg-bg-elevated text-fg flex items-start gap-3 rounded-2xl border p-4 text-sm font-medium"
          >
            <Compass className="text-iris-500 mt-0.5 size-4 shrink-0" aria-hidden />
            {outcome}
          </li>
        ))}
      </ul>
      <p className="text-fg-subtle mt-6 max-w-2xl text-xs leading-relaxed">
        Daily Rounds is a study-habit system, not a coaching guarantee. It does not promise exam
        results, and the focus sessions on postgraduate pathways are orientation rather than
        eligibility advice.
      </p>
    </Section>
  );
}

/* --------------------------------------------------------------- founder */

function Founder() {
  return (
    <Section eyebrow="The founder" title={`Built by ${SITE.founder}.`}>
      <Card variant="wash" tone="iris" padding="lg">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
          {SITE.founderPhotoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element -- remote URL supplied by config, not a bundled asset */
            <img
              src={SITE.founderPhotoUrl}
              alt={SITE.founder}
              className="border-border size-28 shrink-0 rounded-2xl border object-cover"
            />
          ) : (
            <span
              className="from-pulse-500 to-iris-600 font-display grid size-28 shrink-0 place-items-center rounded-2xl bg-linear-to-br text-3xl font-extrabold text-white"
              aria-hidden
            >
              MI
            </span>
          )}

          <div className="min-w-0">
            <h3 className="text-fg text-lg font-extrabold">{SITE.founder}</h3>
            <p className="text-fg-subtle text-sm font-semibold">
              Medical student &amp; medical-education creator · {SITE.instagramHandle}
            </p>

            <p className="text-fg-muted mt-4 text-sm leading-relaxed">
              Daily Rounds came out of seeing the same thing over and over among medical students:
              plenty of notes, lectures and subscriptions, but real difficulty with consistency,
              procrastination, backlogs, and knowing what to study next — with nobody following up
              when they stopped showing up. The gap is rarely access to content. It is structure and
              accountability. So I built a system around the studying rather than more material to
              study.
            </p>

            <LinkButton
              href={SITE.instagramUrl}
              variant="outline"
              size="sm"
              className="mt-5"
              target="_blank"
              rel="noopener noreferrer"
            >
              <InstagramIcon className="size-4" />
              {SITE.instagramHandle}
            </LinkButton>
          </div>
        </div>
      </Card>
    </Section>
  );
}

/* --------------------------------------------------------- cohort access */

function CohortAccess() {
  return (
    <Section id="waitlist" eyebrow="Cohort access" title="Two ways in.">
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card variant="outline" padding="lg">
          <span className="bg-pulse-500/12 text-pulse-600 dark:text-pulse-300 grid size-10 place-items-center rounded-xl">
            <LogoMark size={22} />
          </span>
          <h3 className="text-fg mt-4 text-lg font-extrabold">Already in {SITE.cohortLabel}</h3>
          <p className="text-fg-muted mt-2 text-sm leading-relaxed">
            Sign in to reach your dashboard, roadmap, check-in and the rest of the cohort portal.
          </p>
          <LinkButton href="/login" size="lg" fullWidth className="mt-5">
            {SITE.enterCohortCta}
            <ArrowRight className="size-4" aria-hidden />
          </LinkButton>

          {SITE.whatsappUrl && (
            <LinkButton
              href={SITE.whatsappUrl}
              variant="ghost"
              size="md"
              fullWidth
              className="mt-2"
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle className="size-4" aria-hidden />
              Request access
            </LinkButton>
          )}
        </Card>

        <Card padding="lg">
          <h3 className="text-fg text-lg font-extrabold">Join {SITE.nextCohortLabel}</h3>
          <p className="text-fg-muted mt-2 text-sm leading-relaxed">
            Leave your details and we will send you the dates and joining information for the next
            intake.
          </p>
          <WaitlistForm />
        </Card>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------- faq */

function Faq() {
  return (
    <Section eyebrow="FAQ" title="The questions we actually get.">
      <div className="grid gap-3 sm:grid-cols-2">
        {FAQS.map((faq) => (
          <details
            key={faq.q}
            className="border-border bg-bg-elevated group rounded-2xl border p-5 [&_summary::-webkit-details-marker]:hidden"
          >
            <summary className="text-fg cursor-pointer list-none text-sm font-bold">
              {faq.q}
            </summary>
            <p className="text-fg-muted mt-3 text-sm leading-relaxed">{faq.a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}

/* ---------------------------------------------------------------- footer */

function SiteFooter() {
  return (
    <footer className="border-border mt-8 border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Logo size={28} />
          <p className="text-fg-subtle mt-2 text-xs">
            {SITE.lockup} · {SITE.tagline}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <a
            href={SITE.instagramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-fg-muted hover:text-fg inline-flex items-center gap-2 text-sm font-semibold"
          >
            <InstagramIcon className="size-4" />
            {SITE.instagramHandle}
          </a>
          {SITE.whatsappUrl && (
            <a
              href={SITE.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-fg-muted hover:text-fg inline-flex items-center gap-2 text-sm font-semibold"
            >
              <MessageCircle className="size-4" aria-hidden />
              WhatsApp
            </a>
          )}
          <Link href="/login" className="text-fg-muted hover:text-fg text-sm font-semibold">
            {SITE.enterCohortCta}
          </Link>
        </div>
      </div>
    </footer>
  );
}

/* ----------------------------------------------------------------- shell */

function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="border-border scroll-mt-20 border-t">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
        <p className="eyebrow text-pulse-600 dark:text-pulse-300">{eyebrow}</p>
        <h2 className="font-display text-fg mt-2 max-w-2xl text-2xl font-extrabold tracking-[-0.02em] text-balance sm:text-3xl">
          {title}
        </h2>
        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}
