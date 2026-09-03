import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';

/*
 * `issueSession` never reads a cookie — it mints the row and hands the cookie back for the
 * caller to write — but its module imports the store, and there is no request here to read
 * one from.
 */
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}));

import { issueSession } from '@/lib/auth/session';
import {
  deviceLinkStatus,
  describeDevice,
  mintDeviceLink,
  redeemDeviceLink,
} from '@/lib/auth/device-link';

import { GET as scanLink } from '@/app/link/[token]/route';

import { createTestCohort, createTestMember, db, migrateTestDb, schema } from './helpers/db';

/**
 * Signing in on a second device by scanning a code, against a real database.
 *
 * The properties under test are the ones that make a bearer credential on a screen safe to
 * hand out: it works once, it stops working when it runs out, and asking for a new one kills
 * the old one. All three are enforced by SQL predicates rather than by application branches,
 * so mocking the database would test nothing at all.
 */

async function member() {
  const { cohort } = await createTestCohort();
  return createTestMember(cohort.id);
}

/** Ages a code out without waiting two minutes for it. */
async function expire(id: string) {
  await db
    .update(schema.deviceLinkCodes)
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where(eq(schema.deviceLinkCodes.id, id));
}

/** Drives the route the phone's camera opens, and reports where it was sent. */
async function scan(token: string, userAgent = 'Mozilla/5.0 (Linux; Android 14)') {
  const request = new NextRequest(`https://rounds.test/link/${token}`, {
    headers: { 'user-agent': userAgent },
  });
  const response = await scanLink(request, { params: Promise.resolve({ token }) });
  return {
    location: new URL(response.headers.get('location')!),
    sessionCookie: response.cookies.get('dr_session')?.value ?? null,
  };
}

beforeEach(async () => {
  await migrateTestDb();
});

describe('device link codes', () => {
  it('signs the scanning device in to the account that minted the code', async () => {
    const { user } = await member();

    const link = await mintDeviceLink(user.id);
    const redeemed = await redeemDeviceLink(link.token, 'Mozilla/5.0 (Linux; Android 14)');

    expect(redeemed).toEqual({ ok: true, userId: user.id });
  });

  it('stores only a hash, never the code itself', async () => {
    const { user } = await member();
    const link = await mintDeviceLink(user.id);

    const [row] = await db
      .select()
      .from(schema.deviceLinkCodes)
      .where(eq(schema.deviceLinkCodes.id, link.id));

    expect(row!.tokenHash).not.toBe(link.token);
    expect(row!.tokenHash).toHaveLength(64);
  });

  it('works exactly once — a second scan of the same code is refused', async () => {
    const { user } = await member();
    const link = await mintDeviceLink(user.id);

    await redeemDeviceLink(link.token);
    const second = await redeemDeviceLink(link.token);

    expect(second).toEqual({ ok: false, reason: 'already-used' });
  });

  it('refuses two simultaneous scans of the same code', async () => {
    const { user } = await member();
    const link = await mintDeviceLink(user.id);

    // The race the conditional UPDATE exists for. Exactly one may win.
    const results = await Promise.all([redeemDeviceLink(link.token), redeemDeviceLink(link.token)]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it('refuses a code that has run out', async () => {
    const { user } = await member();
    const link = await mintDeviceLink(user.id);
    await expire(link.id);

    expect(await redeemDeviceLink(link.token)).toEqual({ ok: false, reason: 'expired' });
  });

  it('refuses a code it has never seen', async () => {
    expect(await redeemDeviceLink('not-a-real-code')).toEqual({ ok: false, reason: 'unknown' });
  });

  it('retires the previous code when a new one is asked for', async () => {
    const { user } = await member();

    const first = await mintDeviceLink(user.id);
    const second = await mintDeviceLink(user.id);

    // The QR that was on screen a moment ago must stop working the instant it is replaced,
    // because it may still be on that screen — or in a screenshot of it.
    expect(await redeemDeviceLink(first.token)).toEqual({ ok: false, reason: 'unknown' });
    expect(await redeemDeviceLink(second.token)).toEqual({ ok: true, userId: user.id });
  });

  it('reports the pairing back to the device still showing the code', async () => {
    const { user } = await member();
    const link = await mintDeviceLink(user.id);

    expect(await deviceLinkStatus(link.id, user.id)).toEqual({ status: 'pending', device: null });

    await redeemDeviceLink(link.token, 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');

    expect(await deviceLinkStatus(link.id, user.id)).toEqual({
      status: 'linked',
      device: 'iPhone',
    });
  });

  it('will not let one account watch another account’s code', async () => {
    const { cohort } = await createTestCohort();
    const owner = await createTestMember(cohort.id);
    const stranger = await createTestMember(cohort.id);

    const link = await mintDeviceLink(owner.user.id);

    // Indistinguishable from a code that never existed, which is the point.
    expect(await deviceLinkStatus(link.id, stranger.user.id)).toEqual({
      status: 'expired',
      device: null,
    });
  });

  it('adds a session rather than replacing the one the first device holds', async () => {
    const { user } = await member();

    // The laptop signs in, then the phone does — which is what redeeming a code amounts to.
    const laptop = await issueSession(user.id);
    const phone = await issueSession(user.id);

    const sessions = await db
      .select()
      .from(schema.authSessions)
      .where(eq(schema.authSessions.userId, user.id));

    expect(sessions).toHaveLength(2);
    expect(laptop.value).not.toBe(phone.value);
  });

  it('clears out sessions that have expired, and only those', async () => {
    const { user } = await member();

    await db.insert(schema.authSessions).values({
      userId: user.id,
      tokenHash: 'long-dead-session',
      expiresAt: new Date(Date.now() - 86_400_000),
    });
    const live = await issueSession(user.id);
    await issueSession(user.id);

    const sessions = await db
      .select()
      .from(schema.authSessions)
      .where(eq(schema.authSessions.userId, user.id));

    expect(sessions).toHaveLength(2);
    expect(sessions.map((s) => s.tokenHash)).not.toContain('long-dead-session');
    expect(live.options.expires.getTime()).toBeGreaterThan(Date.now());
  });

  it('sends a scanning phone to the half of the product its owner belongs in', async () => {
    const { cohort } = await createTestCohort();
    const student = await createTestMember(cohort.id);
    const admin = await createTestMember(cohort.id, { role: 'admin' });

    // Onboarding is what the student dashboard assumes has happened; both seeded members
    // start before it, so say so explicitly rather than lean on the fixture.
    await db
      .update(schema.users)
      .set({ onboardingCompletedAt: new Date() })
      .where(eq(schema.users.id, student.user.id));

    const studentScan = await scan((await mintDeviceLink(student.user.id)).token);
    expect(studentScan.location.pathname).toBe('/today');
    expect(studentScan.sessionCookie).toBeTruthy();

    // A cohort lead scanning from the ward wants the console, not the student app.
    const adminScan = await scan((await mintDeviceLink(admin.user.id)).token);
    expect(adminScan.location.pathname).toBe('/admin');
    expect(adminScan.sessionCookie).toBeTruthy();
  });

  it('carries a half-onboarded student back to onboarding rather than an empty dashboard', async () => {
    const { user } = await member();

    const { location } = await scan((await mintDeviceLink(user.id)).token);

    expect(location.pathname).toBe('/onboarding');
  });

  it('sends a refused scan to the login screen, with the reason and no session', async () => {
    const { user } = await member();
    const link = await mintDeviceLink(user.id);
    await scan(link.token);

    const second = await scan(link.token);

    expect(second.location.pathname).toBe('/login');
    expect(second.location.searchParams.get('link')).toBe('already-used');
    expect(second.sessionCookie).toBeNull();
  });

  it('records what redeemed a code, so the desktop can name the device', async () => {
    const { user } = await member();
    const link = await mintDeviceLink(user.id);

    await scan(link.token, 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');

    expect(await deviceLinkStatus(link.id, user.id)).toEqual({
      status: 'linked',
      device: 'iPhone',
    });
  });

  it('names only the platforms it is sure about', () => {
    expect(describeDevice('Mozilla/5.0 (iPhone)')).toBe('iPhone');
    expect(describeDevice('Mozilla/5.0 (Linux; Android 14)')).toBe('Android');
    expect(describeDevice('curl/8.4.0')).toBeNull();
    expect(describeDevice(null)).toBeNull();
  });
});
