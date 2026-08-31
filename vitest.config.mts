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
