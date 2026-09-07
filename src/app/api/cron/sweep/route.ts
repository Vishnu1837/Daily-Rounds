import { timingSafeEqual } from 'node:crypto';

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { runSweep } from '@/server/sweep';

/**
 * The scheduled sweep.
 *
 * There is no persistent server process in this deployment — every page and action is a
 * function invocation — so the two settlement jobs the app cannot finish on its own
 * (overdue focus rounds, study blocks nobody closed) need something outside a request to
 * call them. On Vercel that is a Cron Job, which issues an ordinary GET to this path on a
 * schedule declared in `vercel.json`. See docs/DEPLOYMENT.md for the exact configuration.
 *
 * Both sweeps are idempotent, so this endpoint is safe to call twice, to retry after a
 * timeout, and to overlap with the lazy per-student sweeps that already run on the grove and
 * study screens. Being safe to call twice is what makes it safe to schedule at all.
 *
 * ## Authentication
 *
 * The endpoint mutates cohort-wide data, so it is not public. It accepts a bearer token
 * matching `CRON_SECRET`, which is the header Vercel Cron sends automatically when that
 * variable is set on the project.
 *
 * Without `CRON_SECRET` configured the route refuses every request rather than falling open.
 * A sweep that anyone can trigger is a denial-of-service handle on the database, and — more
 * to the point here — an unauthenticated writer to the records the whole product's numbers
 * are derived from. Failing closed makes a missing secret show up as a sweep that never runs
 * (visible in `sweep_runs`, and on the admin system panel) rather than as one anybody can
 * run.
 *
 * The comparison is constant-time, so a wrong token cannot be narrowed down by timing it.
 */

/*
 * No `export const dynamic` here. This project runs with Next's Cache Components, which
 * rejects that segment config outright — and does not need it: the handler reads
 * `request.headers`, which makes it dynamic by construction. `npm run build` is what catches
 * a mistake like that, which is why it is part of the gate.
 */

function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;

  // `timingSafeEqual` throws on a length mismatch, which would itself leak the length.
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  if (!authorised(request)) {
    // Deliberately says nothing about whether the secret is unset or merely wrong.
    return NextResponse.json({ ok: false, error: 'Unauthorised' }, { status: 401 });
  }

  try {
    const result = await runSweep();
    return NextResponse.json({
      ok: true,
      runId: result.runId,
      treesGrown: result.treesGrown,
      sessionsClosed: result.sessionsClosed,
    });
  } catch (error) {
    /*
     * `runSweep` has already written the failure to `sweep_runs` before rethrowing, so the
     * admin panel shows it whether or not anyone reads this response. A 500 is what tells
     * the scheduler to retry.
     */
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Sweep failed' },
      { status: 500 },
    );
  }
}
