/**
 * Loads .env.local then .env for standalone (non-Next) scripts.
 *
 * Variables already present in the environment win. `process.loadEnvFile` overwrites them,
 * which quietly defeats the usual way of pointing a script somewhere safe —
 * `DATABASE_URL= PGLITE_DATA_DIR=… npm run db:seed` would load .env.local and aim a
 * TRUNCATE at the hosted database anyway. Since `db:reset` and `db:seed` are destructive,
 * an explicit variable has to be the last word.
 */
export function loadEnv(): void {
  const explicit = new Map(Object.entries(process.env));

  for (const file of ['.env.local', '.env']) {
    try {
      process.loadEnvFile(file);
    } catch {
      /* file absent — fine */
    }
  }

  // Restore anything the caller set explicitly, including deliberate empty strings.
  for (const [key, value] of explicit) {
    if (value !== undefined) process.env[key] = value;
  }
}
