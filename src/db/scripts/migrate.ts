import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadEnv } from './env';

loadEnv();

/**
 * Applies every SQL file in ./drizzle in order, tracking what has run in
 * `__drizzle_migrations`. Deliberately hand-rolled rather than using the driver-specific
 * Drizzle migrators so that the exact same code path runs against Supabase and PGlite.
 */
async function main() {
  const { dbDriver, dbExecute: execute, dbQuery: query, closeDb: close } = await import(
    '../client'
  );

  console.log(`→ migrating (driver: ${dbDriver()})`);

  await execute(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id serial PRIMARY KEY,
      name text NOT NULL UNIQUE,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  const rows = await query<{ name: string }>('SELECT name FROM __drizzle_migrations');
  const applied = new Set(rows.map((r) => r.name));

  const dir = join(process.cwd(), 'drizzle');
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(dir, file), 'utf8').replaceAll('--> statement-breakpoint', '');
    await execute(sql);
    await execute(`INSERT INTO __drizzle_migrations (name) VALUES ('${file.replaceAll("'", "''")}')`);
    console.log(`  ✓ ${file}`);
    ran += 1;
  }

  console.log(
    ran === 0 ? '  already up to date' : `→ applied ${ran} migration${ran === 1 ? '' : 's'}`,
  );
  await close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
