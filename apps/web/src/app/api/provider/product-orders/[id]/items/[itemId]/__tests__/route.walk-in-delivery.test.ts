import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequirePermission = vi.fn();
const mockGetProviderIdForUser = vi.fn();
const mockFulfillWalkInProductOrderDelivery = vi.fn();
const itemUpdates: unknown[] = [];

vi.mock("@/lib/auth/requirePermission", () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));
vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return { ...actual, getProviderIdForUser: (...args: unknown[]) => mockGetProviderIdForUser(...args) };
});
vi.mock("@/lib/provider-sales/fulfill-walk-in-product-order-delivery", () => ({
  fulfillWalkInProductOrderDelivery: (...args: unknown[]) => mockFulfillWalkInProductOrderDelivery(...args),
}));
vi.mock("@/lib/orders/product-order-lifecycle", () => ({
  restockProductOrderLineItems: vi.fn(),
}));
vi.mock("@/lib/notifications/notify-product-order-status", () => ({
  dispatchProductOrderStatusNotification: vi.fn(),
}));
vi.mock("@/lib/notifications/dispatch-template-notification", () => ({
  dispatchTemplateNotification: vi.fn(),
}));

const ORDER = {
  id: "order-1",
  provider_id: "provider-1",
  customer_id: null,
  tenant_id: null,
  order_number: "PO-1",
  status: "confirmed",
  payment_status: "paid",
  payment_method: "cash",
  order_source: "walk_in",
  fulfillment_type: "collection",
  collection_location_id: null,
  tracking_number: null,
  carrier: null,
  partially_shipped_notified_at: null,
};

function chain(result: unknown) {
  const c: Record<string, unknown> = {};
  for (const method of ["select", "eq", "update"]) c[method] = vi.fn(() => c);
  c.maybeSingle = vi.fn(async () => ({ data: result, error: null }));
  c.single = vi.fn(async () => ({ data: result, error: null }));
  c.then = (resolve: (value: unknown) => unknown) => resolve({ data: result, error: null });
  return c;
}

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: vi.fn(async () => ({
    from: (table: string) => {
      if (table === "product_orders") return chain(ORDER);
      const items = chain([
        { id: "line-1", product_name: "Shampoo", quantity: 1, fulfilment_status: "pending", fulfilled_qty: 0 },
      ]);
      items.update = vi.fn((payload: unknown) => {
        itemUpdates.push(payload);
        return items;
      });
      return items;
    },
  })),
}));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => chain({ id: "order-1", status: "delivered", items: [] }),
  }),
}));

import { PATCH } from "../route";

function request() {
  return new NextRequest("http://localhost/api/provider/product-orders/order-1/items/line-1", {
    method: "PATCH",
    body: JSON.stringify({ fulfilment_status: "delivered" }),
  });
}

describe("PATCH walk-in line delivery", () => {
  beforeEach(() => {
    itemUpdates.length = 0;
    mockRequirePermission.mockResolvedValue({ authorized: true, user: { id: "user-1" } });
    mockGetProviderIdForUser.mockResolvedValue("provider-1");
    mockFulfillWalkInProductOrderDelivery.mockReset();
  });

  it("does not mark the line delivered when the products were not taken", async () => {
    mockFulfillWalkInProductOrderDelivery.mockResolvedValue({
      ok: false,
      reason: "Only 0 of Shampoo is in stock",
    });
    const response = await PATCH(request(), {
      params: Promise.resolve({ id: "order-1", itemId: "line-1" }),
    });
    expect(response.status).toBe(409);
    expect(itemUpdates).toEqual([]);
  });

  it("marks the line delivered after the products are taken", async () => {
    mockFulfillWalkInProductOrderDelivery.mockResolvedValue({ ok: true });
    const response = await PATCH(request(), {
      params: Promise.resolve({ id: "order-1", itemId: "line-1" }),
    });
    expect(response.status).toBe(200);
    expect(mockFulfillWalkInProductOrderDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ providerId: "provider-1", orderId: "order-1" }),
    );
    expect(itemUpdates).toEqual([
      expect.objectContaining({ fulfilment_status: "delivered" }),
    ]);
  });
});
