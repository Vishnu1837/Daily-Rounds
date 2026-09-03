import { afterEach, describe, expect, it, vi } from 'vitest';

import { passwordResetMail } from '@/lib/mail/templates';
import { sendMail } from '@/lib/mail/send';

/**
 * The mail half of password recovery.
 *
 * Two things matter here and neither is the wording. The link has to survive the trip into
 * a mail client intact and escaped, and a provider that is missing or broken must never
 * turn into a thrown error inside the request that asked for the reset.
 */

const URL = 'https://dailyrounds360.com/reset-password?token=abc-123_XYZ';

describe('passwordResetMail', () => {
  it('carries the absolute link in both the HTML and the plain-text part', () => {
    const mail = passwordResetMail({ to: 'aisha@college.edu', name: 'Aisha', url: URL });

    expect(mail.to).toBe('aisha@college.edu');
    expect(mail.html).toContain(`href="${URL}"`);
    // Plenty of clients render text only; the link cannot live in the HTML alone.
    expect(mail.text).toContain(URL);
  });

  it('greets by name, and stays grammatical without one', () => {
    expect(passwordResetMail({ to: 'a@b.c', name: 'Aisha', url: URL }).text).toContain('Hi Aisha,');
    expect(passwordResetMail({ to: 'a@b.c', name: null, url: URL }).text).toContain('Hi,');
  });

  it('escapes a name that would otherwise be parsed as markup', () => {
    const mail = passwordResetMail({
      to: 'a@b.c',
      name: '<script>alert(1)</script>',
      url: URL,
    });

    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
  });

  it('never tells the reader whether the address had an account', () => {
    const mail = passwordResetMail({ to: 'a@b.c', name: null, url: URL });
    expect(mail.text).toContain("If this wasn't you");
  });
});

describe('sendMail', () => {
  const original = { key: process.env.RESEND_API_KEY, from: process.env.MAIL_FROM };

  afterEach(() => {
    process.env.RESEND_API_KEY = original.key;
    process.env.MAIL_FROM = original.from;
    vi.unstubAllGlobals();
  });

  const mail = { to: 'a@b.c', subject: 's', html: '<p>h</p>', text: 't' };

  it('reports an unconfigured provider rather than attempting a send', async () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.MAIL_FROM;

    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    expect(await sendMail(mail)).toEqual({ status: 'not-configured' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('turns a provider rejection into a value, not a throw', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.MAIL_FROM = 'Daily Rounds <no-reply@example.com>';

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('domain is not verified', { status: 403 })),
    );

    const result = await sendMail(mail);
    expect(result.status).toBe('failed');
    expect(result).toHaveProperty('reason', expect.stringContaining('403'));
  });

  it('survives the provider being unreachable', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.MAIL_FROM = 'Daily Rounds <no-reply@example.com>';

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );

    expect(await sendMail(mail)).toEqual({ status: 'failed', reason: 'ECONNREFUSED' });
  });

  it('returns the provider id on a successful send', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.MAIL_FROM = 'Daily Rounds <no-reply@example.com>';

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ id: 'msg_1' }, { status: 200 })),
    );

    expect(await sendMail(mail)).toEqual({ status: 'sent', id: 'msg_1' });
  });
});
