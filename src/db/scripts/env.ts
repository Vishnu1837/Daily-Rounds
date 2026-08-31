/** Loads .env.local then .env for standalone (non-Next) scripts. */
export function loadEnv(): void {
  for (const file of ['.env.local', '.env']) {
    try {
      process.loadEnvFile(file);
    } catch {
      /* file absent — fine */
    }
  }
}
