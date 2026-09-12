/**
 * The sitting.
 *
 * A paper under way gets its own shell, and the shell is nothing: no rail, no header, no
 * bottom nav, no dock, no feedback prompt. That is the whole reason this route lives in its
 * own group rather than under `(app)` — a nested layout can only add to its parent, never
 * take the navigation away, so the only way to have a student sit a paper without a way out
 * of it one tap wide is to route them outside the student shell entirely.
 *
 * It is the same argument the full-screen lock makes. A paper drawn beside a link to the
 * flashcards is a paper you can leave without meaning to, and every one of those links is a
 * route to material the assessment is meant to be testing. The runner keeps its own ways
 * back — submit, and the screens it shows once the sitting is over — and those are the only
 * ones offered until the paper closes.
 */
export default function ExamLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" className="mx-auto w-full max-w-6xl px-4 py-6 lg:px-8 lg:py-10">
      {children}
    </main>
  );
}
