import { beforeEach, describe, expect, it, vi } from "vitest";
import { processSuccessfulPayment } from "../charge-success";
import type { SupabaseClient } from "../shared";

const refundGatewayChargeMock = vi.fn();
const recordProductOrderPaymentMock = vi.fn();

vi.mock("@/lib/payments/refund-gateway-charge", () => ({
  refundGatewayCharge: (...args: unknown[]) => refundGatewayChargeMock(...args),
}));

vi.mock("@/lib/orders/record-product-order-payment", () => ({
  recordProductOrderPayment: (...args: unknown[]) => recordProductOrderPaymentMock(...args),
}));

vi.mock("@/lib/integrations/slack/ops-triggers", () => ({
  slackNotifyProductOrderPaymentNotRecorded: vi.fn(),
  slackNotifyPaymentFailed: vi.fn(),
  slackNotifyUnrecognizedPayments: vi.fn(),
}));

vi.mock("@/lib/wallet/enrich-wallet-topup-metadata-from-reference", () => ({
  enrichWalletTopupMetadataFromReference: vi.fn(async () => undefined),
}));

describe("charge.success product order — late success after charge.failed cancellation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refundGatewayChargeMock.mockResolvedValue({ provider: "paystack", refundId: "r-1" });
    recordProductOrderPaymentMock.mockResolvedValue({ ok: true, transitionedToPaid: false, duplicate: false });
  });

  it("refunds the charge and does not record payment when the order is already failed/cancelled", async () => {
    const productOrderId = "order-1";
    const reference = "ref-1";

    const supabase: SupabaseClient = {
      from: vi.fn((table: string) => {
        if (table === "ads_budget_orders") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: null, error: null })),
              })),
            })),
          };
        }
        if (table === "provider_subscription_orders") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: null, error: null })),
              })),
            })),
          };
        }
        if (table === "product_orders") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: {
                    id: productOrderId,
                    total_amount: 100,
                    wallet_amount: 0,
                    gift_card_amount: 0,
                    tenant_id: "tenant-1",
                    currency: "ZAR",
                    payment_status: "failed",
                    status: "cancelled",
                  },
                  error: null,
                })),
              })),
            })),
          };
        }
        throw new Error(`unexpected table in product order late success test: ${table}`);
      }),
    } as unknown as SupabaseClient;

    await processSuccessfulPayment(
      {
        reference,
        amount: 10_000,
        fees: 0,
        currency: "ZAR",
        metadata: { product_order_id: productOrderId },
      } as any,
      supabase,
    );

    expect(refundGatewayChargeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        reference,
        amountMajor: 100,
        currency: "ZAR",
        tenantId: "tenant-1",
        fallbackProvider: "paystack",
      }),
    );
    expect(recordProductOrderPaymentMock).not.toHaveBeenCalled();
  });

  it("refunds a successful charge after the customer cancelled while payment was still pending", async () => {
    const supabase = mockClosedOrderSupabase({
      payment_status: "pending",
      status: "cancelled",
      charges: [],
    });

    await processSuccessfulPayment(
      {
        reference: "ref-1",
        amount: 10_000,
        fees: 0,
        currency: "ZAR",
        metadata: { product_order_id: "order-1" },
      } as any,
      supabase,
    );

    expect(refundGatewayChargeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        reference: "ref-1",
        amountMajor: 100,
        idempotencyKey: "product_order_late_success_refund:order-1:ref-1",
      }),
    );
    expect(recordProductOrderPaymentMock).not.toHaveBeenCalled();
  });

  it("does not refund again when that charge was already recorded before cancel", async () => {
    const supabase = mockClosedOrderSupabase({
      payment_status: "pending",
      status: "cancelled",
      charges: [{ id: "tx-1" }],
    });

    await processSuccessfulPayment(
      {
        reference: "ref-1",
        amount: 10_000,
        fees: 0,
        currency: "ZAR",
        metadata: { product_order_id: "order-1" },
      } as any,
      supabase,
    );

    expect(refundGatewayChargeMock).not.toHaveBeenCalled();
    expect(recordProductOrderPaymentMock).not.toHaveBeenCalled();
  });

  it("refunds when the order is cancelled while the charge is being recorded", async () => {
    recordProductOrderPaymentMock.mockResolvedValue({
      ok: false,
      duplicate: false,
      transitionedToPaid: false,
    });
    let orderReads = 0;
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "ads_budget_orders" || table === "provider_subscription_orders") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: null, error: null })),
              })),
            })),
          };
        }
        if (table === "product_orders") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => {
                  orderReads += 1;
                  const pending = orderReads === 1;
                  return {
                    data: {
                      id: "order-1",
                      total_amount: 100,
                      wallet_amount: 0,
                      gift_card_amount: 0,
                      tenant_id: "tenant-1",
                      currency: "ZAR",
                      payment_status: "pending",
                      status: pending ? "pending" : "cancelled",
                    },
                    error: null,
                  };
                }),
              })),
            })),
          };
        }
        if (table === "payment_transactions") {
          const chain = {
            select: vi.fn(() => chain),
            eq: vi.fn(() => chain),
            filter: vi.fn(async () => ({ data: [], error: null })),
            limit: vi.fn(async () => ({ data: [], error: null })),
          };
          return chain;
        }
        throw new Error(`unexpected table in product order late success test: ${table}`);
      }),
    } as unknown as SupabaseClient;

    await processSuccessfulPayment(
      {
        reference: "ref-1",
        amount: 10_000,
        fees: 0,
        currency: "ZAR",
        metadata: { product_order_id: "order-1" },
      } as any,
      supabase,
    );

    expect(recordProductOrderPaymentMock).toHaveBeenCalledTimes(1);
    expect(refundGatewayChargeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        reference: "ref-1",
        amountMajor: 100,
        idempotencyKey: "product_order_late_success_refund:order-1:ref-1",
      }),
    );
  });
});

function mockClosedOrderSupabase(input: {
  payment_status: string;
  status: string;
  charges: Array<{ id: string }>;
}): SupabaseClient {
  return {
    from: vi.fn((table: string) => {
      if (table === "ads_budget_orders" || table === "provider_subscription_orders") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            })),
          })),
        };
      }
      if (table === "product_orders") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  id: "order-1",
                  total_amount: 100,
                  wallet_amount: 0,
                  gift_card_amount: 0,
                  tenant_id: "tenant-1",
                  currency: "ZAR",
                  payment_status: input.payment_status,
                  status: input.status,
                },
                error: null,
              })),
            })),
          })),
        };
      }
      if (table === "payment_transactions") {
        const chain = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          limit: vi.fn(async () => ({ data: input.charges, error: null })),
        };
        return chain;
      }
      throw new Error(`unexpected table in product order late success test: ${table}`);
    }),
  } as unknown as SupabaseClient;
}

