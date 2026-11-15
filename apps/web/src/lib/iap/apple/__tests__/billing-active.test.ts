import { describe, expect, it } from "vitest";
import {
  isAppleBillingActive,
  isPastDueWithinGrace,
  pastDueBillingMessage,
  pendingSavedCardChargeRefusal,
  providerCheckoutFailureMessage,
  subscriptionChargeNotAttempted,
  subscriptionPaymentFailedAccessNote,
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
    expect(
      isPastDueWithinGrace({
        billingProvider: "stripe",
        pastDueSince: "2026-08-10T12:00:00.000Z",
        updatedAt: "2026-08-15T11:00:00.000Z",
        nowIso,
        graceCutoffIso,
      }),
    ).toBe(false);
  });

  it("compares card and Apple grace by instant, not by timestamp text", () => {
    expect(
      isPastDueWithinGrace({
        billingProvider: "paystack",
        pastDueSince: "2026-08-12T13:00:00+02:00",
        updatedAt: "2026-08-15T11:00:00.000Z",
        nowIso,
        graceCutoffIso,
      }),
    ).toBe(false);
    expect(
      isPastDueWithinGrace({
        billingProvider: "apple",
        appleGracePeriodExpiresAt: "2026-08-15T13:00:00+02:00",
        nowIso,
        graceCutoffIso,
      }),
    ).toBe(false);
  });
});

describe("pastDueBillingMessage", () => {
  it("says features are still active only while grace is open", () => {
    expect(pastDueBillingMessage("paystack", true)).toMatch(/keep premium features active/);
    expect(pastDueBillingMessage("flutterwave", false)).toMatch(/Premium features are paused/);
    expect(pastDueBillingMessage("apple", true)).toMatch(/keep premium features/);
    expect(pastDueBillingMessage("apple", false)).toMatch(/stay paused/);
    expect(pastDueBillingMessage("paystack", true, true)).toMatch(/will be charged shortly/);
    expect(pastDueBillingMessage("flutterwave", false, true)).toMatch(/has not been charged yet/);
  });
});

describe("subscriptionChargeNotAttempted", () => {
  it("is only a card trial handoff before any retry is recorded", () => {
    const trialEnded = "2026-11-01T00:00:00.000Z";
    expect(
      subscriptionChargeNotAttempted({
        billing_provider: "paystack",
        trial_ends_at: trialEnded,
        nowMs: Date.parse("2026-11-14T00:00:00.000Z"),
      }),
    ).toBe(true);
    expect(subscriptionChargeNotAttempted({ billing_provider: "paystack" })).toBe(false);
    expect(
      subscriptionChargeNotAttempted({
        billing_provider: "flutterwave",
        last_dunning_retry_at: "2026-11-14T00:00:00.000Z",
      }),
    ).toBe(false);
    expect(subscriptionChargeNotAttempted({ billing_provider: "stripe" })).toBe(false);
  });
});

describe("pendingSavedCardChargeRefusal", () => {
  it("blocks a second charge only before the saved card is attempted", () => {
    const nowMs = Date.parse("2026-11-14T12:00:00.000Z");
    expect(
      pendingSavedCardChargeRefusal(
        {
          billing_provider: "paystack",
          trial_ends_at: "2026-11-14T02:00:00.000Z",
          past_due_since: "2026-11-14T02:10:00.000Z",
        },
        nowMs,
      ),
    ).toMatch(/will be charged shortly/);
    expect(
      pendingSavedCardChargeRefusal(
        {
          billing_provider: "paystack",
          trial_ends_at: "2026-11-14T02:00:00.000Z",
          last_dunning_retry_at: "2026-11-14T03:30:00.000Z",
          past_due_since: "2026-11-14T02:10:00.000Z",
        },
        nowMs,
      ),
    ).toBeNull();
  });
});

describe("providerCheckoutFailureMessage", () => {
  it("turns stored checkout codes into the account that replaced them", () => {
    expect(providerCheckoutFailureMessage("switched_to_apple")).toMatch(/App Store/);
    expect(providerCheckoutFailureMessage("apple_verified")).toMatch(/App Store/);
    expect(providerCheckoutFailureMessage("apple_billing_active")).toMatch(/App Store/);
    expect(providerCheckoutFailureMessage("superseded_by_new_checkout")).toMatch(/newer one/);
    expect(providerCheckoutFailureMessage("Card was declined")).toBe("Card was declined");
    expect(providerCheckoutFailureMessage("  ")).toBeNull();
  });
});

describe("subscriptionPaymentFailedAccessNote", () => {
  it("keeps the 3-day sentence only while access is still open", () => {
    expect(subscriptionPaymentFailedAccessNote(true)).toMatch(/stay active for 3 days/);
    expect(subscriptionPaymentFailedAccessNote(false)).toMatch(/are paused/);
  });
});
