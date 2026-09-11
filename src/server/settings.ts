import 'server-only';

/**
 * The Gemini API key, from the deployment's environment and nowhere else.
 *
 * Set `GEMINI_API_KEY` in `.env.local` for development and in the Vercel project's
 * environment variables for production. Nothing here ever returns the key to a browser;
 * `geminiKeyState` is what the admin screen is allowed to see.
 */

/** The key the Gemini client should use, or null when the deployment has not set one. */
export async function geminiApiKey(): Promise<string | null> {
  return process.env.GEMINI_API_KEY?.trim() || null;
}

export type GeminiKeyState = {
  configured: boolean;
  /** The last four characters, so an admin can tell which key is in there. Never more. */
  hint: string | null;
};

export async function geminiKeyState(): Promise<GeminiKeyState> {
  const key = await geminiApiKey();
  return { configured: key !== null, hint: key ? key.slice(-4) : null };
}
