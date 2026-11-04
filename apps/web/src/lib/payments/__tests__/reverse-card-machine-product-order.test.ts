import { beforeEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.fn();
const rpcMock = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: (...args: unknown[]) => fromMock(...args),
    rpc: (...args: unknown[]) => rpcMock(...args),
  }),
}));

const voidProductOrderGiftCardMock = vi.fn();
vi.mock("@/lib/ecommerce/product-order-gift-card", () => ({
  voidProductOrderGiftCard: (...args: unknown[]) => voidProductOrderGiftCardMock(...args),
}));

import { reverseCardMachineSettlement } from "../settle-card-machine-payment";

function makeChain(result: { data?: unknown; error?: unknown }) {
  const api: any = {};
  api.select = vi.fn(() => api);
  api.update = vi.fn(() => api);
  api.insert = vi.fn(async () => ({ error: null }));
  api.eq = vi.fn(() => api);
  api.in = vi.fn(() => api);
  api.maybeSingle = vi.fn(async () => result);
  return api;
}

describe("reverseCardMachineSettlement (product_order)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcMock.mockResolvedValue({ error: null });
  });

  it("full refund returns wallet (and gift if missing) and claws back posted earnings/fee once", async () => {
    const providerId = "prov-1";
    const orderId = "order-1";
    const reference = "yoco-ref-1";

    const inserted: unknown[] = [];
    const orderUpdates: unknown[] = [];
    const txUpdates: unknown[] = [];

    fromMock.mockImplementation((table: string) => {
      if (table === "product_orders") {
        const api = makeChain({
          data: {
            id: orderId,
            provider_id: providerId,
            payment_status: "paid",
            payment_reference: reference,
            payment_method: "yoco",
            customer_id: "cust-1",
            tenant_id: "tenant-1",
            currency: "ZAR",
            order_number: "ORD-1",
            total_amount: 100,
            wallet_amount: 20,
            gift_card_amount: 40,
            gift_card_id: "gc-1",
            status: "delivered",
          },
          error: null,
        });
        api.update = vi.fn((payload: unknown) => {
          orderUpdates.push(payload);
          return api;
        });
        api.maybeSingle = vi.fn(async () => ({
          data: {
            id: orderId,
            provider_id: providerId,
            payment_status: "paid",
            payment_reference: reference,
            payment_method: "yoco",
            customer_id: "cust-1",
            tenant_id: "tenant-1",
            currency: "ZAR",
            order_number: "ORD-1",
            total_amount: 100,
            wallet_amount: 20,
            gift_card_amount: 40,
            gift_card_id: "gc-1",
            status: "delivered",
          },
          error: null,
        }));
        return api;
      }
      if (table === "payment_transactions") {
        const api = makeChain({ data: { amount: 40, status: "success" }, error: null });
        api.update = vi.fn((payload: unknown) => {
          txUpdates.push(payload);
          return api;
        });
        return api;
      }
      if (table === "finance_transactions") {
        const rows = [
          { transaction_type: "provider_earnings", net: 54, amount: 54, description: "earn" },
          { transaction_type: "platform_fee", net: 6, amount: 6, description: "fee" },
        ];
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn(async () => ({ data: rows, error: null })),
            })),
          })),
          insert: vi.fn(async (payload: unknown) => {
            inserted.push(payload);
            return { error: null };
          }),
        };
      }
      return makeChain({ data: null, error: null });
    });

    // Gift is restored to the card (not added into wallet).
    voidProductOrderGiftCardMock.mockResolvedValue("restored");

    const res1 = await reverseCardMachineSettlement({} as never, {
      paymentProvider: "yoco",
      paymentId: "yoco-payment-1",
      providerId,
      entityType: "product_order",
      entityId: orderId,
      origProviderPaymentId: reference,
      voidReference: "void-1",
      reversalKind: "refund",
    });
    expect(res1.reversed).toBe(true);

    // Wallet credit should be only the wallet leg (gift restored separately).
    expect(rpcMock).toHaveBeenCalledWith(
      "wallet_credit_admin",
      expect.objectContaining({
        p_user_id: "cust-1",
        p_amount: 20,
        p_reference_id: orderId,
        p_reference_type: "product_order_refund",
        p_idempotency_key: `product_order_cancel_refund:${orderId}`,
      }),
    );

    // Clawback posts refund rows once (provider_earnings + platform_fee).
    expect(inserted.length).toBe(1);
    const clawRows = inserted[0] as Array<any>;
    expect(clawRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          transaction_type: "refund",
          refund_component: "provider_earnings",
          amount: 54,
          net: -54,
          product_order_id: orderId,
        }),
        expect.objectContaining({
          transaction_type: "refund",
          refund_component: "platform_fee",
          amount: 6,
          net: -6,
          product_order_id: orderId,
        }),
      ]),
    );

    // Order is marked refunded and gift cleared.
    expect(orderUpdates).toEqual([
      expect.objectContaining({
        payment_status: "refunded",
        status: "refunded",
        gift_card_amount: 0,
        gift_card_id: null,
      }),
    ]);

    // Payment tx is marked refunded.
    expect(txUpdates).toEqual([
      expect.objectContaining({
        status: "refunded",
      }),
    ]);

    // Second call: idempotent clawback (detect existing refund description) -> no second insert.
    fromMock.mockImplementation((table: string) => {
      if (table === "product_orders") return makeChain({ data: { ...orderUpdates[0], payment_reference: reference, payment_method: "yoco", payment_status: "paid" }, error: null });
      if (table === "payment_transactions") return makeChain({ data: { amount: 40, status: "success" }, error: null });
      if (table === "finance_transactions") {
        const rows = [
          { transaction_type: "provider_earnings", net: 54, amount: 54, description: "earn" },
          { transaction_type: "platform_fee", net: 6, amount: 6, description: "fee" },
          {
            transaction_type: "refund",
            description: `Card refund returned platform-held tender (product_order_card_refund:${orderId})`,
          },
        ];
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn(async () => ({ data: rows, error: null })),
            })),
          })),
          insert: vi.fn(async (payload: unknown) => {
            inserted.push(payload);
            return { error: null };
          }),
        };
      }
      return makeChain({ data: null, error: null });
    });

    const res2 = await reverseCardMachineSettlement({} as never, {
      paymentProvider: "yoco",
      paymentId: "yoco-payment-1",
      providerId,
      entityType: "product_order",
      entityId: orderId,
      origProviderPaymentId: reference,
      voidReference: "void-1",
      reversalKind: "refund",
    });
    expect(res2.reversed).toBe(true);
    expect(inserted.length).toBe(1);
  });

  it("adds the gift into wallet credit when void returns missing", async () => {
    const providerId = "prov-1";
    const orderId = "order-1";
    const reference = "yoco-ref-1";

    fromMock.mockImplementation((table: string) => {
      if (table === "product_orders") {
        return makeChain({
          data: {
            id: orderId,
            provider_id: providerId,
            payment_status: "paid",
            payment_reference: reference,
            payment_method: "yoco",
            customer_id: "cust-1",
            tenant_id: "tenant-1",
            currency: "ZAR",
            order_number: "ORD-1",
            total_amount: 100,
            wallet_amount: 20,
            gift_card_amount: 40,
            gift_card_id: "gc-1",
            status: "delivered",
          },
          error: null,
        });
      }
      if (table === "payment_transactions") {
        return makeChain({ data: { amount: 40, status: "success" }, error: null });
      }
      if (table === "finance_transactions") {
        return makeChain({ data: [], error: null });
      }
      return makeChain({ data: null, error: null });
    });

    voidProductOrderGiftCardMock.mockResolvedValue("missing");

    await reverseCardMachineSettlement({} as never, {
      paymentProvider: "yoco",
      paymentId: "yoco-payment-1",
      providerId,
      entityType: "product_order",
      entityId: orderId,
      origProviderPaymentId: reference,
      voidReference: "void-1",
      reversalKind: "refund",
    });

    expect(rpcMock).toHaveBeenCalledWith(
      "wallet_credit_admin",
      expect.objectContaining({ p_amount: 60 }),
    );
  });
});

