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
});

