import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ecommerce/product-order-gift-card", () => ({
  voidProductOrderGiftCard: vi.fn(async () => "failed"),
}));

import { voidProductOrderGiftCard } from "@/lib/ecommerce/product-order-gift-card";
import {
  abandonedOrderMoneyStillDue,
  applyProductOrderCancelRefundSideEffects,
} from "../product-order-lifecycle";

describe("abandonedOrderMoneyStillDue", () => {
  it("keeps an unpaid order marked when the wallet, gift card, or card refund is still owed", () => {
    expect(abandonedOrderMoneyStillDue({ walletFailed: true, giftVoid: "restored" })).toBe(true);
    expect(abandonedOrderMoneyStillDue({ walletFailed: false, giftVoid: "failed" })).toBe(true);
    expect(
      abandonedOrderMoneyStillDue({ walletFailed: false, giftVoid: "missing", cardFailed: true }),
    ).toBe(true);
    expect(abandonedOrderMoneyStillDue({ walletFailed: false, giftVoid: "none" })).toBe(false);
  });
});

function makeClients(walletError: unknown) {
  const orderUpdates: Record<string, unknown>[] = [];
  const supabase = {
    from: vi.fn(() => {
      const chain: Record<string, unknown> = {};
      chain.update = vi.fn((payload: Record<string, unknown>) => {
        orderUpdates.push(payload);
        return chain;
      });
      chain.eq = vi.fn(async () => ({ error: null }));
      return chain;
    }),
  };
  const admin = {
    // No platform-held ledger rows: skips the ledger-reversal branch.
    from: vi.fn(() => {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => chain);
      chain.in = vi.fn(() => chain);
      chain.limit = vi.fn(async () => ({ data: [], error: null }));
      return chain;
    }),
    rpc: vi.fn(async () => ({ data: null, error: walletError })),
  };
  return { supabase, admin, orderUpdates };
}

const order = {
  id: "order-1",
  provider_id: "prov-1",
  payment_status: "paid",
  total_amount: 150,
  customer_id: "cust-1",
  currency: "ZAR",
  tenant_id: "tenant-1",
  order_number: "PO-1",
  gift_card_amount: 0,
};

describe("applyProductOrderCancelRefundSideEffects wallet credit on cancel", () => {
  it("marks the order refunded when the wallet credit succeeds", async () => {
    const { supabase, admin, orderUpdates } = makeClients(null);

    const out = await applyProductOrderCancelRefundSideEffects(
      supabase as never,
      admin as never,
      order,
      { newStatus: "cancelled", onlineRefundedAmount: 100 },
    );

    expect(out).toEqual({
      walletCreditFailed: false,
      giftRestoreFailed: false,
      giftDisposition: "none",
    });
    expect(admin.rpc).toHaveBeenCalledWith(
      "wallet_credit_admin",
      expect.objectContaining({
        p_amount: 50,
        p_idempotency_key: "product_order_cancel_refund:order-1",
      }),
    );
    expect(orderUpdates).toEqual([expect.objectContaining({ payment_status: "refunded" })]);
  });

  it("reports the failure and leaves payment_status paid when the wallet credit fails", async () => {
    const { supabase, admin, orderUpdates } = makeClients({ message: "wallet down" });

    const out = await applyProductOrderCancelRefundSideEffects(
      supabase as never,
      admin as never,
      order,
      { newStatus: "cancelled", onlineRefundedAmount: 100 },
    );

    expect(out).toEqual({
      walletCreditFailed: true,
      giftRestoreFailed: false,
      giftDisposition: "none",
    });
    expect(orderUpdates).toEqual([]);
  });

  it("leaves the order paid when the gift card return does not answer", async () => {
    vi.mocked(voidProductOrderGiftCard).mockResolvedValue("failed");
    const { supabase, admin, orderUpdates } = makeClients(null);

    const out = await applyProductOrderCancelRefundSideEffects(
      supabase as never,
      admin as never,
      { ...order, gift_card_amount: 40, total_amount: 40 },
      { newStatus: "cancelled", onlineRefundedAmount: 0 },
    );

    expect(out).toEqual({
      walletCreditFailed: false,
      giftRestoreFailed: true,
      giftDisposition: "failed",
    });
    expect(orderUpdates).toEqual([]);
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("pays a gift card with no redemption into the wallet and does not call it restored", async () => {
    vi.mocked(voidProductOrderGiftCard).mockResolvedValue("missing");
    const { supabase, admin, orderUpdates } = makeClients(null);

    const out = await applyProductOrderCancelRefundSideEffects(
      supabase as never,
      admin as never,
      { ...order, gift_card_amount: 40, total_amount: 40 },
      { newStatus: "cancelled", onlineRefundedAmount: 0 },
    );

    expect(out).toEqual({
      walletCreditFailed: false,
      giftRestoreFailed: false,
      giftDisposition: "wallet",
    });
    expect(admin.rpc).toHaveBeenCalledWith(
      "wallet_credit_admin",
      expect.objectContaining({ p_amount: 40 }),
    );
    expect(orderUpdates).toEqual([expect.objectContaining({ payment_status: "refunded" })]);
  });

  it("credits only the wallet leg when the rest was collected in cash", async () => {
    const { supabase, admin } = makeClients(null);

    await applyProductOrderCancelRefundSideEffects(
      supabase as never,
      admin as never,
      { ...order, payment_method: "cash", wallet_amount: 40 },
      { newStatus: "cancelled", onlineRefundedAmount: 0 },
    );

    expect(admin.rpc).toHaveBeenCalledWith(
      "wallet_credit_admin",
      expect.objectContaining({ p_amount: 40 }),
    );
  });

  it("does not create a platform wallet credit for a cash-only order", async () => {
    const { supabase, admin } = makeClients(null);

    const out = await applyProductOrderCancelRefundSideEffects(
      supabase as never,
      admin as never,
      { ...order, payment_method: "cash", wallet_amount: 0, total_amount: 90 },
      { newStatus: "cancelled", onlineRefundedAmount: 0 },
    );

    expect(out).toEqual({
      walletCreditFailed: false,
      giftRestoreFailed: false,
      giftDisposition: "none",
    });
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("does not write a second ledger refund for the same cancel", async () => {
    const inserts: unknown[] = [];
    let limitedReads = 0;
    const admin = {
      from: () => {
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        chain.select = self;
        chain.eq = self;
        chain.in = self;
        chain.limit = async () => {
          limitedReads += 1;
          if (limitedReads === 1) return { data: [{ id: "cap", tenant_id: "tenant-1" }], error: null };
          return { data: [{ refund_component: "provider_earnings" }], error: null };
        };
        chain.then = (resolve: (value: unknown) => unknown) =>
          resolve({
            data: [{ transaction_type: "provider_earnings", amount: 120, net: 120 }],
            error: null,
          });
        chain.insert = async (rows: unknown) => {
          inserts.push(rows);
          return { error: null };
        };
        return chain;
      },
      rpc: vi.fn(async () => ({ data: null, error: null })),
    };
    const supabase = {
      from: () => {
        const chain: Record<string, unknown> = {};
        chain.update = () => chain;
        chain.eq = async () => ({ error: null });
        return chain;
      },
    };

    await applyProductOrderCancelRefundSideEffects(
      supabase as never,
      admin as never,
      { ...order, payment_method: "paystack", wallet_amount: 0 },
      { newStatus: "cancelled", cancellationReason: "Changed my mind", onlineRefundedAmount: 150 },
    );

    expect(inserts).toEqual([]);
  });

  it("writes a ledger refund for a second return even when the reason text matches", async () => {
    const inserts: unknown[] = [];
    const admin = {
      from: () => {
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        chain.select = self;
        chain.eq = self;
        chain.in = self;
        chain.limit = async () => ({ data: [{ id: "cap", tenant_id: "tenant-1" }], error: null });
        chain.then = (resolve: (value: unknown) => unknown) =>
          resolve({
            data: [{ transaction_type: "provider_earnings", amount: 120, net: 120 }],
            error: null,
          });
        chain.insert = async (rows: unknown) => {
          inserts.push(rows);
          return { error: null };
        };
        return chain;
      },
      rpc: vi.fn(async () => ({ data: null, error: null })),
    };
    const supabase = {
      from: () => {
        const chain: Record<string, unknown> = {};
        chain.update = () => chain;
        chain.eq = async () => ({ error: null });
        return chain;
      },
    };

    await applyProductOrderCancelRefundSideEffects(
      supabase as never,
      admin as never,
      { ...order, payment_method: "paystack", wallet_amount: 0 },
      {
        newStatus: "refunded",
        refundAmount: 50,
        refundReason: "Return refunded",
        onlineRefundedAmount: 150,
      },
    );

    expect(inserts).toHaveLength(1);
  });
});
