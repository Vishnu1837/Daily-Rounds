'use server';

import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { redirect } from 'next/navigation';

import { db } from '@/db/client';
import { passwordResetTokens, users } from '@/db/schema';
import { generateToken, hashPassword, verifyPassword } from '@/lib/auth/password';
import { createSession, destroySession, getCurrentUser } from '@/lib/auth/session';
import {
  changePasswordSchema,
  fieldErrors,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signUpSchema,
} from '@/lib/validation';
import { createHash } from 'node:crypto';
import { passwordResetMail } from '@/lib/mail/templates';
import { sendMail } from '@/lib/mail/send';
import { absoluteUrl } from '@/lib/url';
import { homeForRole } from '@/lib/routes';
import { PUBLIC_SIGNUP_OPEN } from '@/lib/site';

export type ActionState = {
  ok?: boolean;
  message?: string;
  errors?: Record<string, string>;
  /** Only populated in development, and only when no mail provider is configured. */
  devResetUrl?: string;
};

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export async function signUpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  /*
   * Public registration is closed, and this is where that is enforced.
   *
   * The route redirects and the link is gone, but neither of those stops a POST to this
   * action — it is a server action with a stable id, reachable by anyone who has ever
   * loaded the page. Refusing here is what actually closes signup; the UI changes only
   * spare honest visitors a dead end. Admin-created accounts do not come through here.
   */
  if (!PUBLIC_SIGNUP_OPEN) {
    return {
      message:
        'Registration is closed. Join the waitlist and the cohort lead will be in touch when a place opens up.',
    };
  }

  const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const { fullName, email, password } = parsed.data;

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);

  if (existing.length > 0) {
    return { errors: { email: 'An account with that email already exists. Try signing in.' } };
  }

  const [created] = await db
    .insert(users)
    .values({
      email,
      fullName,
      passwordHash: await hashPassword(password),
      avatarSeed: fullName.split(' ')[0]?.toLowerCase() ?? 'dr',
    })
    .returning({ id: users.id });

  if (!created) return { message: 'We could not create your account. Please try again.' };

  await createSession(created.id);
  redirect('/onboarding');
}

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const { email, password } = parsed.data;

  const rows = await db
    .select({ id: users.id, passwordHash: users.passwordHash, role: users.role })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);

  const user = rows[0];
  // Always run a hash comparison so a missing account and a wrong password take the same
  // time, and never reveal which one it was.
  const valid = user
    ? await verifyPassword(password, user.passwordHash)
    : await verifyPassword(password, await hashPassword('placeholder-timing-guard'));

  if (!user || !valid) {
    return { message: 'That email and password do not match. Please try again.' };
  }

  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  await createSession(user.id);
  redirect(homeForRole(user.role));
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect('/login');
}

export async function forgotPasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = forgotPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const rows = await db
    .select({ id: users.id, email: users.email, fullName: users.fullName })
    .from(users)
    .where(sql`lower(${users.email}) = ${parsed.data.email}`)
    .limit(1);

  // The response is identical whether or not the account exists.
  const generic: ActionState = {
    ok: true,
    message:
      'If an account exists for that email, a reset link is on its way. Check your inbox and spam folder.',
  };

  const user = rows[0];
  if (!user) return generic;

  const token = generateToken();
  await db.insert(passwordResetTokens).values({
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });

  // Absolute, because this is read in a mail client rather than in the browser that asked
  // for it, where a bare path resolves against the wrong host or against nothing.
  const url = await absoluteUrl(`/reset-password?token=${token}`);

  const sent = await sendMail(
    passwordResetMail({ to: user.email, name: firstName(user.fullName), url }),
  );

  /*
   * What the reader is told never depends on what happened here.
   *
   * `generic` is returned for a missing account, a successful send and a provider outage
   * alike. Reporting a delivery failure would answer the question the generic response
   * exists to refuse — "does this address have an account?" — since only a real account
   * ever reaches a send at all.
   *
   * The operator still needs to know, so failures are logged. The link is not: it is a
   * bearer credential for the account, and application logs are the wrong place to keep
   * one.
   */
  if (sent.status === 'failed') {
    console.error(`[daily-rounds] reset mail failed for user ${user.id}: ${sent.reason}`);
  }

  // With no provider configured there is nowhere for the link to go, so development shows
  // it on the page and the flow stays usable end to end. Never in production: that would
  // hand the link to whoever typed the address.
  if (sent.status === 'not-configured' && process.env.NODE_ENV !== 'production') {
    return { ...generic, devResetUrl: url };
  }

  /*
   * Nowhere to send it, in production. The link goes to the log so the cohort lead can
   * relay it by hand and a student is not simply stranded.
   *
   * This is a stopgap and reads like one. A reset link is a bearer credential for the
   * account, and application logs are a poor place to keep one — but it is what this app
   * did before it could send mail at all, and dropping it while no provider is configured
   * would remove the only recovery path that exists. Once RESEND_API_KEY and MAIL_FROM are
   * set this branch is unreachable, and the credential stops being logged.
   */
  if (sent.status === 'not-configured') {
    console.error(
      `[daily-rounds] no mail provider configured; reset link for user ${user.id}: ${url}`,
    );
  }

  return generic;
}

/** Mail opens on a first name; the stored value is the full one. */
function firstName(fullName: string): string | null {
  return fullName.trim().split(/\s+/)[0] || null;
}

export async function resetPasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = resetPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const { token, password } = parsed.data;

  const rows = await db
    .select({ id: passwordResetTokens.id, userId: passwordResetTokens.userId })
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.tokenHash, hashToken(token)),
        gt(passwordResetTokens.expiresAt, new Date()),
        isNull(passwordResetTokens.usedAt),
      ),
    )
    .limit(1);

  const record = rows[0];
  if (!record) {
    return { message: 'That reset link has expired or already been used. Request a new one.' };
  }

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(password), updatedAt: new Date() })
    .where(eq(users.id, record.userId));

  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokens.id, record.id));

  return { ok: true, message: 'Your password has been reset. You can sign in now.' };
}

export async function changePasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { message: 'Your session has expired. Please sign in again.' };

  const parsed = changePasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const rows = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  const current = rows[0];
  if (!current || !(await verifyPassword(parsed.data.currentPassword, current.passwordHash))) {
    return { errors: { currentPassword: 'That is not your current password.' } };
  }

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(parsed.data.password), updatedAt: new Date() })
    .where(eq(users.id, user.id));

  return { ok: true, message: 'Password updated.' };
}
