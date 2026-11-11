import { describe, expect, it } from "vitest";
import { yocoWebhookDedupeId } from "../yoco-webhook-event-id";

describe("yocoWebhookDedupeId (F-06)", () => {
  it("prefers the webhook-id header", () => {
    expect(yocoWebhookDedupeId("msg_abc", { id: "pay_1" })).toBe("msg_abc");
  });

  it("falls back to the event id", () => {
    expect(yocoWebhookDedupeId(null, { id: "pay_1" })).toBe("pay_1");
  });

  it("returns null when there is no id (never a shared fallback)", () => {
    expect(yocoWebhookDedupeId("  ", { type: "payment.succeeded" })).toBeNull();
    expect(yocoWebhookDedupeId(null, {})).toBeNull();
  });
});
