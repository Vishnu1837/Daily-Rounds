import 'server-only';

/**
 * Transactional mail, over Resend's HTTP API.
 *
 * Deliberately a `fetch` call rather than a provider SDK. The only thing the app sends is
 * a password reset, the endpoint is one POST, and a dependency whose whole surface we use
 * three fields of is not worth the install. If a second kind of mail ever arrives, this is
 * the one place that changes.
 *
 * Nothing here throws. A mail provider is an external service that can be down, rate
 * limited, or simply unconfigured, and none of those are reasons to fail the request that
 * triggered the send — the caller decides what the reader is told. So the outcome comes
 * back as a value.
 */

export type MailResult =
  | { status: 'sent'; id: string }
  /** No API key in the environment. Expected in local development. */
  | { status: 'not-configured' }
  | { status: 'failed'; reason: string };

export type Mail = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

/*
 * Both settings are read per call rather than captured at module load.
 *
 * `MAIL_FROM` is the From address, and Resend only sends from a domain verified in its
 * dashboard — so it has to be configured rather than guessed, since a plausible-looking
 * default would be rejected at the provider and look like a silent failure here.
 */
export async function sendMail(mail: Mail): Promise<MailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!apiKey || !from) return { status: 'not-configured' };

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [mail.to],
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      }),
    });

    if (!response.ok) {
      // The body carries Resend's own explanation — an unverified domain, a bad key. Worth
      // keeping in the log, because the caller deliberately shows the reader nothing.
      const detail = await response.text().catch(() => '');
      return { status: 'failed', reason: `${response.status} ${detail}`.trim() };
    }

    const body = (await response.json()) as { id?: string };
    return { status: 'sent', id: body.id ?? 'unknown' };
  } catch (error) {
    return { status: 'failed', reason: error instanceof Error ? error.message : 'network error' };
  }
}
