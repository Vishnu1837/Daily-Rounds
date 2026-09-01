/**
 * The public page's drawn assets.
 *
 * All bespoke, all vector, all server-rendered. Three rules held the whole set together:
 *
 *  - Nothing here is a screenshot of a fake dashboard. The hero and bento visuals are
 *    *fragments* of the real product's vocabulary — a topic list, a subject ring, an
 *    attendance pill — cropped the way a magazine crops a photograph.
 *  - Nothing here states a number the product cannot back up. The arcs describe how the
 *    month is *structured* (five weekday rooms, four weeks, twenty sessions), never an
 *    outcome anyone achieved. Invented results on a landing page are a promise the cohort
 *    would then have to keep.
 *  - Line work stays thin and black; violet appears once per composition at most.
 */

/* ------------------------------------------------------------------- pieces */

/** A subject progress ring. The only violet in the hero composition. */
function SubjectRing({ percent, size = 68 }: { percent: number; size?: number }) {
  const r = 26;
  const circumference = 2 * Math.PI * r;
  const rest = circumference * (1 - percent / 100);

  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden focusable="false">
      <circle cx="32" cy="32" r={r} fill="none" stroke="var(--ed-line)" strokeWidth="6" />
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        stroke="var(--ed-accent)"
        strokeWidth="6"
        strokeLinecap="round"
        transform="rotate(-90 32 32)"
        className="ed-arc"
        style={
          {
            '--ed-arc-len': circumference,
            '--ed-arc-rest': rest,
          } as React.CSSProperties
        }
      />
    </svg>
  );
}

/** A ticked / untickeded topic line, as it reads in the roadmap. */
function TopicLine({ done, width, muted }: { done: boolean; width: string; muted?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="grid size-[18px] shrink-0 place-items-center rounded-full border"
        style={{
          borderColor: done ? 'var(--ed-ink)' : 'var(--ed-line-strong)',
          background: done ? 'var(--ed-ink)' : 'transparent',
        }}
        aria-hidden
      >
        {done && (
          <svg viewBox="0 0 12 12" className="size-2.5" aria-hidden>
            <path
              d="M2.5 6.2 4.8 8.5 9.5 3.6"
              fill="none"
              stroke="#fff"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
      <span
        className="h-[7px] rounded-full"
        style={{
          width,
          background: muted ? 'var(--ed-line)' : 'var(--ed-line-strong)',
          opacity: done ? 0.55 : 1,
        }}
        aria-hidden
      />
    </div>
  );
}

/* --------------------------------------------------------------------- hero */

/**
 * The hero illustration: an ECG line drawn behind three cropped product fragments.
 *
 * The trace is the same continuous line as the logo mark — one stroke that never lifts,
 * which is the habit the product is about — and it is what ties three otherwise unrelated
 * interface pieces into a single composition.
 */
export function HeroComposition() {
  return (
    <div className="relative w-full" aria-hidden>
      {/* The trace. Sits behind everything, bleeding past the fragments on both sides. */}
      <svg
        viewBox="0 0 520 300"
        className="absolute inset-x-[-6%] top-[38%] w-[112%]"
        fill="none"
        focusable="false"
      >
        <path
          d="M0 150h96l26-58 34 128 30-92 22 34h58l24-46 30 78 26-52h144"
          stroke="var(--ed-ink)"
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.16"
        />
      </svg>

      {/* Fragment 1 — the weekday room, as a cropped panel. */}
      <div
        className="relative ml-auto w-[86%] max-w-[420px] p-5 sm:p-6"
        style={{
          background: 'var(--ed-surface)',
          border: '1px solid var(--ed-line)',
          borderRadius: 'var(--ed-r-card)',
          boxShadow: 'var(--ed-shadow)',
        }}
      >
        <div className="flex items-center justify-between">
          <span className="ed-label" style={{ color: 'var(--ed-faint)' }}>
            Weekday room
          </span>
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
            style={{ background: 'var(--ed-mint)', color: 'var(--ed-mint-ink)' }}
          >
            <span className="size-1.5 rounded-full" style={{ background: 'var(--ed-mint-ink)' }} />
            Live
          </span>
        </div>

        <p
          className="mt-3 text-[19px] font-medium tracking-[-0.03em]"
          style={{ color: 'var(--ed-ink)' }}
        >
          Anatomy · Upper limb
        </p>

        <div className="mt-5 space-y-3.5">
          <TopicLine done width="72%" />
          <TopicLine done width="58%" />
          <TopicLine done={false} width="80%" />
          <TopicLine done={false} width="46%" muted />
        </div>

        <div
          className="mt-5 flex items-center justify-between border-t pt-4"
          style={{ borderColor: 'var(--ed-line)' }}
        >
          <span className="text-[12px]" style={{ color: 'var(--ed-muted)' }}>
            Mon–Fri · 60 minutes
          </span>
          <span
            className="grid size-7 place-items-center rounded-full"
            style={{ background: 'var(--ed-ink)' }}
          >
            <svg viewBox="0 0 16 16" className="size-3.5" fill="none" aria-hidden>
              <path
                d="M3.5 8h9m-3.5-4 4 4-4 4"
                stroke="#fff"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </div>
      </div>

      {/* Fragment 2 — the subject ring, overlapping the panel's lower-left corner. */}
      <div
        className="absolute bottom-[-34px] left-0 flex items-center gap-3 p-3 pr-5 sm:bottom-[-40px]"
        style={{
          background: 'var(--ed-surface)',
          border: '1px solid var(--ed-line)',
          borderRadius: '999px',
          boxShadow: 'var(--ed-shadow-lift)',
        }}
      >
        <SubjectRing percent={62} size={44} />
        <div className="leading-tight">
          <p className="text-[13px] font-medium tracking-[-0.02em]">Physiology</p>
          <p className="text-[11px]" style={{ color: 'var(--ed-muted)' }}>
            14 of 22 topics
          </p>
        </div>
      </div>

      {/* Fragment 3 — the attendance stamp, kicked out past the panel's top edge. */}
      <div
        className="absolute top-[-18px] left-[2%] hidden items-center gap-2 rounded-full px-3.5 py-2 sm:flex"
        style={{
          background: 'var(--ed-ink)',
          color: '#fff',
          boxShadow: 'var(--ed-shadow-lift)',
        }}
      >
        <span className="size-1.5 rounded-full" style={{ background: 'var(--ed-accent-lift)' }} />
        <span className="text-[12px] font-medium">Day 12 · marked present</span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- arc chart */

const ARCS = [
  { r: 74, label: 'Wk 1' },
  { r: 112, label: 'Wk 2' },
  { r: 150, label: 'Wk 3' },
  { r: 188, label: 'Wk 4', active: true },
];

/**
 * The month, drawn as four nested half-arcs.
 *
 * Read outward: each week adds five weekday rooms to the one before it, and the outer arc —
 * the only violet mark in the section — is the completed month. It is a diagram of the
 * commitment's *shape*, which is why it carries session counts rather than percentages.
 */
export function MonthArcs() {
  const cx = 240;
  const cy = 214;

  return (
    <svg
      viewBox="0 0 480 240"
      className="w-full"
      role="img"
      aria-label="Four nested arcs, one per week of the cohort: five weekday study rooms a week, twenty across the month."
    >
      {ARCS.map(({ r, label, active }) => {
        const length = Math.PI * r;
        return (
          <g key={label}>
            <path
              d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
              fill="none"
              stroke={active ? 'var(--ed-accent)' : '#ffffff'}
              strokeWidth={active ? 26 : 22}
              strokeLinecap="round"
              className="ed-arc"
              style={{ '--ed-arc-len': length } as React.CSSProperties}
            />
            <text
              x={cx - r + (active ? 4 : 2)}
              y={cy + 20}
              textAnchor="middle"
              fontSize="11"
              fontWeight="500"
              fill={active ? 'var(--ed-accent)' : 'var(--ed-muted)'}
            >
              {label}
            </text>
          </g>
        );
      })}

      {/*
        Both label rows sit on the baseline: the week at each arc's left end, the running
        session count at its right. Stacking the counts up the centre instead reads as a
        y-axis, which is exactly the analytics-default look this chart is avoiding.
      */}
      {ARCS.map(({ r, active }, i) => (
        <text
          key={r}
          x={cx + r - (active ? 4 : 2)}
          y={cy + 20}
          textAnchor="middle"
          fontSize="11"
          fontWeight="500"
          fill={active ? 'var(--ed-accent)' : 'var(--ed-muted)'}
        >
          {(i + 1) * 5}
        </text>
      ))}
    </svg>
  );
}

/* ------------------------------------------------------- bento fragments */

/** A cropped slice of the roadmap: two active subjects, the rest of the syllabus behind. */
export function RoadmapFragment() {
  const subjects = [
    { name: 'Anatomy', percent: 62, active: true },
    { name: 'Physiology', percent: 34, active: true },
    { name: 'Biochemistry', percent: 0, active: false },
    { name: 'Pathology', percent: 0, active: false },
  ];

  return (
    <div className="space-y-3" aria-hidden>
      {subjects.map(({ name, percent, active }) => (
        <div
          key={name}
          className="flex items-center gap-4 rounded-2xl px-4 py-3.5"
          style={{
            background: active ? 'var(--ed-surface)' : 'transparent',
            border: `1px solid ${active ? 'var(--ed-line)' : 'transparent'}`,
            opacity: active ? 1 : 0.55,
          }}
        >
          <span
            className="text-[13px] font-medium tracking-[-0.02em]"
            style={{ color: active ? 'var(--ed-ink)' : 'var(--ed-muted)' }}
          >
            {name}
          </span>
          <span
            className="ml-auto h-1.5 w-[92px] overflow-hidden rounded-full"
            style={{ background: 'var(--ed-field-deep)' }}
          >
            <span
              className="block h-full rounded-full"
              style={{
                width: `${percent}%`,
                background: active ? 'var(--ed-accent)' : 'var(--ed-line-strong)',
              }}
            />
          </span>
          <span
            className="w-8 text-right text-[12px] tabular-nums"
            style={{ color: 'var(--ed-muted)' }}
          >
            {percent}%
          </span>
        </div>
      ))}
      <p className="pl-4 text-[12px]" style={{ color: 'var(--ed-faint)' }}>
        + 15 more subjects, browseable any time
      </p>
    </div>
  );
}

/** Four weeks of weekday attendance, as a grid of marks rather than a chart. */
export function AttendanceGrid() {
  // Twenty weekday cells. The pattern is illustrative of the *grid*, not of any student.
  const filled = new Set([0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 15, 16, 17, 18]);

  return (
    <div className="grid grid-cols-5 gap-2" aria-hidden>
      {Array.from({ length: 20 }, (_, i) => (
        <span
          key={i}
          className="aspect-square rounded-[7px]"
          style={{
            background: filled.has(i) ? 'var(--ed-ink)' : 'var(--ed-field-deep)',
          }}
        />
      ))}
    </div>
  );
}
