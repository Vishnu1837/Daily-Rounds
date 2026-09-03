import 'server-only';

import { SITE } from '@/lib/site';

import type { Mail } from './send';

const RESET_WINDOW = 'one hour';

/**
 * The password reset mail.
 *
 * Written as inline-styled HTML with a plain-text twin. Mail clients strip `<style>` blocks
 * and stylesheets, and a fair share of students will read this in an app that shows the
 * text part only, so both are first-class rather than the text being an afterthought.
 *
 * The URL must already be absolute — see `absoluteUrl`. A relative path is meaningless
 * once it has left the app.
 */
export function passwordResetMail({
  to,
  name,
  url,
}: {
  to: string;
  name: string | null;
  url: string;
}): Mail {
  const greeting = name ? `Hi ${name},` : 'Hi,';

  const text = [
    greeting,
    '',
    `Someone asked to reset the password for your ${SITE.name} account.`,
    'Open this link to choose a new one:',
    '',
    url,
    '',
    `The link works once and expires in ${RESET_WINDOW}.`,
    '',
    "If this wasn't you, ignore this email — your password stays as it is.",
    '',
    `— ${SITE.lockup}`,
  ].join('\n');

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#16181d;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:14px;padding:32px;">
      <tr><td>
        <p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6b7280;">Account recovery</p>
        <h1 style="margin:0 0 16px;font-size:22px;font-weight:800;">Reset your password</h1>
        <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">${escapeHtml(greeting)}</p>
        <p style="margin:0 0 20px;font-size:15px;line-height:1.6;">
          Someone asked to reset the password for your ${escapeHtml(SITE.name)} account.
          Choose a new one here:
        </p>
        <p style="margin:0 0 20px;">
          <a href="${escapeHtml(url)}" style="display:inline-block;background:#16181d;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 22px;border-radius:10px;">Set a new password</a>
        </p>
        <p style="margin:0 0 20px;font-size:13px;line-height:1.6;color:#6b7280;">
          The link works once and expires in ${RESET_WINDOW}. If the button does not work,
          paste this into your browser:<br>
          <span style="word-break:break-all;color:#374151;">${escapeHtml(url)}</span>
        </p>
        <p style="margin:0 0 20px;font-size:13px;line-height:1.6;color:#6b7280;">
          If this wasn't you, ignore this email — your password stays as it is.
        </p>
        <p style="margin:0;font-size:13px;color:#9ca3af;">— ${escapeHtml(SITE.lockup)}</p>
      </td></tr>
    </table>
  </body>
</html>`;

  return { to, subject: `Reset your ${SITE.name} password`, html, text };
}

/** The name comes from user input, and this lands in a document the reader's client parses. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
