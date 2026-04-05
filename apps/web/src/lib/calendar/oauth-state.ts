/**
 * Encode/decode OAuth state for calendar callback with provider_id.
 * State is signed so the callback can trust provider_id without a server-side store.
 */

import { createHmac, randomBytes } from "crypto";

const STATE_SECRET =
  process.env.CALENDAR_OAUTH_STATE_SECRET ||
  process.env.NEXTAUTH_SECRET ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "calendar-oauth-state-dev";

const SEP = ".";
const TTL_MS = 10 * 60 * 1000; // 10 minutes

function base64UrlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string): Buffer {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/") + "==".slice(0, (3 - (str.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

export interface CalendarOAuthStatePayload {
  p: string; // provider_id
  n: string; // nonce
  t: number; // issued at (ms)
}

/**
 * Encode provider_id into a signed state param for OAuth redirect.
 */
export function encodeCalendarOAuthState(providerId: string): string {
  const nonce = randomBytes(12).toString("base64url");
  const payload: CalendarOAuthStatePayload = {
    p: providerId,
    n: nonce,
    t: Date.now(),
  };
  const payloadStr = JSON.stringify(payload);
  const payloadB64 = base64UrlEncode(Buffer.from(payloadStr, "utf8"));
  const sign = createHmac("sha256", STATE_SECRET).update(payloadB64).digest();
  const signB64 = base64UrlEncode(sign);
  return `${payloadB64}${SEP}${signB64}`;
}

/**
 * Decode and verify state; returns provider_id or null if invalid/expired.
 */
export function decodeCalendarOAuthState(state: string | null): string | null {
  if (!state || typeof state !== "string") return null;
  const idx = state.lastIndexOf(SEP);
  if (idx <= 0) return null;
  const payloadB64 = state.slice(0, idx);
  const signB64 = state.slice(idx + 1);
  const sign = base64UrlDecode(signB64);
  const expectedSign = createHmac("sha256", STATE_SECRET).update(payloadB64).digest();
  if (sign.length !== expectedSign.length || !sign.equals(expectedSign)) return null;
  let payload: CalendarOAuthStatePayload;
  try {
    const raw = base64UrlDecode(payloadB64).toString("utf8");
    payload = JSON.parse(raw) as CalendarOAuthStatePayload;
  } catch {
    return null;
  }
  if (!payload.p || typeof payload.p !== "string") return null;
  if (payload.t && Date.now() - payload.t > TTL_MS) return null;
  return payload.p;
}
