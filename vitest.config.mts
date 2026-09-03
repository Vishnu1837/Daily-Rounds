import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globals: true,
    // Integration tests run against an in-memory Postgres, never a real one. Set here so
    // it is in place before any module reads the environment.
    env: {
      PGLITE_DATA_DIR: 'memory://',
      DATABASE_URL: '',
    },
    /*
     * Generous, because the first test in each integration file pays a fixed setup cost the
     * others do not: booting PGlite and applying every migration in ./drizzle to a fresh
     * database. That was already close to the 5s default and crossed it as the migration
     * list grew, which showed up as the first test in a file failing at random while the
     * same test passed when the file was run alone. The budget is for setup, not for slow
     * assertions — a test that genuinely takes this long is a bug.
     */
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Each file gets its own process, and therefore its own isolated database.
    pool: 'forks',
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // `server-only` throws when imported outside a React Server Component build.
      'server-only': fileURLToPath(
        new URL('./tests/helpers/server-only-stub.ts', import.meta.url),
      ),
    },
  },
});
