import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createSign } from "crypto";

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

function buildAppleClientSecret(params: {
  teamId: string;
  keyId: string;
  clientId: string;
  privateKeyPem: string;
}): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: params.keyId, typ: "JWT" };
  const payload = {
    iss: params.teamId,
    iat: now,
    exp: now + 60 * 60 * 24 * 180,
    aud: "https://appleid.apple.com",
    sub: params.clientId,
  };
  const encode = (obj: object) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const signingInput = `${encode(header)}.${encode(payload)}`;
  const sign = createSign("SHA256");
  sign.update(signingInput);
  sign.end();
  const signature = sign.sign({ key: params.privateKeyPem, dsaEncoding: "ieee-p1363" });
  return `${signingInput}.${Buffer.from(signature).toString("base64url")}`;
}

export function appleOAuthConfig(): {
  clientId: string;
  teamId: string;
  keyId: string;
  privateKeyPem: string;
} | null {
  const clientId = env("APPLE_SIGN_IN_CLIENT_ID") || env("APPLE_OAUTH_CLIENT_ID");
  const teamId = env("APPLE_SIGN_IN_TEAM_ID") || env("APPLE_TEAM_ID");
  const keyId = env("APPLE_SIGN_IN_KEY_ID") || env("APPLE_KEY_ID");
  const privateKeyPem = (env("APPLE_SIGN_IN_PRIVATE_KEY") || env("APPLE_PRIVATE_KEY")).replace(
    /\\n/g,
    "\n",
  );
  if (!clientId || !teamId || !keyId || !privateKeyPem) return null;
  return { clientId, teamId, keyId, privateKeyPem };
}

export async function exchangeAppleAuthorizationCode(
  authorizationCode: string,
): Promise<string | null> {
  const config = appleOAuthConfig();
  if (!config) return null;

  const clientSecret = buildAppleClientSecret(config);
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: clientSecret,
    code: authorizationCode,
    grant_type: "authorization_code",
  });

  const res = await fetch("https://appleid.apple.com/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.warn("[revoke-apple-sign-in] token exchange failed:", res.status, text.slice(0, 200));
    return null;
  }

  const json = (await res.json().catch(() => null)) as { refresh_token?: string } | null;
  return typeof json?.refresh_token === "string" && json.refresh_token ? json.refresh_token : null;
}

async function revokeAppleRefreshToken(refreshToken: string): Promise<boolean> {
  const config = appleOAuthConfig();
  if (!config) return false;

  const clientSecret = buildAppleClientSecret(config);
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: clientSecret,
    token: refreshToken,
    token_type_hint: "refresh_token",
  });

  const res = await fetch("https://appleid.apple.com/auth/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.warn("[revoke-apple-sign-in] Apple revoke failed:", res.status, text.slice(0, 200));
    return false;
  }
  return true;
}

function extractAppleRefreshToken(user: User): string | null {
  const appMeta = user.app_metadata as { apple_refresh_token?: unknown } | undefined;
  if (typeof appMeta?.apple_refresh_token === "string" && appMeta.apple_refresh_token.trim()) {
    return appMeta.apple_refresh_token.trim();
  }

  const identities = user.identities ?? [];
  for (const identity of identities) {
    if (identity.provider !== "apple") continue;
    const data = identity.identity_data as Record<string, unknown> | undefined;
    const refresh =
      (typeof data?.provider_refresh_token === "string" && data.provider_refresh_token) ||
      (typeof data?.refresh_token === "string" && data.refresh_token) ||
      null;
    if (refresh) return refresh;
  }
  return null;
}

/**
 * Best-effort Sign in with Apple token revocation when a user deletes their account.
 * Requires APPLE_SIGN_IN_* (or APPLE_OAUTH_*) env vars and a stored Apple refresh token.
 */
export async function revokeAppleSignInForAuthUser(
  admin: SupabaseClient,
  userId: string,
): Promise<void> {
  try {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data?.user) return;

    const refreshToken = extractAppleRefreshToken(data.user);
    if (!refreshToken) return;

    await revokeAppleRefreshToken(refreshToken);
  } catch (err) {
    console.warn("[revoke-apple-sign-in] skipped:", err);
  }
}
