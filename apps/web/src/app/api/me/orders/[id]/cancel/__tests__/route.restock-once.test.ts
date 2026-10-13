import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockNextRequest } from "@/__tests__/helpers/mock-supabase";

vi.mock("@/lib/supabase/api-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/supabase/api-helpers")>(
    "@/lib/supabase/api-helpers",
  );
  return {
    ...actual,
    requireRoleInApi: vi.fn(async () => ({ user: { id: "cust-1", role: "customer" } })),
  };
});
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock("@/lib/orders/product-order-lifecycle", () => ({
  applyProductOrderCancelRefundSideEffects: vi.fn(async () => ({ walletCreditFailed: false })),
  restockProductOrderLineItems: vi.fn(async () => undefined),
}));
vi.mock("@/lib/ecommerce/refund-product-order-online-tender", () => ({
  refundProductOrderOnlineTender: vi.fn(async () => ({
    attempted: true,
    refundedAmount: 100,
    refundId: "rf_1",
  })),
}));
vi.mock("@/lib/notifications/notify-provider-team", () => ({
  notifyProviderTeamUsers: vi.fn(async () => undefined),
}));

const ORDER_ID = "oooooooo-oooo-oooo-oooo-oooooooooooo";

/**
 * Stateful product_orders double: the optimistic `update ... eq(status, old)` only
 * succeeds while the stored status still matches, like the real compare-and-swap.
 */
function makeDb(initialStatus = "confirmed") {
  const row = {
    id: ORDER_ID,
    customer_id: "cust-1",
    provider_id: "prov-1",
    tenant_id: "tenant-1",
    order_number: "PO-1",
    status: initialStatus,
    payment_status: "paid",
    payment_method: "paystack",
    payment_reference: "ps_ref_1",
    total_amount: 150,
    wallet_amount: 50,
    gift_card_amount: 0,
    currency: "ZAR",
    shipped_at: null,
    delivered_at: null,
  };
  const from = vi.fn(() => {
    let pendingUpdate: Record<string, unknown> | null = null;
    const filters: Record<string, unknown> = {};
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.update = vi.fn((payload: Record<string, unknown>) => {
      pendingUpdate = payload;
      return chain;
    });
    chain.eq = vi.fn((col: string, val: unknown) => {
      filters[col] = val;
      return chain;
    });
    chain.maybeSingle = vi.fn(async () => {
      if (!pendingUpdate) return { data: { ...row }, error: null };
      if (filters.status !== undefined && filters.status !== row.status) {
        return { data: null, error: null };
      }
      Object.assign(row, pendingUpdate);
      return { data: { ...row }, error: null };
    });
    return chain;
  });
  return { row, client: { from } };
}

async function cancel() {
  const { PATCH } = await import("../route");
  return PATCH(
    createMockNextRequest({
      method: "PATCH",
      url: `http://localhost/api/me/orders/${ORDER_ID}/cancel`,
      body: { reason: "Changed my mind" },
    }) as never,
    { params: Promise.resolve({ id: ORDER_ID }) },
  );
}

describe("PATCH /api/me/orders/[id]/cancel restocks at most once", () => {
  async function setup(initialStatus?: string) {
    const db = makeDb(initialStatus);
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    vi.mocked(getSupabaseAdmin).mockReturnValue(db.client as never);
    const lifecycle = await import("@/lib/orders/product-order-lifecycle");
    const tender = await import("@/lib/ecommerce/refund-product-order-online-tender");
    return {
      db,
      restock: vi.mocked(lifecycle.restockProductOrderLineItems),
      sideEffects: vi.mocked(lifecycle.applyProductOrderCancelRefundSideEffects),
      onlineRefund: vi.mocked(tender.refundProductOrderOnlineTender),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cancels, restocks once, and refunds card + wallet legs", async () => {
    const { restock, sideEffects } = await setup();

    const res = await cancel();

    expect(res.status).toBe(200);
    expect((await res.json()).data.refund).toEqual({
      online_refunded: 100,
      wallet_credited: 50,
      gift_card_restored: 0,
    });
    expect(restock).toHaveBeenCalledOnce();
    expect(sideEffects.mock.calls[0][3]).toMatchObject({ onlineRefundedAmount: 100 });
  });

  it("gateway refund failure falls back to wallet and still succeeds (no 502)", async () => {
    const { restock, sideEffects, onlineRefund } = await setup();
    onlineRefund.mockResolvedValueOnce({
      attempted: true,
      refundedAmount: 0,
      refundId: null,
      error: "gateway down",
    });

    const res = await cancel();

    expect(res.status).toBe(200);
    expect((await res.json()).data.refund.wallet_credited).toBe(150);
    expect(sideEffects.mock.calls[0][3]).toMatchObject({ onlineRefundedAmount: 0 });
    expect(restock).toHaveBeenCalledOnce();
  });

  it("wallet credit failure returns REFUND_PENDING rather than success", async () => {
    const { restock, sideEffects } = await setup();
    sideEffects.mockResolvedValueOnce({ walletCreditFailed: true });

    const res = await cancel();

    expect(res.status).toBe(502);
    expect((await res.json()).error?.code).toBe("REFUND_PENDING");
    expect(restock).toHaveBeenCalledOnce();
  });

  it("retry after any failure after the restock is rejected and does not restock again", async () => {
    const { restock, sideEffects } = await setup();
    sideEffects.mockRejectedValueOnce(new Error("db connection reset"));

    const first = await cancel();
    const retry = await cancel();

    expect(first.status).toBeGreaterThanOrEqual(500);
    expect(retry.status).toBe(400);
    expect((await retry.json()).error?.code).toBe("ALREADY_CANCELLED");
    expect(restock).toHaveBeenCalledOnce();
  });

  it("a concurrent duplicate that loses the status compare-and-swap does not restock", async () => {
    const { db, restock } = await setup();
    // Both requests read "confirmed"; the first flips it, the second's CAS then misses.
    const { PATCH } = await import("../route");
    const req = () =>
      PATCH(
        createMockNextRequest({
          method: "PATCH",
          url: `http://localhost/api/me/orders/${ORDER_ID}/cancel`,
          body: {},
        }) as never,
        { params: Promise.resolve({ id: ORDER_ID }) },
      );
    const originalFrom = db.client.from;
    let reads = 0;
    db.client.from = vi.fn((...args: unknown[]) => {
      const chain = (originalFrom as (...a: unknown[]) => Record<string, unknown>)(...args);
      const maybeSingle = chain.maybeSingle as () => Promise<{ data: unknown }>;
      chain.maybeSingle = vi.fn(async () => {
        const isRead = !(chain.update as ReturnType<typeof vi.fn>).mock.calls.length;
        if (isRead && reads++ === 1) {
          return { data: { ...db.row, status: "confirmed" }, error: null };
        }
        return maybeSingle();
      });
      return chain;
    }) as typeof db.client.from;

    const first = await req();
    const second = await req();

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect((await second.json()).error?.code).toBe("STALE_ORDER");
    expect(restock).toHaveBeenCalledOnce();
  });

  it("already-shipped orders are rejected before any restock", async () => {
    const { restock } = await setup("shipped");

    const res = await cancel();

    expect(res.status).toBe(400);
    expect(restock).not.toHaveBeenCalled();
  });
});
