-- Signing in on a second device by showing it a code, instead of typing a password again.
--
-- Two things meet here. The first is that a session has never been exclusive: `auth_sessions`
-- has always been one row per sign-in, and nothing has ever deleted a user's other rows when
-- a new one appeared. A student signed in on a laptop and a phone at once already worked —
-- it simply had no route to it except entering the password twice, on a phone keyboard, for
-- an account whose password they set once in August.
--
-- The second is that route. The desktop asks for a code, shows it as a QR, and the phone
-- that scans it is signed in to the same account. The code is what crosses the gap, and it
-- is a bearer credential for the account for as long as it lives — anyone holding it becomes
-- that student. So it is built to be worth very little:
--
--   * short-lived, a couple of minutes, because it only has to survive one camera;
--   * single-use, enforced by the `consumed_at IS NULL` predicate on the redeeming UPDATE
--     rather than by a read-then-write the second scanner could slip between;
--   * stored as a SHA-256 hash, so a dump of this table hands nobody a working code — the
--     same reason `auth_sessions` stores `token_hash` and not the token.
--
-- Nothing here grants more than the account it names. A redeemed code makes an ordinary
-- session row, with the ordinary lifetime; the code itself is spent the moment it works.
CREATE TABLE IF NOT EXISTS "device_link_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token_hash" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  -- When the code was spent, and by what. NULL means it is still live. The user agent is
  -- kept so the desktop can say "signed in on Android" rather than a bare tick, and so a
  -- student who sees a device they do not recognise has something to go on.
  "consumed_at" timestamptz,
  "consumed_user_agent" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- Unique because the lookup is by hash and a collision would be an ambiguous credential.
CREATE UNIQUE INDEX IF NOT EXISTS "device_link_codes_token_idx"
  ON "device_link_codes" ("token_hash");

-- Minting sweeps the asker's own dead codes; polling reads back the one just minted.
CREATE INDEX IF NOT EXISTS "device_link_codes_user_idx"
  ON "device_link_codes" ("user_id");
