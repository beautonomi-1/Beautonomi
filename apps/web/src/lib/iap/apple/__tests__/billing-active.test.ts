import { describe, expect, it } from "vitest";
import {
  isAppleBillingActive,
  isPastDueWithinGrace,
} from "@/lib/iap/apple/billing-active";

describe("isAppleBillingActive", () => {
  it("is true only while Apple is still the merchant of record", () => {
    expect(isAppleBillingActive("apple", "active")).toBe(true);
    expect(isAppleBillingActive("apple", "trialing")).toBe(true);
    expect(isAppleBillingActive("apple", "past_due")).toBe(true);
    expect(isAppleBillingActive("apple", "expired")).toBe(false);
    expect(isAppleBillingActive("apple", "cancelled")).toBe(false);
    expect(isAppleBillingActive("paystack", "active")).toBe(false);
  });
});

describe("isPastDueWithinGrace", () => {
  const nowIso = "2026-08-15T12:00:00.000Z";
  const graceCutoffIso = "2026-08-12T12:00:00.000Z";

  it("honours Apple's gracePeriodExpiresDate instead of the Paystack 3-day window", () => {
    expect(
      isPastDueWithinGrace({
        billingProvider: "apple",
        appleGracePeriodExpiresAt: "2026-08-20T12:00:00.000Z",
        updatedAt: "2026-08-01T12:00:00.000Z",
        nowIso,
        graceCutoffIso,
      }),
    ).toBe(true);
    expect(
      isPastDueWithinGrace({
        billingProvider: "apple",
        appleGracePeriodExpiresAt: "2026-08-10T12:00:00.000Z",
        updatedAt: "2026-08-14T12:00:00.000Z",
        nowIso,
        graceCutoffIso,
      }),
    ).toBe(false);
  });

  it("does not invent Paystack grace when Apple omitted a grace date", () => {
    expect(
      isPastDueWithinGrace({
        billingProvider: "apple",
        appleGracePeriodExpiresAt: null,
        updatedAt: "2026-08-14T12:00:00.000Z",
        nowIso,
        graceCutoffIso,
      }),
    ).toBe(false);
  });

  it("keeps Paystack past_due entitled inside the 3-day window", () => {
    expect(
      isPastDueWithinGrace({
        billingProvider: "paystack",
        updatedAt: "2026-08-14T12:00:00.000Z",
        nowIso,
        graceCutoffIso,
      }),
    ).toBe(true);
    expect(
      isPastDueWithinGrace({
        billingProvider: "paystack",
        updatedAt: "2026-08-10T12:00:00.000Z",
        nowIso,
        graceCutoffIso,
      }),
    ).toBe(false);
  });
});
