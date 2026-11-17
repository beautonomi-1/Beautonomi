import { beforeEach, describe, expect, it, vi } from "vitest";

const { recordProviderSubscriptionPayment } = vi.hoisted(() => ({
  recordProviderSubscriptionPayment: vi.fn(),
}));

vi.mock("@/lib/subscriptions/provider-subscription-payment", () => ({
  recordProviderSubscriptionPayment: (...args: unknown[]) => recordProviderSubscriptionPayment(...args),
}));

vi.mock("@/lib/iap/apple/jws", () => ({
  verifyAndParseAppleTransactionJws: () => ({
    transactionId: "tx-1",
    originalTransactionId: "orig-1",
    productId: "plan.monthly",
    purchaseDate: Date.parse("2026-11-14T00:00:00.000Z"),
    expiresDate: Date.parse("2027-03-01T00:00:00.000Z"),
    price: 10000,
    currency: "ZAR",
    environment: "Production",
  }),
  appleMillisToIso: (ms?: number) =>
    ms == null || !Number.isFinite(ms) ? null : new Date(ms).toISOString(),
  applePriceToMajor: () => 100,
}));

vi.mock("@/lib/iap/apple/config", () => ({
  loadAppleIapConfig: async () => ({ commissionRate: 0.15, bundleId: "app" }),
  computeAppleCommission: () => ({ commissionMajor: 15, proceedsMajor: 85 }),
}));

vi.mock("@/lib/iap/apple/registry", () => ({
  loadAppleProductById: async () => ({ kind: "subscription", apple_price_zar: 100 }),
  resolveSubscriptionPlanForAppleProduct: async () => ({
    planId: "plan-1",
    billingPeriod: "monthly",
  }),
  resolveAdsBudgetOrderForAppleProduct: async () => ({ ok: false }),
}));

vi.mock("@/lib/subscriptions/provider-billing-merchant", () => ({
  loadProviderSubscriptionByProviderId: async () => ({
    tenant_id: "tenant-1",
    billing_provider: "paystack",
    status: "active",
    plan: { is_free: false },
  }),
  disablePaystackSubscriptionForProvider: async () => undefined,
  failPendingProviderSubscriptionOrders: async () => 0,
  isLivePaystackSubscription: () => false,
  clearAppleMerchantOnFree: () => ({}),
  isAppleBillingActive: () => false,
}));

vi.mock("@/lib/subscriptions/pending-upgrade-fields", () => ({
  CLEAR_PENDING_UPGRADE_FIELDS: {},
}));

import { processAppleSignedTransaction } from "../entitlement-bridge";
import type { SupabaseClient } from "@supabase/supabase-js";

function supabaseRecorder() {
  const steps: string[] = [];
  const planUpserts: Array<Record<string, unknown>> = [];
  const supabase = {
    from: (table: string) => {
      const api = {
        select: () => api,
        eq: () => api,
        not: () => api,
        limit: () => api,
        maybeSingle: async () => ({ data: null, error: null }),
        upsert: async (row: Record<string, unknown>) => {
          if (table === "provider_subscriptions") {
            steps.push("plan");
            planUpserts.push(row);
          }
          return { error: null };
        },
        update: () => api,
      };
      return api;
    },
  };
  return { supabase: supabase as unknown as SupabaseClient, steps, planUpserts };
}

describe("Apple subscription payment", () => {
  beforeEach(() => {
    recordProviderSubscriptionPayment.mockReset();
  });

  it("saves the payment, using Apple's end date, before the plan opens", async () => {
    const { supabase, steps, planUpserts } = supabaseRecorder();
    recordProviderSubscriptionPayment.mockImplementation(async () => {
      steps.push("payment");
      return {
        recorded: true,
        alreadyRecorded: false,
        netAmount: 85,
        reference: "tx-1",
        financeTransactionId: "fin-1",
      };
    });

    const result = await processAppleSignedTransaction({
      supabase,
      signedTransaction: "signed",
      providerIdHint: "provider-1",
    });

    expect(result.ok).toBe(true);
    expect(steps.indexOf("payment")).toBeGreaterThanOrEqual(0);
    expect(steps.indexOf("payment")).toBeLessThan(steps.indexOf("plan"));
    expect(recordProviderSubscriptionPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        termEndsAt: "2027-03-01T00:00:00.000Z",
        updateBillingPeriod: false,
      }),
    );
    expect(planUpserts[0]?.expires_at).toBe("2027-03-01T00:00:00.000Z");
    expect(planUpserts[0]?.billing_period_start).toBe("2026-11-14T00:00:00.000Z");
    expect(planUpserts[0]?.billing_period_end).toBe("2027-03-01T00:00:00.000Z");
    expect(planUpserts[0]?.billing_provider).toBe("apple");
  });

  it("leaves the plan unchanged when the payment is not saved", async () => {
    const { supabase, planUpserts } = supabaseRecorder();
    recordProviderSubscriptionPayment.mockResolvedValue({
      recorded: false,
      alreadyRecorded: false,
      netAmount: 0,
      reference: "tx-1",
      financeTransactionId: null,
    });

    await expect(
      processAppleSignedTransaction({
        supabase,
        signedTransaction: "signed",
        providerIdHint: "provider-1",
      }),
    ).rejects.toThrow("subscription payment was not recorded");
    expect(planUpserts).toHaveLength(0);
  });

  it("opens the plan when the same Apple payment was already saved", async () => {
    const { supabase, planUpserts } = supabaseRecorder();
    recordProviderSubscriptionPayment.mockResolvedValue({
      recorded: false,
      alreadyRecorded: true,
      netAmount: 85,
      reference: "tx-1",
      financeTransactionId: null,
    });

    const result = await processAppleSignedTransaction({
      supabase,
      signedTransaction: "signed",
      providerIdHint: "provider-1",
    });

    expect(result.ok).toBe(true);
    expect(planUpserts).toHaveLength(1);
    expect(planUpserts[0]?.status).toBe("active");
  });
});
