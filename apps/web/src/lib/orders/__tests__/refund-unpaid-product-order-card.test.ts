import { beforeEach, describe, expect, it, vi } from "vitest";
import { refundUnpaidProductOrderCardCharges } from "../product-order-lifecycle";

const refundGatewayCharge = vi.fn();

vi.mock("@/lib/payments/refund-gateway-charge", () => ({
  refundGatewayCharge: (...args: unknown[]) => refundGatewayCharge(...args),
}));

type Row = Record<string, unknown>;

function mockClient(rows: Row[]) {
  const updates: Row[] = [];
  const rpc = vi.fn(async () => ({ error: null }));
  const supabase = {
    rpc,
    from: vi.fn(() => {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn((key: string, value: unknown) => {
        if (key === "id") return Promise.resolve({ error: null });
        return chain;
      });
      chain.filter = vi.fn(async () => ({ data: rows, error: null }));
      chain.update = vi.fn((payload: Row) => {
        updates.push(payload);
        return chain;
      });
      return chain;
    }),
  };
  return { supabase, updates, rpc };
}

const order = {
  id: "order-1",
  customer_id: "cust-1",
  provider_id: "prov-1",
  tenant_id: "tenant-1",
  currency: "ZAR",
  wallet_amount: 20,
  gift_card_amount: 0,
};

describe("refundUnpaidProductOrderCardCharges", () => {
  beforeEach(() => {
    refundGatewayCharge.mockReset();
    refundGatewayCharge.mockResolvedValue({ provider: "paystack", refundId: "re_1" });
  });

  it("refunds a Paystack charge that was recorded before the order was paid", async () => {
    const { supabase, updates, rpc } = mockClient([
      { id: "tx-1", amount: 60, reference: "psk_1", provider: "paystack", refund_amount: 0 },
      { id: "tx-2", amount: 30, reference: "yoco_1", provider: "yoco", refund_amount: 0 },
    ]);

    const result = await refundUnpaidProductOrderCardCharges(
      supabase as never,
      order,
      "Cancelled by customer",
    );

    expect(result).toEqual({ onlineRefunded: 60, walletFallback: 0, failed: false });
    expect(refundGatewayCharge).toHaveBeenCalledOnce();
    expect(refundGatewayCharge).toHaveBeenCalledWith(
      expect.objectContaining({ reference: "psk_1", amountMajor: 60, fallbackProvider: "paystack" }),
    );
    expect(updates[0]).toMatchObject({ status: "refunded", refund_amount: 60 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("credits the wallet when the gateway refund fails", async () => {
    refundGatewayCharge.mockRejectedValue(new Error("gateway down"));
    const { supabase, updates, rpc } = mockClient([
      { id: "tx-1", amount: 60, reference: "psk_1", provider: "paystack", refund_amount: 0 },
    ]);

    const result = await refundUnpaidProductOrderCardCharges(
      supabase as never,
      order,
      "Cancelled by customer",
    );

    expect(result).toEqual({ onlineRefunded: 0, walletFallback: 60, failed: false });
    expect(rpc).toHaveBeenCalledWith(
      "wallet_credit_admin",
      expect.objectContaining({
        p_amount: 60,
        p_idempotency_key: "product_order_unpaid_card_refund:order-1:psk_1",
      }),
    );
    expect(updates[0]).toMatchObject({ status: "refunded", refund_amount: 60 });
  });
});
