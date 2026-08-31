import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import { type CreatedDatabase, createDatabase } from './connection';
import * as schema from './schema';

/**
 * The canonical database handle type. Both supported drivers expose the same Drizzle
 * query-builder surface, so the application is typed against one of them.
 */
export type Database = PostgresJsDatabase<typeof schema>;

declare global {
  var __dailyRoundsDb: CreatedDatabase | undefined;
}

/**
 * Exactly one connection per process, opened on first use rather than on import.
 *
 * Laziness matters twice over: `next build` spawns several page-data workers that import
 * this module without ever querying, and with the PGlite driver a second instance would
 * open the same data directory independently — so writes through one handle would be
 * invisible to the other.
 */
function instance(): CreatedDatabase {
  if (!globalThis.__dailyRoundsDb) globalThis.__dailyRoundsDb = createDatabase();
  return globalThis.__dailyRoundsDb;
}

/**
 * A lazy stand-in for the Drizzle handle. Property access is what triggers the connection,
 * so `import { db }` alone is free.
 */
export const db: Database = new Proxy({} as Database, {
  get(_target, prop, receiver) {
    const real = instance().db as Database;
    const value = Reflect.get(real as object, prop, receiver);
    return typeof value === 'function' ? value.bind(real) : value;
  },
}) as Database;

export function dbDriver() {
  return instance().driver;
}

/** Raw multi-statement SQL. Used by the migration runner and the seeder only. */
export function dbExecute(sql: string): Promise<void> {
  return instance().execute(sql);
}

/** Raw single-statement SQL returning rows. Used by the migration runner only. */
export function dbQuery<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  return instance().query<T>(sql);
}

/** Closes the connection. Only standalone scripts should call this. */
export async function closeDb(): Promise<void> {
  const existing = globalThis.__dailyRoundsDb;
  if (!existing) return;
  await existing.close();
  globalThis.__dailyRoundsDb = undefined;
}

export { schema };
