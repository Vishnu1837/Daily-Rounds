import 'server-only';

import { db } from '@/db/client';
import { auditLog } from '@/db/schema';
import { AuthorizationError } from '@/lib/auth/guards';

/** Every server action returns this shape so the UI can render a real error state. */
export type Result<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T }))
  | { ok: false; message: string; errors?: Record<string, string> };

export function ok(): Result;
export function ok<T>(data: T): Result<T>;
export function ok<T>(data?: T): Result<T> {
  return { ok: true, data } as Result<T>;
}

export function fail(message: string, errors?: Record<string, string>): Result<never> {
  return { ok: false, message, errors };
}

/**
 * Wraps an action body so an unexpected throw becomes a message a student can act on,
 * rather than a blank screen or a raw stack trace.
 */
export async function guarded<T>(
  fn: () => Promise<Result<T>>,
  fallback: string,
): Promise<Result<T>> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return { ok: false, message: error.message };
    }
    // Next uses thrown values for redirect/notFound; let those through untouched.
    if (
      error &&
      typeof error === 'object' &&
      'digest' in error &&
      typeof (error as { digest?: unknown }).digest === 'string'
    ) {
      throw error;
    }
    console.error('[daily-rounds] action failed:', error);
    return { ok: false, message: fallback };
  }
}

export async function recordAudit(entry: {
  actorUserId: string;
  action: string;
  entity: string;
  entityId?: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  await db.insert(auditLog).values({
    actorUserId: entry.actorUserId,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    payload: entry.payload ?? {},
  });
}
