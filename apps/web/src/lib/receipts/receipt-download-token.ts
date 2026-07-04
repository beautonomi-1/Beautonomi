/**
 * §Provider-launch (audit 2026-04): short-lived HMAC-signed tokens for
 * authenticated receipt/invoice PDF downloads from the native provider app.
 *
 * Why: Expo RN cannot trivially send `Authorization: Bearer` with
 * `Linking.openURL` or a system PDF viewer. Instead, the app makes an
 * authenticated request to mint a ~5-minute signed URL and opens that.
 *
 * Scope (kind):
 *   - `provider_booking_receipt` — provider-facing receipt PDF for a booking
 *   - `provider_group_booking_receipt` — provider-facing aggregate group booking receipt PDF
 *   - `customer_booking_receipt` — customer-facing receipt PDF
 *   - `provider_invoice`         — provider invoice PDF
 *   - `customer_order_receipt`   — customer-facing product order receipt PDF
 *   - `provider_order_receipt`   — provider-facing product order receipt PDF
 *   - `provider_ads_receipt`     — provider-facing ads budget order receipt PDF
 *   - `provider_subscription_receipt` — provider-facing subscription payment receipt PDF (keyed on finance_transactions.id)
 *
 * The token binds: kind + subject id (booking/invoice/order) + user id (who
 * minted it) + expiry. Tampering with any of those breaks the signature.
 */

import { createHmac, timingSafeEqual } from "crypto";

export type ReceiptTokenKind =
  | "provider_booking_receipt"
  | "provider_group_booking_receipt"
  | "customer_booking_receipt"
  | "provider_invoice"
  | "customer_order_receipt"
  | "provider_order_receipt"
  | "provider_ads_receipt"
  | "provider_subscription_receipt"
  | "provider_terminal_order_receipt";

export interface ReceiptTokenPayload {
  kind: ReceiptTokenKind;
  subjectId: string; // booking id or invoice id
  userId: string; // who minted the token (for audit)
  exp: number; // unix seconds
}

const DEFAULT_TTL_SECONDS = 5 * 60;

/**
 * True when `mintReceiptDownloadToken` will succeed (secret present in env).
 * Use in API routes to return a structured error instead of throwing through `handleApiError`.
 */
export function hasReceiptDownloadSigningSecret(): boolean {
  return Boolean(
    process.env.RECEIPT_DOWNLOAD_TOKEN_SECRET?.trim() ||
      process.env.RETENTION_LINK_SECRET?.trim(),
  );
}

/**
 * Absolute origin (no trailing slash) for links returned to native apps.
 * Prefer `NEXT_PUBLIC_APP_URL`; on Vercel previews `VERCEL_URL` is often set when the public URL env is missing.
 */
export function resolveReceiptDownloadOrigin(): string {
  const fromEnv = (process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    const host = vercel.replace(/^https?:\/\//, "").replace(/\/$/, "");
    return `https://${host}`;
  }
  return "";
}

function getSecret(): string {
  const s =
    process.env.RECEIPT_DOWNLOAD_TOKEN_SECRET?.trim() ||
    process.env.RETENTION_LINK_SECRET?.trim(); // dev fallback only
  if (!s) {
    throw new Error("RECEIPT_DOWNLOAD_TOKEN_SECRET is not configured");
  }
  return s;
}

function signPayload(p: ReceiptTokenPayload): string {
  const secret = getSecret();
  const basis = `${p.kind}|${p.subjectId}|${p.userId}|${p.exp}`;
  return createHmac("sha256", secret).update(basis).digest("base64url");
}

export function mintReceiptDownloadToken(
  input: { kind: ReceiptTokenKind; subjectId: string; userId: string; ttlSeconds?: number },
): string {
  const exp =
    Math.floor(Date.now() / 1000) + (input.ttlSeconds ?? DEFAULT_TTL_SECONDS);
  const payload: ReceiptTokenPayload = {
    kind: input.kind,
    subjectId: input.subjectId,
    userId: input.userId,
    exp,
  };
  const sig = signPayload(payload);
  const body = { ...payload, sig };
  return Buffer.from(JSON.stringify(body), "utf8").toString("base64url");
}

/**
 * Build an absolute, signed provider subscription receipt URL suitable for
 * embedding in an email (no session available at webhook time). The token is
 * bound to the finance transaction + the provider's user id and expires after
 * `ttlDays` (default 90) — long enough that the emailed link stays useful, but
 * still time-bound. Returns `null` when the signing secret or public origin is
 * not configured (so callers can silently omit the link rather than throw).
 */
export function buildProviderSubscriptionReceiptUrl(input: {
  financeTxId: string;
  userId: string;
  ttlDays?: number;
}): string | null {
  if (!hasReceiptDownloadSigningSecret()) return null;
  const origin = resolveReceiptDownloadOrigin();
  if (!origin) return null;
  const ttlSeconds = Math.max(1, Math.floor(input.ttlDays ?? 90)) * 24 * 60 * 60;
  const token = mintReceiptDownloadToken({
    kind: "provider_subscription_receipt",
    subjectId: input.financeTxId,
    userId: input.userId,
    ttlSeconds,
  });
  return `${origin}/api/provider/subscription/receipts/${encodeURIComponent(
    input.financeTxId,
  )}/pdf?token=${encodeURIComponent(token)}`;
}

/**
 * Build a signed terminal order receipt URL (for email or in-app download).
 */
export function buildProviderTerminalOrderReceiptUrl(input: {
  terminalOrderId: string;
  userId: string;
  ttlDays?: number;
}): string | null {
  if (!hasReceiptDownloadSigningSecret()) return null;
  const origin = resolveReceiptDownloadOrigin();
  if (!origin) return null;
  const ttlSeconds = Math.max(1, Math.floor(input.ttlDays ?? 90)) * 24 * 60 * 60;
  const token = mintReceiptDownloadToken({
    kind: "provider_terminal_order_receipt",
    subjectId: input.terminalOrderId,
    userId: input.userId,
    ttlSeconds,
  });
  return `${origin}/api/provider/terminal-orders/${encodeURIComponent(
    input.terminalOrderId,
  )}/receipt/pdf?token=${encodeURIComponent(token)}`;
}

export function parseReceiptDownloadToken(
  token: string,
  expect: { kind: ReceiptTokenKind; subjectId: string },
): ReceiptTokenPayload | null {
  try {
    const json = Buffer.from(token, "base64url").toString("utf8");
    const data = JSON.parse(json) as ReceiptTokenPayload & { sig?: string };
    if (!data.kind || !data.subjectId || !data.userId || !data.exp || !data.sig) {
      return null;
    }
    if (data.kind !== expect.kind) return null;
    if (data.subjectId !== expect.subjectId) return null;
    if (data.exp < Math.floor(Date.now() / 1000)) return null;

    const expected = signPayload({
      kind: data.kind,
      subjectId: data.subjectId,
      userId: data.userId,
      exp: data.exp,
    });
    const a = Buffer.from(data.sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    return {
      kind: data.kind,
      subjectId: data.subjectId,
      userId: data.userId,
      exp: data.exp,
    };
  } catch {
    return null;
  }
}
