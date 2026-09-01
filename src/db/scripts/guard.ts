/**
 * Guard for the destructive database scripts.
 *
 * `db:seed` and `db:reset` both begin by truncating every table. Run against the embedded
 * PGlite database that is exactly what you want; run against a hosted Postgres it destroys
 * whatever was there. The two are distinguished only by whether `DATABASE_URL` happens to
 * be set, which is far too quiet a difference for an irreversible operation.
 *
 * So: pointing one of these at a remote database now requires saying so out loud.
 *
 *   ALLOW_REMOTE_DESTRUCTIVE=1 npm run db:seed
 */
export function assertDestructiveTargetAllowed(script: string): void {
  const url = process.env.DATABASE_URL;
  if (!url) return; // PGlite — local, disposable, no confirmation needed.

  if (process.env.ALLOW_REMOTE_DESTRUCTIVE === '1') {
    console.warn(`⚠  ${script}: truncating the REMOTE database at ${redact(url)}`);
    return;
  }

  console.error(
    [
      '',
      `✖ Refusing to run "${script}" against a remote database.`,
      '',
      `  Target: ${redact(url)}`,
      '',
      '  This script truncates every table. If that is genuinely what you want:',
      '',
      `      ALLOW_REMOTE_DESTRUCTIVE=1 npm run ${script}`,
      '',
      '  To run it against the local embedded database instead, unset DATABASE_URL:',
      '',
      `      DATABASE_URL= npm run ${script}`,
      '',
    ].join('\n'),
  );
  process.exit(1);
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
