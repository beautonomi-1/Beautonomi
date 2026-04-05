/**
 * Signed refresh token for Sumsub embed flow (mobile WebView).
 *
 * Supports both provider (type="provider") and customer/user (type="user") entities.
 * Backward-compatible: tokens without a `t` field are treated as type="provider".
 */

import { createHmac } from "crypto";

const SECRET = process.env.SUMSUB_EMBED_REFRESH_SECRET || "";
if (!SECRET && process.env.NODE_ENV === "production") {
  console.error("SUMSUB_EMBED_REFRESH_SECRET is required in production");
}
const TTL_SEC = 15 * 60; // 15 minutes

export type EmbedEntityType = "provider" | "user";

function base64UrlEncode(buf: Buffer): string {
  return buf.toString("base64url");
}

function base64UrlDecode(str: string): Buffer {
  return Buffer.from(str, "base64url");
}

export function createEmbedRefreshToken(
  entityId: string,
  environment: string,
  type: EmbedEntityType = "provider"
): string {
  const exp = Math.floor(Date.now() / 1000) + TTL_SEC;
  const payload = JSON.stringify({ p: entityId, env: environment, exp, t: type });
  const payloadB64 = base64UrlEncode(Buffer.from(payload, "utf8"));
  const sig = createHmac("sha256", SECRET).update(payload).digest();
  const sigB64 = base64UrlEncode(sig);
  return `${payloadB64}.${sigB64}`;
}

export function verifyEmbedRefreshToken(
  token: string
): { entityId: string; environment: string; type: EmbedEntityType } | null {
  if (!SECRET) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  let payload: { p?: string; env?: string; exp?: number; t?: string };
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64).toString("utf8"));
  } catch {
    return null;
  }
  const payloadStr = JSON.stringify({ p: payload.p, env: payload.env, exp: payload.exp, t: payload.t });
  const expectedSig = createHmac("sha256", SECRET).update(payloadStr).digest();
  const actualSig = base64UrlDecode(sigB64);
  if (expectedSig.length !== actualSig.length || !expectedSig.equals(actualSig)) return null;
  if (!payload.p || typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }
  return {
    entityId: payload.p,
    environment: payload.env || "production",
    type: (payload.t as EmbedEntityType | undefined) ?? "provider",
  };
}

// ─── Backward-compat aliases ──────────────────────────────────────────────────

/** @deprecated Use createEmbedRefreshToken with type="provider" */
export function createProviderEmbedRefreshToken(providerId: string, environment: string): string {
  return createEmbedRefreshToken(providerId, environment, "provider");
}

/** @deprecated Use verifyEmbedRefreshToken */
export function verifyProviderEmbedRefreshToken(
  token: string
): { providerId: string; environment: string } | null {
  const result = verifyEmbedRefreshToken(token);
  if (!result || result.type !== "provider") return null;
  return { providerId: result.entityId, environment: result.environment };
}
