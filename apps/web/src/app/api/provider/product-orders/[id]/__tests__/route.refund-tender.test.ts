import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockNextRequest, MOCK_USERS } from "@/__tests__/helpers/mock-supabase";

vi.mock("@/lib/auth/requirePermission", () => ({
  requirePermission: vi.fn(),
}));

vi.mock("@/lib/supabase/api-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/supabase/api-helpers")>(
    "@/lib/supabase/api-helpers",
  );
  return { ...actual, getProviderIdForUser: vi.fn() };
});

vi.mock("@/lib/supabase/server", () => ({ getSupabaseServer: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: vi.fn() }));

vi.mock("@/lib/orders/product-order-lifecycle", () => ({
  applyProductOrderCancelRefundSideEffects: vi.fn(async () => ({ walletCreditFailed: false })),
  releaseUnpaidProductOrderHolds: vi.fn(async () => ({ credited: false, failed: false, amount: 0 })),
  restockProductOrderLineItems: vi.fn(async () => undefined),
  voidProductOrderGiftCardIfNeeded: vi.fn(async () => undefined),
}));

vi.mock("@/lib/ecommerce/refund-product-order-online-tender", () => ({
  refundProductOrderOnlineTender: vi.fn(),
}));

vi.mock("@/lib/notifications/notify-product-order-status", () => ({
  dispatchProductOrderStatusNotification: vi.fn(async () => undefined),
}));

vi.mock("@/lib/orders/shipping", () => ({
  cancelCourierShipmentForOrder: vi.fn(async () => undefined),
}));

const ORDER_ID = "oooooooo-oooo-oooo-oooo-oooooooooooo";
const PROVIDER_ID = "pppppppp-pppp-pppp-pppp-pppppppppppp";

type OrderOverrides = Partial<{
  total_amount: number;
  wallet_amount: number;
  gift_card_amount: number;
  fulfillment_type: string;
  courier_shipment_id: string | null;
}>;

function makeOrder(overrides: OrderOverrides = {}) {
  return {
    id: ORDER_ID,
    status: "delivered",
    provider_id: PROVIDER_ID,
    payment_status: "paid",
    payment_method: "paystack",
    payment_reference: "ps_ref_1",
    total_amount: 150,
    wallet_amount: 50,
    gift_card_amount: 0,
    customer_id: "cust-1",
    currency: "ZAR",
    tenant_id: "tenant-1",
    order_number: "PO-1",
    fulfillment_type: "collection",
    tracking_number: null,
    courier_shipment_id: null,
    ...overrides,
  };
}

function makeServerClient(order: ReturnType<typeof makeOrder>) {
  const updates: Record<string, unknown>[] = [];
  const client = {
    updates,
    from: vi.fn(() => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = vi.fn(self);
      chain.eq = vi.fn(self);
      chain.update = vi.fn((payload: Record<string, unknown>) => {
        updates.push(payload);
        return chain;
      });
      chain.single = vi.fn(async () => ({
        data: { ...order, customer: { id: order.customer_id, full_name: "C" } },
        error: null,
      }));
      chain.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
      return chain;
    }),
  };
  return client;
}

async function patch(body: Record<string, unknown>) {
  const { PATCH } = await import("../route");
  return PATCH(
    createMockNextRequest({
      method: "PATCH",
      url: `http://localhost/api/provider/product-orders/${ORDER_ID}`,
      body,
    }) as never,
    { params: Promise.resolve({ id: ORDER_ID }) },
  );
}

describe("PATCH /api/provider/product-orders/[id] refund tender split", () => {
  let adminRpc: ReturnType<typeof vi.fn>;

  async function setup(order: ReturnType<typeof makeOrder>) {
    const { requirePermission } = await import("@/lib/auth/requirePermission");
    const { getProviderIdForUser } = await import("@/lib/supabase/api-helpers");
    const { getSupabaseServer } = await import("@/lib/supabase/server");
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    vi.mocked(requirePermission).mockResolvedValue({
      authorized: true,
      user: MOCK_USERS.provider_owner,
    } as never);
    vi.mocked(getProviderIdForUser).mockResolvedValue(PROVIDER_ID);
    const server = makeServerClient(order);
    vi.mocked(getSupabaseServer).mockResolvedValue(server as never);
    adminRpc = vi.fn(async () => ({ data: null, error: null }));
    vi.mocked(getSupabaseAdmin).mockReturnValue({ rpc: adminRpc } as never);
    return server;
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuses an in-person cash refund of an online payment", async () => {
    await setup(makeOrder());

    const res = await patch({ status: "refunded", refund_method: "cash" });

    expect(res.status).toBe(400);
    expect((await res.json()).error?.code).toBe("REFUND_ORIGINAL_TENDER");
  });

  it("full refund: card portion goes back to the gateway, only the wallet leg is credited", async () => {
    const { refundProductOrderOnlineTender } = await import(
      "@/lib/ecommerce/refund-product-order-online-tender"
    );
    const { applyProductOrderCancelRefundSideEffects } = await import(
      "@/lib/orders/product-order-lifecycle"
    );
    vi.mocked(refundProductOrderOnlineTender).mockResolvedValue({
      attempted: true,
      refundedAmount: 100,
      refundId: "rf_1",
    });
    await setup(makeOrder());

    const res = await patch({ status: "refunded", refund_method: "store_credit" });

    expect(res.status).toBe(200);
    expect(refundProductOrderOnlineTender).toHaveBeenCalledOnce();
    expect(adminRpc).toHaveBeenCalledWith(
      "wallet_credit_admin",
      expect.objectContaining({ p_amount: 50, p_idempotency_key: `product_order_refund:${ORDER_ID}` }),
    );
    expect(vi.mocked(applyProductOrderCancelRefundSideEffects).mock.calls[0][3]).toMatchObject({
      newStatus: "refunded",
      refundAmount: 150,
      onlineRefundedAmount: 100,
      walletCreditIssued: 50,
    });
  });

  it("full refund with gateway failure: whole amount falls back to wallet", async () => {
    const { refundProductOrderOnlineTender } = await import(
      "@/lib/ecommerce/refund-product-order-online-tender"
    );
    vi.mocked(refundProductOrderOnlineTender).mockResolvedValue({
      attempted: true,
      refundedAmount: 0,
      refundId: null,
      error: "gateway down",
    });
    await setup(makeOrder());

    const res = await patch({ status: "refunded", refund_method: "store_credit" });

    expect(res.status).toBe(200);
    expect(adminRpc).toHaveBeenCalledWith(
      "wallet_credit_admin",
      expect.objectContaining({ p_amount: 150 }),
    );
  });

  it("partial refund: wallet only, gateway and gift card untouched", async () => {
    const { refundProductOrderOnlineTender } = await import(
      "@/lib/ecommerce/refund-product-order-online-tender"
    );
    const { voidProductOrderGiftCardIfNeeded } = await import(
      "@/lib/orders/product-order-lifecycle"
    );
    await setup(makeOrder({ gift_card_amount: 40 }));

    const res = await patch({
      status: "refunded",
      refund_method: "store_credit",
      refund_amount: 50,
    });

    expect(res.status).toBe(200);
    expect(refundProductOrderOnlineTender).not.toHaveBeenCalled();
    expect(voidProductOrderGiftCardIfNeeded).not.toHaveBeenCalled();
    expect(adminRpc).toHaveBeenCalledWith(
      "wallet_credit_admin",
      expect.objectContaining({ p_amount: 50 }),
    );
  });

  it("wallet failure after the card refund keeps the order refunded and still restocks + reverses the ledger", async () => {
    const { refundProductOrderOnlineTender } = await import(
      "@/lib/ecommerce/refund-product-order-online-tender"
    );
    const { restockProductOrderLineItems, applyProductOrderCancelRefundSideEffects } =
      await import("@/lib/orders/product-order-lifecycle");
    vi.mocked(refundProductOrderOnlineTender).mockResolvedValue({
      attempted: true,
      refundedAmount: 100,
      refundId: "rf_1",
    });
    const server = await setup(makeOrder());
    adminRpc.mockResolvedValue({ data: null, error: { message: "wallet down" } });

    const res = await patch({ status: "refunded", refund_method: "store_credit" });

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error?.code).toBe("WALLET_CREDIT_FAILED_PARTIAL");
    expect(server.updates.some((u) => u.payment_status === "paid")).toBe(false);
    expect(restockProductOrderLineItems).toHaveBeenCalledOnce();
    expect(applyProductOrderCancelRefundSideEffects).toHaveBeenCalledOnce();
  });

  it("wallet failure with no tender moved rolls back without restocking or cancelling the shipment", async () => {
    const { restockProductOrderLineItems, applyProductOrderCancelRefundSideEffects } =
      await import("@/lib/orders/product-order-lifecycle");
    const { cancelCourierShipmentForOrder } = await import("@/lib/orders/shipping");
    await setup(
      makeOrder({
        fulfillment_type: "delivery",
        courier_shipment_id: "shp_1",
      } as OrderOverrides),
    );
    adminRpc.mockResolvedValue({ data: null, error: { message: "wallet down" } });

    const res = await patch({
      status: "refunded",
      refund_method: "store_credit",
      refund_amount: 50,
    });

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error?.code).toBe("WALLET_CREDIT_FAILED");
    expect(restockProductOrderLineItems).not.toHaveBeenCalled();
    expect(cancelCourierShipmentForOrder).not.toHaveBeenCalled();
    expect(applyProductOrderCancelRefundSideEffects).not.toHaveBeenCalled();
  });

  it("retrying after a rolled-back refund restocks exactly once in total", async () => {
    const { restockProductOrderLineItems } = await import("@/lib/orders/product-order-lifecycle");
    await setup(makeOrder());
    adminRpc.mockResolvedValueOnce({ data: null, error: { message: "wallet down" } });

    const first = await patch({ status: "refunded", refund_method: "store_credit", refund_amount: 50 });
    const second = await patch({ status: "refunded", refund_method: "store_credit", refund_amount: 50 });

    expect(first.status).toBe(500);
    expect(second.status).toBe(200);
    expect(restockProductOrderLineItems).toHaveBeenCalledOnce();
    expect(vi.mocked(restockProductOrderLineItems).mock.calls[0][2]).toMatchObject({
      movementType: "return",
    });
  });

  it("re-sending cancel for an already-cancelled order does not restock or reverse the ledger again", async () => {
    const { restockProductOrderLineItems, applyProductOrderCancelRefundSideEffects } =
      await import("@/lib/orders/product-order-lifecycle");
    await setup({ ...makeOrder(), status: "cancelled", payment_status: "refunded" });

    const res = await patch({ status: "cancelled" });

    expect(res.status).toBe(200);
    expect(restockProductOrderLineItems).not.toHaveBeenCalled();
    expect(applyProductOrderCancelRefundSideEffects).not.toHaveBeenCalled();
  });

  it("cancel whose wallet refund fails reports REFUND_PENDING instead of success", async () => {
    const { applyProductOrderCancelRefundSideEffects } = await import(
      "@/lib/orders/product-order-lifecycle"
    );
    vi.mocked(applyProductOrderCancelRefundSideEffects).mockResolvedValueOnce({
      walletCreditFailed: true,
    });
    await setup(makeOrder());

    const res = await patch({ status: "cancelled", cancellation_reason: "Out of stock" });

    expect(res.status).toBe(502);
    expect((await res.json()).error?.code).toBe("REFUND_PENDING");
  });

  it("successful delivery refund restocks and cancels the courier shipment once", async () => {
    const { restockProductOrderLineItems } = await import("@/lib/orders/product-order-lifecycle");
    const { cancelCourierShipmentForOrder } = await import("@/lib/orders/shipping");
    await setup(
      makeOrder({
        fulfillment_type: "delivery",
        courier_shipment_id: "shp_1",
      } as OrderOverrides),
    );

    const res = await patch({ status: "refunded", refund_method: "store_credit", refund_amount: 50 });

    expect(res.status).toBe(200);
    expect(restockProductOrderLineItems).toHaveBeenCalledOnce();
    expect(cancelCourierShipmentForOrder).toHaveBeenCalledOnce();
  });
});
