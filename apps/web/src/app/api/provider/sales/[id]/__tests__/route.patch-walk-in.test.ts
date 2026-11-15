import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequirePermission = vi.fn();
const mockGetProviderIdForUser = vi.fn();
const mockRecordProductOrderPayment = vi.fn();
const mockFulfillWalkInProductOrderDelivery = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: vi.fn(async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    }),
  })),
}));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: "order-1",
                  payment_status: "pending",
                  total_amount: 80,
                  order_source: "walk_in",
                  status: "confirmed",
                },
                error: null,
              }),
            }),
          }),
        }),
      }),
    }),
  }),
}));
vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return { ...actual, getProviderIdForUser: (...args: unknown[]) => mockGetProviderIdForUser(...args) };
});
vi.mock("@/lib/auth/requirePermission", () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));
vi.mock("@/lib/orders/record-product-order-payment", () => ({
  recordProductOrderPayment: (...args: unknown[]) => mockRecordProductOrderPayment(...args),
}));
vi.mock("@/lib/provider-sales/fulfill-walk-in-product-order-delivery", () => ({
  fulfillWalkInProductOrderDelivery: (...args: unknown[]) =>
    mockFulfillWalkInProductOrderDelivery(...args),
}));
vi.mock("@/lib/provider-sales/pos-product-stock", () => ({
  applyPosProductStockDecrements: vi.fn(),
  posSaleRefundShouldRestoreStock: vi.fn(),
  restorePosSaleStock: vi.fn(),
  validatePosProductStock: vi.fn(),
}));
vi.mock("@/lib/reports/provider-sales-history", () => ({
  isBookingCollectionSale: vi.fn(() => false),
}));
vi.mock("@/lib/gift-cards/sale-gift-card", () => ({
  restoreSaleGiftCard: vi.fn(),
  settleReservedSaleGiftCard: vi.fn(),
  voidSaleGiftCard: vi.fn(),
}));

import { PATCH } from "../route";

function request() {
  return new NextRequest("http://localhost/api/provider/sales/order-1", {
    method: "PATCH",
    body: JSON.stringify({ payment_status: "completed", payment_provider: "yoco" }),
  });
}

describe("PATCH walk-in product order", () => {
  beforeEach(() => {
    mockRequirePermission.mockResolvedValue({ authorized: true, user: { id: "user-1" } });
    mockGetProviderIdForUser.mockResolvedValue("provider-1");
    mockRecordProductOrderPayment.mockReset();
    mockFulfillWalkInProductOrderDelivery.mockReset();
  });

  it("does not say the sale is finished when the payment was not recorded", async () => {
    mockRecordProductOrderPayment.mockResolvedValue({ ok: false });
    const response = await PATCH(request(), { params: Promise.resolve({ id: "order-1" }) });
    expect(response.status).toBe(409);
    expect(mockFulfillWalkInProductOrderDelivery).not.toHaveBeenCalled();
  });

  it("does not say the sale is finished when the products were not taken", async () => {
    mockRecordProductOrderPayment.mockResolvedValue({ ok: true });
    mockFulfillWalkInProductOrderDelivery.mockResolvedValue({
      ok: false,
      reason: "Only 0 of Shampoo is in stock",
    });
    const response = await PATCH(request(), { params: Promise.resolve({ id: "order-1" }) });
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.message).toBe("Only 0 of Shampoo is in stock");
  });

  it("says the sale is finished after the payment is recorded and the products are taken", async () => {
    mockRecordProductOrderPayment.mockResolvedValue({ ok: true });
    mockFulfillWalkInProductOrderDelivery.mockResolvedValue({ ok: true });
    const response = await PATCH(request(), { params: Promise.resolve({ id: "order-1" }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.payment_status).toBe("completed");
  });
});
