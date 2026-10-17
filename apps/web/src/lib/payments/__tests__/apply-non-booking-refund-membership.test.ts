import { beforeEach, describe, expect, it, vi } from "vitest";

const mockReverseMembershipPayment = vi.fn();
const mockResolveTenantIdForFinanceLedger = vi.fn();

vi.mock("@/lib/memberships/reverse-membership-payment", () => ({
  reverseMembershipPayment: (...args: unknown[]) => mockReverseMembershipPayment(...args),
}));

vi.mock("@/lib/finance/resolve-tenant-id-for-ledger", () => ({
  resolveTenantIdForFinanceLedger: (...args: unknown[]) =>
    mockResolveTenantIdForFinanceLedger(...args),
}));

vi.mock("@/lib/marketing/marketing-credit-topup-payment", () => ({
  reverseMarketingCreditTopupPayment: vi.fn(),
}));

vi.mock("@/lib/ads/ads-budget-order-payment", () => ({
  reverseAdsBudgetOrderPayment: vi.fn(),
}));

vi.mock("@/lib/subscriptions/provider-subscription-payment", () => ({
  reverseProviderSubscriptionPayment: vi.fn(),
}));

vi.mock("@/lib/gift-cards/reverse-gift-card-order", () => ({
  reverseGiftCardOrder: vi.fn(),
}));

describe("applyNonBookingRefundFromTransaction — membership orders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveTenantIdForFinanceLedger.mockResolvedValue("tenant-1");
    mockReverseMembershipPayment.mockResolvedValue(undefined);
  });

  function buildSupabase(orderRow: Record<string, unknown> | null) {
    const membershipUpdates: unknown[] = [];
    return {
      membershipUpdates,
      client: {
        from: (table: string) => {
          if (table === "membership_orders") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: vi.fn().mockResolvedValue({ data: orderRow, error: null }),
                }),
              }),
              update: (patch: unknown) => ({
                eq: () => {
                  membershipUpdates.push(patch);
                  return Promise.resolve({ error: null });
                },
              }),
            };
          }
          if (table === "finance_transactions") {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                  }),
                }),
              }),
            };
          }
          throw new Error(`unexpected table ${table}`);
        },
      },
    };
  }

  it("refunds initial membership_order and sets refunded_at", async () => {
    const { client, membershipUpdates } = buildSupabase({
      id: "mo-1",
      provider_id: "prov-1",
      tenant_id: "tenant-1",
      user_id: "user-1",
      amount: 199,
      status: "paid",
    });

    const { applyNonBookingRefundFromTransaction } = await import(
      "../apply-non-booking-refund-from-transaction"
    );

    await applyNonBookingRefundFromTransaction({
      supabase: client as never,
      reference: "ref-1",
      refundReference: "re_1",
      refundAmountMajor: 199,
      reason: "customer refund",
      txn: {
        booking_id: null,
        amount: 199,
        metadata: { kind: "membership_order", membership_order_id: "mo-1" },
      },
    });

    expect(membershipUpdates[0]).toMatchObject({ status: "refunded" });
    expect((membershipUpdates[0] as { refunded_at?: string }).refunded_at).toBeTruthy();
    expect(mockReverseMembershipPayment).toHaveBeenCalledWith(
      expect.objectContaining({ membershipOrderId: "mo-1" }),
    );
  });

  it("refunds membership_renewal metadata kind", async () => {
    const { client } = buildSupabase({
      id: "mo-renew",
      provider_id: "prov-1",
      tenant_id: "tenant-1",
      user_id: "user-1",
      amount: 199,
      status: "paid",
    });

    const { applyNonBookingRefundFromTransaction } = await import(
      "../apply-non-booking-refund-from-transaction"
    );

    await applyNonBookingRefundFromTransaction({
      supabase: client as never,
      reference: "ref-2",
      refundReference: "re_2",
      refundAmountMajor: 199,
      reason: "renewal refund",
      txn: {
        booking_id: null,
        amount: 199,
        metadata: { kind: "membership_renewal", membership_order_id: "mo-renew" },
      },
    });

    expect(mockReverseMembershipPayment).toHaveBeenCalledWith(
      expect.objectContaining({ membershipOrderId: "mo-renew" }),
    );
  });
});
