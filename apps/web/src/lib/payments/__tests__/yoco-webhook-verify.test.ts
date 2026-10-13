import crypto from "crypto";
import { describe, expect, it } from "vitest";
import {
  verifyYocoLegacyBodyHmac,
  verifyYocoStandardWebhooksSignature,
  verifyYocoWebhookRequest,
} from "../yoco-webhook-verify";

describe("yoco-webhook-verify", () => {
  it("verifies legacy body HMAC (hex)", () => {
    const body = '{"type":"payment.notification"}';
    const secret = "test_secret";
    const hex = crypto.createHmac("sha256", secret).update(body).digest("hex");
    expect(verifyYocoLegacyBodyHmac(body, hex, secret)).toBe(true);
  });

  it("verifies standard webhooks v1 signature", () => {
    const body = '{"id":"pay_1"}';
    const webhookId = "msg_123";
    const ts = String(Math.floor(Date.now() / 1000));
    const secretRaw = "supersecret";
    const whsec = `whsec_${Buffer.from(secretRaw).toString("base64")}`;
    const signed = `${webhookId}.${ts}.${body}`;
    const sig = crypto.createHmac("sha256", secretRaw).update(signed).digest("base64");
    expect(
      verifyYocoStandardWebhooksSignature(body, `v1,${sig}`, whsec, webhookId, ts),
    ).toBe(true);
  });

  it("rejects stale webhook timestamp", () => {
    const body = "{}";
    const webhookId = "msg_123";
    const ts = String(Math.floor(Date.now() / 1000) - 600);
    const whsec = "whsec_" + Buffer.from("key").toString("base64");
    expect(
      verifyYocoStandardWebhooksSignature(body, "v1,abc", whsec, webhookId, ts),
    ).toBe(false);
  });

  it("verifyYocoWebhookRequest prefers standard when both match", () => {
    const body = '{"x":1}';
    const secret = "plain";
    const hex = crypto.createHmac("sha256", secret).update(body).digest("hex");
    expect(
      verifyYocoWebhookRequest({
        body,
        signatureHeader: hex,
        secret,
        webhookId: null,
        webhookTimestamp: null,
      }),
    ).toBe("legacy_body_hmac");
  });
});
