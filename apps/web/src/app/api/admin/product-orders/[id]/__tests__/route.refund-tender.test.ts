import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockNextRequest } from "@/__tests__/helpers/mock-supabase";

vi.mock("@/lib/supabase/api-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/supabase/api-helpers")>(
    "@/lib/supabase/api-helpers",
  );
  return {
    ...actual,
    requireAdminSection: vi.fn(async () => ({ user: { id: "admin-1", role: "superadmin" } })),
  };
});

vi.mock("@/lib/supabase/server", () => ({ getSupabaseServer: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock("@/lib/tenant/admin-request-tenant", () => ({
  resolveAdminApiTenantId: vi.fn(async () => "tenant-1"),
}));
vi.mock("@/lib/audit/audit", () => ({
  writeAuditLog: vi.fn(async () => undefined),
  extractRequestMeta: vi.fn(() => ({ ip_address: null, user_agent: null })),
}));

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

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    status: "delivered",
    payment_status: "paid",
    customer_id: "cust-1",
    order_number: "PO-1",
    tenant_id: "tenant-1",
    provider_id: "prov-1",
    total_amount: 150,
    wallet_amount: 20,
    gift_card_amount: 40,
    payment_method: "paystack",
    payment_reference: "ps_ref_1",
    currency: "ZAR",
    collection_location_id: null,
    tracking_number: null,
    carrier: null,
    courier_shipment_id: null,
    fulfillment_type: "collection",
    estimated_delivery_date: null,
    provider: { id: "prov-1", business_name: "Salon", tenant_id: "tenant-1" },
    ...overrides,
  };
}

function makeServerClient(order: ReturnType<typeof makeOrder>) {
  const updates: Record<string, unknown>[] = [];
  return {
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
      chain.maybeSingle = vi.fn(async () => ({ data: order, error: null }));
      return chain;
    }),
  };
}

async function patch(body: Record<string, unknown>) {
  const { PATCH } = await import("../route");
  return PATCH(
    createMockNextRequest({
      method: "PATCH",
      url: `http://localhost/api/admin/product-orders/${ORDER_ID}`,
      body,
    }) as never,
    { params: Promise.resolve({ id: ORDER_ID }) },
  );
}

describe("PATCH /api/admin/product-orders/[id] refund tender split", () => {
  let adminRpc: ReturnType<typeof vi.fn>;

  async function setup(order = makeOrder()) {
    const { getSupabaseServer } = await import("@/lib/supabase/server");
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    const server = makeServerClient(order);
    vi.mocked(getSupabaseServer).mockResolvedValue(server as never);
    adminRpc = vi.fn(async () => ({ data: null, error: null }));
    vi.mocked(getSupabaseAdmin).mockReturnValue({ rpc: adminRpc } as never);
    return server;
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("voids the gift card, refunds the card leg, and credits only the wallet leg", async () => {
    const { refundProductOrderOnlineTender } = await import(
      "@/lib/ecommerce/refund-product-order-online-tender"
    );
    const { voidProductOrderGiftCardIfNeeded, applyProductOrderCancelRefundSideEffects } =
      await import("@/lib/orders/product-order-lifecycle");
    vi.mocked(refundProductOrderOnlineTender).mockResolvedValue({
      attempted: true,
      refundedAmount: 90,
      refundId: "rf_1",
    });
    await setup();

    const res = await patch({ status: "refunded" });

    expect(res.status).toBe(200);
    expect(voidProductOrderGiftCardIfNeeded).toHaveBeenCalledOnce();
    expect(adminRpc).toHaveBeenCalledWith(
      "wallet_credit_admin",
      expect.objectContaining({ p_amount: 20 }),
    );
    expect(vi.mocked(applyProductOrderCancelRefundSideEffects).mock.calls[0][3]).toMatchObject({
      newStatus: "refunded",
      refundAmount: 150,
      onlineRefundedAmount: 90,
    });
  });

  it("surfaces a wallet failure after tender moved, keeping the order refunded with restock + ledger reversal", async () => {
    const { refundProductOrderOnlineTender } = await import(
      "@/lib/ecommerce/refund-product-order-online-tender"
    );
    const { restockProductOrderLineItems, applyProductOrderCancelRefundSideEffects } =
      await import("@/lib/orders/product-order-lifecycle");
    vi.mocked(refundProductOrderOnlineTender).mockResolvedValue({
      attempted: true,
      refundedAmount: 90,
      refundId: "rf_1",
    });
    const server = await setup();
    adminRpc.mockResolvedValue({ data: null, error: { message: "wallet down" } });

    const res = await patch({ status: "refunded" });

    expect(res.status).toBe(500);
    expect((await res.json()).error?.code).toBe("WALLET_CREDIT_FAILED_PARTIAL");
    expect(server.updates.some((u) => u.payment_status === "paid")).toBe(false);
    expect(restockProductOrderLineItems).toHaveBeenCalledOnce();
    expect(applyProductOrderCancelRefundSideEffects).toHaveBeenCalledOnce();
  });

  it("rolls the order back without restocking or cancelling the shipment when nothing else moved", async () => {
    const { refundProductOrderOnlineTender } = await import(
      "@/lib/ecommerce/refund-product-order-online-tender"
    );
    const { restockProductOrderLineItems, applyProductOrderCancelRefundSideEffects } =
      await import("@/lib/orders/product-order-lifecycle");
    const { cancelCourierShipmentForOrder } = await import("@/lib/orders/shipping");
    vi.mocked(refundProductOrderOnlineTender).mockResolvedValue({
      attempted: false,
      refundedAmount: 0,
      refundId: null,
    });
    const server = await setup(
      makeOrder({
        gift_card_amount: 0,
        payment_method: "wallet",
        fulfillment_type: "delivery",
        courier_shipment_id: "shp_1",
      }),
    );
    adminRpc.mockResolvedValue({ data: null, error: { message: "wallet down" } });

    const res = await patch({ status: "refunded" });

    expect(res.status).toBe(500);
    expect((await res.json()).error?.code).toBe("WALLET_CREDIT_FAILED");
    expect(server.updates.some((u) => u.payment_status === "paid")).toBe(true);
    expect(restockProductOrderLineItems).not.toHaveBeenCalled();
    expect(cancelCourierShipmentForOrder).not.toHaveBeenCalled();
    expect(applyProductOrderCancelRefundSideEffects).not.toHaveBeenCalled();
  });

  it("successful refund restocks once as a return and cancels the courier shipment", async () => {
    const { refundProductOrderOnlineTender } = await import(
      "@/lib/ecommerce/refund-product-order-online-tender"
    );
    const { restockProductOrderLineItems } = await import("@/lib/orders/product-order-lifecycle");
    const { cancelCourierShipmentForOrder } = await import("@/lib/orders/shipping");
    vi.mocked(refundProductOrderOnlineTender).mockResolvedValue({
      attempted: true,
      refundedAmount: 90,
      refundId: "rf_1",
    });
    await setup(makeOrder({ fulfillment_type: "delivery", courier_shipment_id: "shp_1" }));

    const res = await patch({ status: "refunded" });

    expect(res.status).toBe(200);
    expect(restockProductOrderLineItems).toHaveBeenCalledOnce();
    expect(vi.mocked(restockProductOrderLineItems).mock.calls[0][2]).toMatchObject({
      movementType: "return",
      actorUserId: "admin-1",
    });
    expect(cancelCourierShipmentForOrder).toHaveBeenCalledOnce();
  });

  it("re-sending refunded for an already-refunded order does not restock or reverse the ledger again", async () => {
    const { restockProductOrderLineItems, applyProductOrderCancelRefundSideEffects } =
      await import("@/lib/orders/product-order-lifecycle");
    const { refundProductOrderOnlineTender } = await import(
      "@/lib/ecommerce/refund-product-order-online-tender"
    );
    await setup(makeOrder({ status: "refunded", payment_status: "refunded" }));

    const res = await patch({ status: "refunded" });

    expect(res.status).toBe(200);
    expect(restockProductOrderLineItems).not.toHaveBeenCalled();
    expect(applyProductOrderCancelRefundSideEffects).not.toHaveBeenCalled();
    expect(refundProductOrderOnlineTender).not.toHaveBeenCalled();
  });

  it("cancel of a paid order whose wallet refund fails reports REFUND_PENDING", async () => {
    const { applyProductOrderCancelRefundSideEffects } = await import(
      "@/lib/orders/product-order-lifecycle"
    );
    vi.mocked(applyProductOrderCancelRefundSideEffects).mockResolvedValueOnce({
      walletCreditFailed: true,
    });
    await setup();

    const res = await patch({ status: "cancelled" });

    expect(res.status).toBe(502);
    expect((await res.json()).error?.code).toBe("REFUND_PENDING");
  });

  it("cancel (no refund) still restocks and cancels the shipment", async () => {
    const { restockProductOrderLineItems } = await import("@/lib/orders/product-order-lifecycle");
    const { cancelCourierShipmentForOrder } = await import("@/lib/orders/shipping");
    await setup(
      makeOrder({ payment_status: "pending", fulfillment_type: "delivery", courier_shipment_id: "shp_1" }),
    );

    const res = await patch({ status: "cancelled" });

    expect(res.status).toBe(200);
    expect(restockProductOrderLineItems).toHaveBeenCalledOnce();
    expect(vi.mocked(restockProductOrderLineItems).mock.calls[0][2]).toMatchObject({
      movementType: "cancel",
    });
    expect(cancelCourierShipmentForOrder).toHaveBeenCalledOnce();
  });
});
