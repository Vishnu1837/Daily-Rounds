import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SessionUser } from '@/lib/auth/session';

/**
 * Authorization tests.
 *
 * The session lookup is mocked so we can assert the *decision* each guard makes for every
 * kind of caller. `redirect` and `notFound` are Next control-flow throws, so they are
 * stubbed with recognisable errors.
 */

const state: { user: SessionUser | null } = { user: null };

vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: async () => state.user,
  SESSION_COOKIE: 'dr_session',
}));

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));

const student: SessionUser = {
  id: 'user-student',
  email: 'student@test.local',
  fullName: 'Test Student',
  role: 'student',
  timezone: 'Asia/Kolkata',
  avatarSeed: 'test',
  avatarUrl: null,
  mbbsYear: 2,
  university: 'Test College',
  whatsapp: null,
  onboardingCompletedAt: new Date('2025-09-01T00:00:00Z'),
};

const admin: SessionUser = { ...student, id: 'user-admin', role: 'admin' };
const notOnboarded: SessionUser = { ...student, id: 'user-new', onboardingCompletedAt: null };

async function guards() {
  return import('@/lib/auth/guards');
}

beforeEach(() => {
  state.user = null;
});

describe('page guards', () => {
  it('sends a signed-out visitor to the login screen', async () => {
    const { requireUser } = await guards();
    await expect(requireUser()).rejects.toThrow('REDIRECT:/login');
  });

  it('lets a signed-in student through', async () => {
    state.user = student;
    const { requireUser } = await guards();
    await expect(requireUser()).resolves.toMatchObject({ id: 'user-student' });
  });

  it('forces an unfinished signup into onboarding', async () => {
    state.user = notOnboarded;
    const { requireOnboardedUser } = await guards();
    await expect(requireOnboardedUser()).rejects.toThrow('REDIRECT:/onboarding');
  });

  it('does not trap an admin in onboarding', async () => {
    state.user = { ...admin, onboardingCompletedAt: null };
    const { requireOnboardedUser } = await guards();
    await expect(requireOnboardedUser()).resolves.toMatchObject({ role: 'admin' });
  });
});

describe('admin page guard', () => {
  it('redirects a signed-out visitor to login, not to the admin console', async () => {
    const { requireAdmin } = await guards();
    await expect(requireAdmin()).rejects.toThrow('REDIRECT:/login');
  });

  it('bounces a student away from admin pages', async () => {
    state.user = student;
    const { requireAdmin } = await guards();
    await expect(requireAdmin()).rejects.toThrow('REDIRECT:/');
  });

  it('admits an admin', async () => {
    state.user = admin;
    const { requireAdmin } = await guards();
    await expect(requireAdmin()).resolves.toMatchObject({ role: 'admin' });
  });
});

describe('server action guards', () => {
  it('throws an authorization error rather than redirecting when signed out', async () => {
    const { requireUserAction, AuthorizationError } = await guards();
    await expect(requireUserAction()).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('refuses a student calling an admin-only action', async () => {
    state.user = student;
    const { requireAdminAction, AuthorizationError } = await guards();
    await expect(requireAdminAction()).rejects.toBeInstanceOf(AuthorizationError);
    await expect(requireAdminAction()).rejects.toThrow(/Administrator access/);
  });

  it('allows an admin to call an admin-only action', async () => {
    state.user = admin;
    const { requireAdminAction } = await guards();
    await expect(requireAdminAction()).resolves.toMatchObject({ role: 'admin' });
  });

  it('never leaks a role a caller does not have', async () => {
    state.user = student;
    const { requireUserAction } = await guards();
    const resolved = await requireUserAction();
    expect(resolved.role).toBe('student');
  });
});

describe('action error handling', () => {
  it('turns an authorization failure into a usable message, not a stack trace', async () => {
    const { guarded } = await import('@/server/actions/shared');
    const { AuthorizationError } = await guards();

    const result = await guarded(async () => {
      throw new AuthorizationError('Administrator access is required.');
    }, 'fallback');

    expect(result).toEqual({
      ok: false,
      message: 'Administrator access is required.',
      errors: undefined,
    });
  });

  it('returns the friendly fallback for an unexpected failure', async () => {
    const { guarded } = await import('@/server/actions/shared');
    const result = await guarded(async () => {
      throw new Error('connection reset by peer');
    }, "We couldn't save your check-in. Your points haven't been changed.");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe(
        "We couldn't save your check-in. Your points haven't been changed.",
      );
      // The raw error is never surfaced to the student.
      expect(result.message).not.toContain('connection reset');
    }
  });

  it('lets Next control-flow throws (redirect/notFound) pass through untouched', async () => {
    const { guarded } = await import('@/server/actions/shared');
    const digestError = Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT;/' });

    await expect(
      guarded(async () => {
        throw digestError;
      }, 'fallback'),
    ).rejects.toBe(digestError);
  });
});
