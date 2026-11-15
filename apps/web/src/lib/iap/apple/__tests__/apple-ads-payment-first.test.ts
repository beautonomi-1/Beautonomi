import { beforeEach, describe, expect, it, vi } from "vitest";

const { recordAdsBudgetOrderPayment } = vi.hoisted(() => ({
  recordAdsBudgetOrderPayment: vi.fn(),
}));

vi.mock("@/lib/ads/ads-budget-order-payment", () => ({
  recordAdsBudgetOrderPayment: (...args: unknown[]) => recordAdsBudgetOrderPayment(...args),
}));

vi.mock("@/lib/iap/apple/jws", () => ({
  verifyAndParseAppleTransactionJws: () => ({
    transactionId: "tx-ads-1",
    originalTransactionId: "orig-ads-1",
    productId: "ads.pack",
    purchaseDate: Date.parse("2026-11-14T00:00:00.000Z"),
    price: 50000,
    currency: "ZAR",
    environment: "Production",
    appAccountToken: "provider-1",
  }),
  appleMillisToIso: (ms?: number) =>
    ms == null || !Number.isFinite(ms) ? null : new Date(ms).toISOString(),
  applePriceToMajor: () => 500,
}));

vi.mock("@/lib/iap/apple/config", () => ({
  loadAppleIapConfig: async () => ({ commissionRate: 0.15, bundleId: "app" }),
  computeAppleCommission: () => ({ commissionMajor: 75, proceedsMajor: 425 }),
}));

vi.mock("@/lib/iap/apple/registry", () => ({
  loadAppleProductById: async () => ({ kind: "consumable", apple_price_zar: 500 }),
  resolveSubscriptionPlanForAppleProduct: async () => null,
  resolveAdsBudgetOrderForAppleProduct: async () => ({
    ok: true,
    orderId: "order-1",
    providerId: "provider-1",
  }),
}));

vi.mock("@/lib/subscriptions/provider-subscription-payment", () => ({
  recordProviderSubscriptionPayment: vi.fn(),
}));

vi.mock("@/lib/subscriptions/provider-billing-merchant", () => ({
  loadProviderSubscriptionByProviderId: async () => null,
  disablePaystackSubscriptionForProvider: async () => undefined,
  failPendingProviderSubscriptionOrders: async () => 0,
  isLivePaystackSubscription: () => false,
  clearAppleMerchantOnFree: () => ({}),
  isAppleBillingActive: () => false,
}));

import { processAppleSignedTransaction } from "../entitlement-bridge";
import type { SupabaseClient } from "@supabase/supabase-js";

function supabaseRecorder() {
  const steps: string[] = [];
  const supabase = {
    from: (table: string) => {
      const api = {
        select: () => api,
        eq: () => api,
        not: () => api,
        limit: () => api,
        maybeSingle: async () => ({ data: null, error: null }),
        upsert: async () => ({ error: null }),
        update: (row: Record<string, unknown>) => {
          if (table === "ads_budget_orders" && row.apple_transaction_id) {
            steps.push("stamp");
          }
          return {
            eq: () => ({
              eq: async () => ({ error: null }),
              then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve),
            }),
          };
        },
      };
      return api;
    },
  };
  return { supabase: supabase as unknown as SupabaseClient, steps };
}

describe("Apple ads payment", () => {
  beforeEach(() => {
    recordAdsBudgetOrderPayment.mockReset();
  });

  it("saves the ads payment before the order is marked as an Apple purchase", async () => {
    const { supabase, steps } = supabaseRecorder();
    recordAdsBudgetOrderPayment.mockImplementation(async () => {
      steps.push("payment");
      return { finalized: true, alreadyPaid: false, campaignId: "camp-1" };
    });

    const result = await processAppleSignedTransaction({
      supabase,
      signedTransaction: "signed",
      providerIdHint: "provider-1",
    });

    expect(result.ok).toBe(true);
    expect(steps.indexOf("payment")).toBeGreaterThanOrEqual(0);
    expect(steps.indexOf("payment")).toBeLessThan(steps.indexOf("stamp"));
  });

  it("leaves the order unmarked when the ads payment is not saved", async () => {
    const { supabase, steps } = supabaseRecorder();
    recordAdsBudgetOrderPayment.mockResolvedValue({
      finalized: false,
      alreadyPaid: false,
      campaignId: null,
    });

    await expect(
      processAppleSignedTransaction({
        supabase,
        signedTransaction: "signed",
        providerIdHint: "provider-1",
      }),
    ).rejects.toThrow("ads payment was not recorded");
    expect(steps).not.toContain("stamp");
  });
});
