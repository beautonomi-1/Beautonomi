/**
 * Signed refresh token for Sumsub embed flow (mobile WebView).
 * Allows the embed page to get new Sumsub access tokens without Bearer auth.
 */

import { createHmac } from "crypto";

const SECRET = process.env.SUMSUB_EMBED_REFRESH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const TTL_SEC = 15 * 60; // 15 minutes

function base64UrlEncode(buf: Buffer): string {
  return buf.toString("base64url");
}

function base64UrlDecode(str: string): Buffer {
  return Buffer.from(str, "base64url");
}

export function createEmbedRefreshToken(providerId: string, environment: string): string {
  const exp = Math.floor(Date.now() / 1000) + TTL_SEC;
  const payload = JSON.stringify({ p: providerId, env: environment, exp });
  const payloadB64 = base64UrlEncode(Buffer.from(payload, "utf8"));
  const sig = createHmac("sha256", SECRET).update(payload).digest();
  const sigB64 = base64UrlEncode(sig);
  return `${payloadB64}.${sigB64}`;
}

export function verifyEmbedRefreshToken(token: string): { providerId: string; environment: string } | null {
  if (!SECRET) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  let payload: { p?: string; env?: string; exp?: number };
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64).toString("utf8"));
  } catch {
    return null;
  }
  const payloadStr = JSON.stringify({ p: payload.p, env: payload.env, exp: payload.exp });
  const expectedSig = createHmac("sha256", SECRET).update(payloadStr).digest();
  const actualSig = base64UrlDecode(sigB64);
  if (expectedSig.length !== actualSig.length || !expectedSig.equals(actualSig)) return null;
  if (!payload.p || typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }
  return { providerId: payload.p, environment: payload.env || "production" };
}
