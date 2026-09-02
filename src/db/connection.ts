/**
 * Driver selection.
 *
 * - `DATABASE_URL` present  → postgres.js (Supabase, Neon, RDS, any hosted Postgres).
 * - `DATABASE_URL` absent   → PGlite, an embedded Postgres that stores its data under
 *                             `.data/` so `npm run dev` works with zero setup.
 *
 * Both run the *same* schema and the same SQL dialect, so nothing in the application layer
 * changes between them. See docs/ARCHITECTURE.md (ADR-002).
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema';

export type DbDriver = 'postgres' | 'pglite';

export function resolveDriver(): DbDriver {
  return process.env.DATABASE_URL ? 'postgres' : 'pglite';
}

/**
 * Resolved at connection time, not at import time. A module-level constant would capture
 * whatever the environment happened to be when this file was first imported, which makes
 * the target database depend on module evaluation order — how an integration test can end
 * up pointed at the development database.
 */
export function pgliteDataDir(): string {
  return process.env.PGLITE_DATA_DIR ?? '.data/daily-rounds';
}

export type CreatedDatabase = {
  driver: DbDriver;
  /** Drizzle handle. Typed loosely here; `src/db/client.ts` narrows it for the app. */
  db: any;
  /** Executes raw SQL (possibly multi-statement), used by the migration runner. */
  execute: (sql: string) => Promise<void>;
  /** Executes a single raw SQL statement and returns its rows. */
  query: <T = Record<string, unknown>>(sql: string) => Promise<T[]>;
  close: () => Promise<void>;
};

export function createDatabase(): CreatedDatabase {
  const url = process.env.DATABASE_URL;

  if (url) {
    const client = postgres(url, {
      /*
       * A dashboard render issues a dozen independent reads in one `Promise.all`. With a
       * pool of ten, the last two waited for a free connection and turned one round trip
       * into two — the pool size, not the database, was the bottleneck. Twenty is still
       * far inside what a transaction-mode pooler is happy to hold.
       */
      max: Number(process.env.DATABASE_POOL_MAX ?? 20),
      // Supabase's transaction-mode pooler does not support prepared statements.
      prepare: false,
      idle_timeout: 20,
      onnotice: () => {},
    });
    return {
      driver: 'postgres',
      db: drizzlePostgres(client, { schema }),
      execute: async (raw: string) => {
        await client.unsafe(raw);
      },
      query: async <T = Record<string, unknown>>(raw: string) =>
        (await client.unsafe(raw)) as unknown as T[],
      close: async () => {
        await client.end({ timeout: 5 });
      },
    };
  }

  const dataDir = pgliteDataDir();
  // PGlite creates its own directory but not the parents. In-memory targets have none.
  if (!dataDir.startsWith('memory://')) {
    mkdirSync(dirname(dataDir), { recursive: true });
  }
  const client = new PGlite(dataDir);
  return {
    driver: 'pglite',
    db: drizzlePglite(client, { schema }),
    execute: async (raw: string) => {
      await client.exec(raw);
    },
    query: async <T = Record<string, unknown>>(raw: string) => (await client.query<T>(raw)).rows,
    close: async () => {
      await client.close();
    },
  };
}
