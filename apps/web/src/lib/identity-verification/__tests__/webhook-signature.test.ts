/**
 * Webhook signature verification tests — tests the REAL implementation against
 * Didit's documented canonical algorithms (https://docs.didit.me/integration/webhooks):
 *
 *   X-Signature-V2      → HMAC-SHA256(secret, canonicalJSON)  [sorted keys, compact, unicode]
 *   X-Signature         → HMAC-SHA256(secret, rawBodyBytes)
 *   X-Signature-Simple  → HMAC-SHA256(secret, "{ts}:{session_id}:{status}:{webhook_type}")
 *
 * DIDIT_WEBHOOK_SECRET is captured at module-load time, so we set it via
 * vi.hoisted (runs before the module import is evaluated).
 */

import { createHmac } from "crypto";
import { describe, it, expect, vi } from "vitest";

const WEBHOOK_SECRET = vi.hoisted(() => {
  process.env.DIDIT_WEBHOOK_SECRET = "test-webhook-secret-for-unit-tests";
  return "test-webhook-secret-for-unit-tests";
});

import { verifyDiditWebhookSignature } from "../provider/didit-provider";

// ── Canonical helpers mirroring the implementation ──────────────────────────
function sortKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(sortKeys);
  if (obj !== null && typeof obj === "object") {
    return Object.keys(obj as Record<string, unknown>).sort().reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = sortKeys((obj as Record<string, unknown>)[k]);
      return acc;
    }, {});
  }
  return obj;
}

const payloadObj = {
  event_id: "evt_1",
  webhook_type: "status.updated",
  session_id: "sess_1",
  status: "Approved",
  timestamp: 1774970000,
  decision: { name: "José", score: 95.4 },
};
const body = JSON.stringify(payloadObj);
const rawBodyBuffer = Buffer.from(body, "utf8");
const now = String(Math.floor(Date.now() / 1000));

function makeV2Sig(obj: unknown): string {
  const canonical = JSON.stringify(sortKeys(obj));
  return createHmac("sha256", WEBHOOK_SECRET).update(canonical, "utf8").digest("hex");
}
function makeRawSig(raw: Buffer): string {
  return createHmac("sha256", WEBHOOK_SECRET).update(raw).digest("hex");
}
function makeSimpleSig(obj: Record<string, unknown>): string {
  const canonical = [obj.timestamp ?? "", obj.session_id ?? "", obj.status ?? "", obj.webhook_type ?? ""].join(":");
  return createHmac("sha256", WEBHOOK_SECRET).update(canonical, "utf8").digest("hex");
}

describe("verifyDiditWebhookSignature", () => {
  // ─── V2 canonical ─────────────────────────────────────────────────────────
  it("accepts a valid V2 canonical signature", () => {
    const result = verifyDiditWebhookSignature({
      rawBody: rawBodyBuffer,
      signatureV2: makeV2Sig(payloadObj),
      signatureRaw: null,
      signatureSimple: null,
      timestamp: now,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.variant).toBe("v2");
  });

  it("accepts V2 even when the body key order differs (canonicalisation)", () => {
    // Signature computed over canonical form; body sent with different key order
    const reordered = JSON.stringify({
      status: "Approved",
      decision: { score: 95.4, name: "José" },
      timestamp: 1774970000,
      session_id: "sess_1",
      webhook_type: "status.updated",
      event_id: "evt_1",
    });
    const result = verifyDiditWebhookSignature({
      rawBody: Buffer.from(reordered, "utf8"),
      signatureV2: makeV2Sig(payloadObj),
      signatureRaw: null,
      signatureSimple: null,
      timestamp: now,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.variant).toBe("v2");
  });

  it("rejects a V2 signature with wrong secret", () => {
    const wrongSig = createHmac("sha256", "wrong-secret")
      .update(JSON.stringify(sortKeys(payloadObj)), "utf8")
      .digest("hex");
    const result = verifyDiditWebhookSignature({
      rawBody: rawBodyBuffer,
      signatureV2: wrongSig,
      signatureRaw: null,
      signatureSimple: null,
      timestamp: now,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a V2 signature with tampered body", () => {
    const tampered = Buffer.from(JSON.stringify({ ...payloadObj, status: "Declined" }), "utf8");
    const result = verifyDiditWebhookSignature({
      rawBody: tampered,
      signatureV2: makeV2Sig(payloadObj),
      signatureRaw: null,
      signatureSimple: null,
      timestamp: now,
    });
    expect(result.ok).toBe(false);
  });

  // ─── Raw body ─────────────────────────────────────────────────────────────
  it("accepts a raw-body HMAC (X-Signature)", () => {
    const result = verifyDiditWebhookSignature({
      rawBody: rawBodyBuffer,
      signatureV2: null,
      signatureRaw: makeRawSig(rawBodyBuffer),
      signatureSimple: null,
      timestamp: now,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.variant).toBe("raw");
  });

  // ─── Simple envelope ──────────────────────────────────────────────────────
  it("accepts a Simple envelope HMAC (X-Signature-Simple)", () => {
    const result = verifyDiditWebhookSignature({
      rawBody: rawBodyBuffer,
      signatureV2: null,
      signatureRaw: null,
      signatureSimple: makeSimpleSig(payloadObj),
      timestamp: now,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.variant).toBe("simple");
  });

  it("prefers V2 over raw/simple when multiple headers are present", () => {
    const result = verifyDiditWebhookSignature({
      rawBody: rawBodyBuffer,
      signatureV2: makeV2Sig(payloadObj),
      signatureRaw: makeRawSig(rawBodyBuffer),
      signatureSimple: makeSimpleSig(payloadObj),
      timestamp: now,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.variant).toBe("v2");
  });

  // ─── Replay attack ────────────────────────────────────────────────────────
  it("rejects a request with timestamp older than 300 seconds", () => {
    const oldTs = String(Math.floor(Date.now() / 1000) - 400);
    const result = verifyDiditWebhookSignature({
      rawBody: rawBodyBuffer,
      signatureV2: makeV2Sig(payloadObj),
      signatureRaw: null,
      signatureSimple: null,
      timestamp: oldTs,
    });
    expect(result.ok).toBe(false);
  });

  it("accepts a request with timestamp within 300 seconds", () => {
    const recentTs = String(Math.floor(Date.now() / 1000) - 200);
    const result = verifyDiditWebhookSignature({
      rawBody: rawBodyBuffer,
      signatureV2: makeV2Sig(payloadObj),
      signatureRaw: null,
      signatureSimple: null,
      timestamp: recentTs,
    });
    expect(result.ok).toBe(true);
  });

  // ─── Missing/null inputs ──────────────────────────────────────────────────
  it("rejects when all signatures are null", () => {
    const result = verifyDiditWebhookSignature({
      rawBody: rawBodyBuffer,
      signatureV2: null,
      signatureRaw: null,
      signatureSimple: null,
      timestamp: now,
    });
    expect(result.ok).toBe(false);
  });

  it("accepts a signature with sha256= prefix", () => {
    const result = verifyDiditWebhookSignature({
      rawBody: rawBodyBuffer,
      signatureV2: null,
      signatureRaw: `sha256=${makeRawSig(rawBodyBuffer)}`,
      signatureSimple: null,
      timestamp: now,
    });
    expect(result.ok).toBe(true);
  });
});
