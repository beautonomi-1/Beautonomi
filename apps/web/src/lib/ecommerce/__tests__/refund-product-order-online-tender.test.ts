import { beforeEach, describe, expect, it, vi } from "vitest";
import { refundProductOrderOnlineTender } from "../refund-product-order-online-tender";

const refundGatewayCharge = vi.fn();

vi.mock("@/lib/payments/refund-gateway-charge", () => ({
  refundGatewayCharge: (...args: unknown[]) => refundGatewayCharge(...args),
}));

function mockAdmin(rows: Array<Record<string, unknown>>) {
  const updates: Array<Record<string, unknown>> = [];
  const admin = {
    from: vi.fn(() => {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn(() => chain);
      chain.in = vi.fn(() => chain);
      chain.filter = vi.fn(async () => ({ data: rows, error: null }));
      chain.update = vi.fn((payload: Record<string, unknown>) => {
        updates.push(payload);
        return chain;
      });
      chain.eq = vi.fn(async () => ({ error: null }));
      return chain;
    }),
  };
  return { admin, updates };
}

const order = {
  id: "order-1",
  payment_status: "paid" as const,
  payment_method: "paystack",
  payment_reference: "second",
  total_amount: 100,
  wallet_amount: 0,
  gift_card_amount: 0,
  currency: "ZAR",
  tenant_id: "tenant-1",
};

describe("refundProductOrderOnlineTender", () => {
  beforeEach(() => {
    refundGatewayCharge.mockReset();
    refundGatewayCharge.mockResolvedValue({ provider: "paystack", refundId: "re_1" });
  });

  it("refunds each card charge instead of the full amount on the last charge", async () => {
    const { admin, updates } = mockAdmin([
      { id: "tx-1", amount: 60, reference: "first", provider: "paystack", status: "success", refund_amount: 0 },
      { id: "tx-2", amount: 40, reference: "second", provider: "paystack", status: "success", refund_amount: 0 },
    ]);

    const result = await refundProductOrderOnlineTender(admin as never, order, {
      reason: "Cancelled",
      idempotencyKey: "cancel-1",
    });

    expect(result).toMatchObject({ attempted: true, refundedAmount: 100, refundId: "re_1" });
    expect(result.error).toBeUndefined();
    expect(refundGatewayCharge.mock.calls.map((call) => call[0])).toEqual([
      expect.objectContaining({ reference: "first", amountMajor: 60 }),
      expect.objectContaining({ reference: "second", amountMajor: 40 }),
    ]);
    expect(updates.map((row) => row.refund_amount)).toEqual([60, 40]);
  });

  it("returns only the charge that was refunded when the next charge fails", async () => {
    refundGatewayCharge
      .mockResolvedValueOnce({ provider: "paystack", refundId: "re_1" })
      .mockRejectedValueOnce(new Error("gateway down"));
    const { admin } = mockAdmin([
      { id: "tx-1", amount: 60, reference: "first", provider: "paystack", status: "success", refund_amount: 0 },
      { id: "tx-2", amount: 40, reference: "second", provider: "paystack", status: "success", refund_amount: 0 },
    ]);

    const result = await refundProductOrderOnlineTender(admin as never, order, {
      reason: "Cancelled",
      idempotencyKey: "cancel-1",
    });

    expect(result.refundedAmount).toBe(60);
    expect(result.error).toBe("gateway down");
  });

  it("refunds the saved reference when no card rows are recorded", async () => {
    const { admin } = mockAdmin([]);

    const result = await refundProductOrderOnlineTender(admin as never, order, {
      reason: "Cancelled",
      idempotencyKey: "cancel-1",
    });

    expect(result).toMatchObject({ attempted: true, refundedAmount: 100 });
    expect(refundGatewayCharge).toHaveBeenCalledWith(
      expect.objectContaining({ reference: "second", amountMajor: 100 }),
    );
  });
});
