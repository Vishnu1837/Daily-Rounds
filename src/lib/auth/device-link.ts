import 'server-only';

import { createHash } from 'node:crypto';

import { and, eq, gt, isNull } from 'drizzle-orm';

import { db } from '@/db/client';
import { deviceLinkCodes } from '@/db/schema';

import { generateToken } from './password';

/**
 * Carrying a sign-in from one device to another.
 *
 * The problem this solves is small and entirely human: a student is signed in on their
 * laptop, wants the same account open on their phone, and does not remember the password
 * they set once, months ago, on a different keyboard. Sessions were never exclusive — see
 * `issueSession` — so nothing stood in the way except the typing.
 *
 * So the laptop, which has already proved who it is, mints a short-lived code. The phone's
 * camera carries it across. Redeeming it mints an ordinary session for the same account.
 *
 * Everything else in this file follows from one fact: between minting and scanning, that
 * code *is* the account. Anyone who reads it off the screen — over a shoulder, out of a
 * screen share, from a photograph of the monitor — can spend it. It cannot be made secret,
 * so instead it is made worthless quickly:
 *
 *  - `TTL_SECONDS` is two minutes, about as long as it takes to unlock a phone and open a
 *    camera, and no longer.
 *  - Redeeming is a single conditional UPDATE. Two scanners racing the same code cannot both
 *    win, because only one of them updates a row where `consumed_at IS NULL`.
 *  - Only the hash is stored, so a leaked database backup contains no usable code.
 *
 * A student who thinks someone saw the screen does not need to do anything in particular:
 * waiting two minutes is the remedy, and asking for a new code retires the old one anyway.
 */

/** How long a freshly minted code stays scannable. */
export const TTL_SECONDS = 120;

export type DeviceLinkStatus = 'pending' | 'linked' | 'expired';

export type MintedDeviceLink = {
  /** The row id. Safe to hold in the browser: on its own it opens nothing. */
  id: string;
  /** The credential. Goes into the QR and nowhere else — never logged, never stored raw. */
  token: string;
  expiresAt: Date;
};

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Mints a code for `userId`, retiring any the same account still holds. */
export async function mintDeviceLink(userId: string): Promise<MintedDeviceLink> {
  /*
   * Clear the account's other codes first — live ones included, which is the point.
   *
   * One account holds at most one live code, so pressing "show a new code" does not leave
   * the previous QR working for another two minutes on whatever screen or screenshot it is
   * still sitting in. The expired rows go with it as ordinary housekeeping.
   */
  await db.delete(deviceLinkCodes).where(eq(deviceLinkCodes.userId, userId));

  const token = generateToken();
  const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000);

  const [row] = await db
    .insert(deviceLinkCodes)
    .values({ userId, tokenHash: hashToken(token), expiresAt })
    .returning({ id: deviceLinkCodes.id });

  if (!row) throw new Error('Could not create a device link code.');

  return { id: row.id, token, expiresAt };
}

export type RedeemResult =
  | { ok: true; userId: string }
  /*
   * One reason for every way a scan can fail, so the phone can say something true.
   *
   * These are separated for the reader's benefit and cost nothing in secrecy: a 256-bit
   * token is not something an attacker guesses their way into, so telling a scanner that a
   * code expired rather than never existed reveals nothing they could not already try.
   */
  | { ok: false; reason: 'unknown' | 'expired' | 'already-used' };

/**
 * Spends a code, atomically, and reports whose account it was.
 *
 * The single conditional UPDATE is the whole safety property. A read-then-write would leave
 * a window in which two scans both see an unspent code and both sign in; here the second
 * updates nothing and is told the code was already used.
 */
export async function redeemDeviceLink(
  token: string,
  userAgent?: string | null,
): Promise<RedeemResult> {
  const tokenHash = hashToken(token);
  const now = new Date();

  const [claimed] = await db
    .update(deviceLinkCodes)
    .set({ consumedAt: now, consumedUserAgent: userAgent?.slice(0, 300) ?? null })
    .where(
      and(
        eq(deviceLinkCodes.tokenHash, tokenHash),
        isNull(deviceLinkCodes.consumedAt),
        gt(deviceLinkCodes.expiresAt, now),
      ),
    )
    .returning({ userId: deviceLinkCodes.userId });

  if (claimed) return { ok: true, userId: claimed.userId };

  // Nothing was claimed. Look the row up to say *why*, which is the difference between
  // "ask the laptop for a new code" and "you have already used this one".
  const [existing] = await db
    .select({ consumedAt: deviceLinkCodes.consumedAt, expiresAt: deviceLinkCodes.expiresAt })
    .from(deviceLinkCodes)
    .where(eq(deviceLinkCodes.tokenHash, tokenHash))
    .limit(1);

  if (!existing) return { ok: false, reason: 'unknown' };
  if (existing.consumedAt) return { ok: false, reason: 'already-used' };
  return { ok: false, reason: 'expired' };
}

/**
 * What became of a code the caller minted, for the screen that is still showing it.
 *
 * Scoped to `userId` deliberately: the id travels to the browser, and without the ownership
 * check it would let any signed-in account watch any other account's pairing.
 */
export async function deviceLinkStatus(
  id: string,
  userId: string,
): Promise<{ status: DeviceLinkStatus; device: string | null }> {
  const [row] = await db
    .select({
      consumedAt: deviceLinkCodes.consumedAt,
      consumedUserAgent: deviceLinkCodes.consumedUserAgent,
      expiresAt: deviceLinkCodes.expiresAt,
    })
    .from(deviceLinkCodes)
    .where(and(eq(deviceLinkCodes.id, id), eq(deviceLinkCodes.userId, userId)))
    .limit(1);

  // A code that is gone was superseded by a newer one, which for this screen amounts to the
  // same thing as having run out.
  if (!row) return { status: 'expired', device: null };
  if (row.consumedAt) return { status: 'linked', device: describeDevice(row.consumedUserAgent) };
  if (row.expiresAt.getTime() <= Date.now()) return { status: 'expired', device: null };
  return { status: 'pending', device: null };
}

/**
 * A user agent, reduced to the few words a person actually wants to read.
 *
 * Deliberately coarse. The desktop is confirming "yes, that was your phone" — anything more
 * precise than the platform is noise, and an unrecognised browser should degrade to saying
 * nothing rather than to a confident wrong guess.
 */
export function describeDevice(userAgent: string | null): string | null {
  if (!userAgent) return null;
  if (/iPhone/i.test(userAgent)) return 'iPhone';
  if (/iPad/i.test(userAgent)) return 'iPad';
  if (/Android/i.test(userAgent)) return 'Android';
  return null;
}
