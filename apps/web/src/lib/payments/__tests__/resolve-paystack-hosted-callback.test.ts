import { describe, expect, it } from "vitest";
import {
  buildHostedCheckoutCallbackUrls,
  clientHintsInApp,
  normalizeInAppHint,
  paystackChannelsForInitialize,
  resolveHostedCheckoutCallbacks,
  resolveSaveCardForInitialize,
} from "../resolve-paystack-hosted-callback";

describe("resolve-paystack-hosted-callback", () => {
  it("normalizeInAppHint detects scheme URLs", () => {
    expect(normalizeInAppHint("customer://book/paystack")).toBe(true);
    expect(normalizeInAppHint("https://example.com/checkout/success")).toBe(false);
  });

  it("clientHintsInApp detects HTTPS bridge URLs with context=app", () => {
    expect(
      clientHintsInApp("https://app.example.com/checkout/success?booking_id=b1&context=app"),
    ).toBe(true);
    expect(clientHintsInApp("https://app.example.com/checkout/success?booking_id=b1")).toBe(false);
  });

  it("buildHostedCheckoutCallbackUrls uses HTTPS and context=app when inApp", () => {
    const { successUrl, cancelUrl } = buildHostedCheckoutCallbackUrls({
      baseUrl: "https://app.example.com",
      successPath: "/checkout/success",
      cancelPath: "/checkout/cancelled",
      query: { booking_id: "b1" },
      inApp: true,
    });
    expect(successUrl).toMatch(/^https:\/\/app\.example\.com\/checkout\/success\?/);
    expect(successUrl).toContain("booking_id=b1");
    expect(successUrl).toContain("context=app");
    expect(cancelUrl).toContain("context=app");
  });

  it("resolveHostedCheckoutCallbacks never returns scheme for Paystack body", () => {
    const r = resolveHostedCheckoutCallbacks({
      baseUrl: "https://app.example.com",
      clientCallbackUrl: "customer://book/paystack",
      defaultSuccessPath: "/checkout/success",
      defaultCancelPath: "/checkout/cancelled",
      query: { booking_id: "b1" },
    });
    expect(r.successUrl.startsWith("https://")).toBe(true);
    expect(r.inApp).toBe(true);
  });

  it("paystackChannelsForInitialize omits key when saveCard false", () => {
    expect(paystackChannelsForInitialize({ saveCard: false })).toEqual({});
    expect(paystackChannelsForInitialize({ saveCard: true })).toEqual({ channels: ["card"] });
  });

  it("resolveSaveCardForInitialize accepts save_card and saveCard", () => {
    expect(resolveSaveCardForInitialize({ save_card: true })).toBe(true);
    expect(resolveSaveCardForInitialize({ saveCard: "true" })).toBe(true);
    expect(resolveSaveCardForInitialize({ save_card: false })).toBe(false);
  });
});
