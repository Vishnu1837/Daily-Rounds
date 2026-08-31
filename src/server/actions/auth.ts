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

export type ActionState = {
  ok?: boolean;
  message?: string;
  errors?: Record<string, string>;
  /** Only populated in development, where there is no mail provider wired up. */
  devResetUrl?: string;
};

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export async function signUpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
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
  redirect(user.role === 'admin' ? '/admin' : '/');
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
    .select({ id: users.id })
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

  const url = `/reset-password?token=${token}`;

  // No mail provider is part of the MVP. In development the link is surfaced directly so
  // the flow is fully usable; in production it is logged for the operator to relay.
  if (process.env.NODE_ENV === 'production') {
    console.info(`[daily-rounds] password reset requested for user ${user.id}: ${url}`);
    return generic;
  }
  return { ...generic, devResetUrl: url };
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
