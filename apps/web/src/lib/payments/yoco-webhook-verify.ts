import crypto from "crypto";

const WEBHOOK_TOLERANCE_SEC = 180;

function signatureCandidates(signature: string): string[] {
  const raw = signature.trim();
  if (!raw) return [];
  const candidates = new Set<string>([raw]);
  if (raw.startsWith("sha256=")) candidates.add(raw.slice("sha256=".length));
  for (const part of raw.split(",")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (value && ["v1", "signature", "sig", "s"].includes(key)) {
      candidates.add(value);
    }
  }
  for (const part of raw.split(/\s+/)) {
    const trimmed = part.trim();
    if (trimmed.startsWith("v1,")) candidates.add(trimmed.slice(3));
  }
  return [...candidates].filter(Boolean);
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

/** Legacy Checkout / early Yoco: HMAC-SHA256 of raw body (hex or base64). */
export function verifyYocoLegacyBodyHmac(
  body: string,
  signature: string,
  secret: string,
): boolean {
  const hexDigest = crypto.createHmac("sha256", secret).update(body).digest("hex");
  const base64Digest = crypto.createHmac("sha256", secret).update(body).digest("base64");
  return signatureCandidates(signature).some(
    (candidate) =>
      timingSafeStringEqual(candidate, hexDigest) ||
      timingSafeStringEqual(candidate.toLowerCase(), hexDigest) ||
      timingSafeStringEqual(candidate, base64Digest),
  );
}

function decodeYocoWebhookSecret(secret: string): Buffer | string {
  const trimmed = secret.trim();
  if (trimmed.startsWith("whsec_")) {
    return Buffer.from(trimmed.slice("whsec_".length), "base64");
  }
  return trimmed;
}

/**
 * Standard Webhooks scheme documented by Yoco: HMAC-SHA256 over
 * `{webhook-id}.{webhook-timestamp}.{body}`, base64-encoded, compared to v1 signatures.
 */
export function verifyYocoStandardWebhooksSignature(
  body: string,
  signatureHeader: string,
  secret: string,
  webhookId: string | null,
  webhookTimestamp: string | null,
): boolean {
  if (!webhookId?.trim() || !webhookTimestamp?.trim()) return false;
  const ts = Number(webhookTimestamp);
  if (!Number.isFinite(ts)) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - ts) > WEBHOOK_TOLERANCE_SEC) return false;

  const signedContent = `${webhookId.trim()}.${webhookTimestamp.trim()}.${body}`;
  const key = decodeYocoWebhookSecret(secret);
  const expected = crypto.createHmac("sha256", key).update(signedContent).digest("base64");

  return signatureCandidates(signatureHeader).some((candidate) =>
    timingSafeStringEqual(candidate, expected),
  );
}

export type YocoWebhookVerificationScheme = "standard_webhooks" | "legacy_body_hmac" | "none";

export function verifyYocoWebhookRequest(params: {
  body: string;
  signatureHeader: string;
  secret: string;
  webhookId: string | null;
  webhookTimestamp: string | null;
}): YocoWebhookVerificationScheme {
  const { body, signatureHeader, secret, webhookId, webhookTimestamp } = params;
  if (
    verifyYocoStandardWebhooksSignature(
      body,
      signatureHeader,
      secret,
      webhookId,
      webhookTimestamp,
    )
  ) {
    return "standard_webhooks";
  }
  if (verifyYocoLegacyBodyHmac(body, signatureHeader, secret)) {
    return "legacy_body_hmac";
  }
  return "none";
}
