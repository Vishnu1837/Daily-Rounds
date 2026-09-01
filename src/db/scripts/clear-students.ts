import { loadEnv } from './env';

loadEnv();

/**
 * Removes every student from the database, leaving the cohort itself intact.
 *
 * This is the "the demo is over, real people are arriving" script. It deletes student user
 * accounts — and, by cascade, their memberships, roadmaps, assignments, sessions,
 * attendance, check-ins, points, achievements and derived activity. It deliberately keeps
 * everything that is *not* a student: the cohort and its calendar, the subject catalogue,
 * materials, events, announcements, quizzes and the admin accounts.
 *
 * Admins are never touched. Anything referencing a deleted user from the admin side
 * (`marked_by`, `created_by`, audit entries) is nulled rather than removed, so the history
 * of who did what survives.
 *
 * Pass `--email=someone@example.edu` to remove exactly one account instead of all of them.
 *
 *     npm run db:clear-students                        # local PGlite
 *     ALLOW_REMOTE_DESTRUCTIVE=1 npm run db:clear-students   # hosted database
 *     ALLOW_REMOTE_DESTRUCTIVE=1 npm run db:clear-students -- --email=one@student.edu
 */
async function main() {
  const { dbQuery: query, closeDb: close } = await import('../client');

  const url = process.env.DATABASE_URL;
  if (url && process.env.ALLOW_REMOTE_DESTRUCTIVE !== '1') {
    console.error(
      [
        '',
        '✖ Refusing to delete students from a remote database without confirmation.',
        '',
        `  Target: ${redact(url)}`,
        '',
        '  If that is genuinely what you want:',
        '',
        '      ALLOW_REMOTE_DESTRUCTIVE=1 npm run db:clear-students',
        '',
      ].join('\n'),
    );
    process.exit(1);
  }

  const emailArg = process.argv.find((arg) => arg.startsWith('--email='))?.slice('--email='.length);

  /*
   * Admins are excluded in the WHERE clause rather than checked afterwards, so there is no
   * ordering in which this script can remove one. The email filter is parameterised through
   * a quoted literal for the same reason the rest of these scripts avoid interpolation.
   */
  const scope = emailArg
    ? `role <> 'admin' AND lower(email) = lower('${emailArg.replaceAll("'", "''")}')`
    : "role <> 'admin'";

  // Show the target before touching it: a count is the one thing worth checking twice.
  const doomed = await query<{ id: string; email: string; full_name: string }>(
    `SELECT id, email, full_name FROM users WHERE ${scope} ORDER BY full_name`,
  );

  if (doomed.length === 0) {
    console.log(
      emailArg ? `→ no student account matching ${emailArg}.` : '→ no student accounts to remove.',
    );
    await close();
    return;
  }

  console.log(`→ removing ${doomed.length} student account${doomed.length === 1 ? '' : 's'}:`);
  for (const user of doomed) console.log(`   · ${user.full_name} <${user.email}>`);

  const deleted = await query<{ id: string }>(`DELETE FROM users WHERE ${scope} RETURNING id`);

  const [remaining] = await query<{ students: number; admins: number; members: number }>(
    `SELECT
       (SELECT count(*)::int FROM users WHERE role <> 'admin') AS students,
       (SELECT count(*)::int FROM users WHERE role = 'admin')  AS admins,
       (SELECT count(*)::int FROM cohort_members)              AS members`,
  );

  console.log(`→ deleted ${deleted.length}.`);
  console.log(
    `   students left: ${remaining?.students ?? 0} · admins kept: ${remaining?.admins ?? 0} · cohort memberships: ${remaining?.members ?? 0}`,
  );

  await close();
}

/** Keeps the host visible for confirmation while keeping credentials out of the logs. */
function redact(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.username ? '***@' : ''}${parsed.host}${parsed.pathname}`;
  } catch {
    return '<unparseable DATABASE_URL>';
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
