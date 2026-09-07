import { loadEnv } from './env';

loadEnv();

/**
 * One-off repair for study blocks the old, uncapped arithmetic already wrote.
 *
 * Before the lifecycle rules in `src/lib/domain/study-session.ts`, nothing but the student
 * pressing Finish ever ended a block, and `elapsed_seconds` was banked straight from the wall
 * clock. A closed laptop therefore accrued overnight, and the audit found the result: 32
 * paused and 8 running blocks, and one student credited with 1,173 study minutes and not a
 * single completed focus round. The scheduled sweep prevents new ones; this corrects the rows
 * that already exist.
 *
 * Three properties, in the order that matters:
 *
 *  - **Dry run by default.** It prints what it would change and writes nothing. Pass
 *    `--apply` to commit.
 *  - **Non-destructive.** Every corrected row keeps its original value in
 *    `raw_elapsed_seconds`, so a correction can be inspected and reversed.
 *  - **Idempotent.** A repaired row no longer matches the predicate, so running it twice
 *    changes nothing the second time.
 *
 * Usage, from a machine pointed at the target database:
 *
 * ```bash
 * DATABASE_URL="postgresql://..." npx tsx src/db/scripts/repair-sessions.ts          # dry run
 * DATABASE_URL="postgresql://..." npx tsx src/db/scripts/repair-sessions.ts --apply  # commit
 * ```
 *
 * Unlike the seeder this touches nothing it has not been asked to and deletes nothing at all,
 * so it carries no `ALLOW_REMOTE_DESTRUCTIVE` guard. It is still worth running the dry pass
 * against production first and reading the numbers.
 */
/** The connection, with the credentials taken out. Enough to recognise, never enough to use. */
function describeTarget(driver: string): string {
  const url = process.env.DATABASE_URL;
  if (!url) return `${driver} (embedded, ${process.env.PGLITE_DATA_DIR ?? '.data/'})`;
  try {
    const parsed = new URL(url);
    return `${driver} at ${parsed.host}${parsed.pathname}`;
  } catch {
    return driver;
  }
}

async function main() {
  const apply = process.argv.includes('--apply');

  const { dbDriver, closeDb } = await import('../client');
  const { closeStaleSessions, repairImplausibleSessions } =
    await import('@/server/session-lifecycle');

  /*
   * Say which database this is about to touch, before touching it. The script reads
   * `.env.local` like every other script here, so "I ran the dry pass" and "I ran it against
   * the database I meant" are not the same statement unless it prints the host.
   */
  console.log(`→ repairing study sessions ${apply ? '' : '[DRY RUN]'}`);
  console.log(`  target: ${describeTarget(dbDriver())}`);

  const implausible = await repairImplausibleSessions({ dryRun: !apply });
  console.log(
    apply
      ? `  ✓ capped ${implausible.repaired} block(s) with impossible totals`
      : `  • ${implausible.found} block(s) carry an impossible total and would be capped`,
  );

  if (apply) {
    // Only run on --apply: this one has no dry mode because closing a stale block is exactly
    // what the scheduled sweep does every fifteen minutes anyway. Running it here simply
    // does not wait for the next tick.
    const closed = await closeStaleSessions();
    console.log(`  ✓ closed ${closed} stale block(s)`);
  } else {
    console.log('  • stale open blocks are closed by the scheduled sweep; pass --apply to');
    console.log('    close them now instead of waiting for the next run');
  }

  if (!apply) {
    console.log('\n  Nothing was written. Re-run with --apply to commit.');
  } else {
    console.log('\n  Done. Run the cohort recalculation in /admin/settings so the derived');
    console.log('  activity cache picks up the corrected minutes.');
  }

  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
