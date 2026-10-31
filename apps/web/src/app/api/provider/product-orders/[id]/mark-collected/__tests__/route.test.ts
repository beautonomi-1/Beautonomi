import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequirePermission = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockGetProviderIdForUser = vi.fn();
const mockRecordProductOrderPayment = vi.fn();

vi.mock("@/lib/auth/requirePermission", () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    getProviderIdForUser: (...args: unknown[]) => mockGetProviderIdForUser(...args),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: vi.fn() }),
}));

vi.mock("@/lib/orders/record-product-order-payment", () => ({
  recordProductOrderPayment: (...args: unknown[]) => mockRecordProductOrderPayment(...args),
}));

vi.mock("@/lib/notifications/notify-product-order-paid", () => ({
  notifyProductOrderPaidIfTransitioned: vi.fn().mockResolvedValue(undefined),
}));

const PROVIDER_ID = "22222222-2222-4222-8222-222222222222";
const ORDER_ID = "33333333-3333-4333-8333-333333333333";

function makeSupabase(order: Record<string, unknown> | null) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: order, error: null })),
          })),
        })),
      })),
    })),
  };
}

describe("POST /api/provider/product-orders/[id]/mark-collected", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue({ authorized: true, user: { id: "user-1" } });
    mockGetProviderIdForUser.mockResolvedValue(PROVIDER_ID);
  });

  it("rejects appointment-linked orders with PAYMENT_ON_BOOKING", async () => {
    mockGetSupabaseServer.mockResolvedValue(
      makeSupabase({
        id: ORDER_ID,
        provider_id: PROVIDER_ID,
        order_number: "PO-1",
        total_amount: 50,
        payment_status: "pending",
        payment_method: "booking",
        status: "confirmed",
        order_source: "appointment",
      }),
    );

    const { POST } = await import("../route");
    const req = new NextRequest(`http://localhost/api/provider/product-orders/${ORDER_ID}/mark-collected`, {
      method: "POST",
      body: JSON.stringify({ payment_method: "cash" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: ORDER_ID }) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error?.code ?? body.code).toBe("PAYMENT_ON_BOOKING");
    expect(mockRecordProductOrderPayment).not.toHaveBeenCalled();
  });

  it("allows walk-in orders to record collection", async () => {
    mockGetSupabaseServer.mockResolvedValue(
      makeSupabase({
        id: ORDER_ID,
        provider_id: PROVIDER_ID,
        order_number: "PO-2",
        total_amount: 80,
        payment_status: "pending",
        payment_method: "cash",
        status: "confirmed",
        order_source: "walk_in",
      }),
    );
    mockRecordProductOrderPayment.mockResolvedValue({
      ok: true,
      duplicate: false,
      transitionedToPaid: true,
    });

    const { POST } = await import("../route");
    const req = new NextRequest(`http://localhost/api/provider/product-orders/${ORDER_ID}/mark-collected`, {
      method: "POST",
      body: JSON.stringify({ payment_method: "cash" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: ORDER_ID }) });

    expect(res.status).toBe(200);
    expect(mockRecordProductOrderPayment).toHaveBeenCalled();
  });

  it("records only the in-person remainder when wallet and gift card already paid", async () => {
    mockGetSupabaseServer.mockResolvedValue(
      makeSupabase({
        id: ORDER_ID,
        provider_id: PROVIDER_ID,
        order_number: "PO-3",
        total_amount: 150,
        wallet_amount: 40,
        gift_card_amount: 10,
        payment_status: "pending",
        payment_method: "cash",
        status: "confirmed",
        order_source: "online",
      }),
    );
    mockRecordProductOrderPayment.mockResolvedValue({
      ok: true,
      duplicate: false,
      transitionedToPaid: true,
    });

    const { POST } = await import("../route");
    const req = new NextRequest(`http://localhost/api/provider/product-orders/${ORDER_ID}/mark-collected`, {
      method: "POST",
      body: JSON.stringify({ payment_method: "cash" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: ORDER_ID }) });

    expect(res.status).toBe(200);
    expect(mockRecordProductOrderPayment).toHaveBeenCalledWith(
      expect.objectContaining({ amountMajor: 100, platformHeld: false, provider: "cash" }),
    );
  });

  it("rejects collection when wallet and gift card already cover the order", async () => {
    mockGetSupabaseServer.mockResolvedValue(
      makeSupabase({
        id: ORDER_ID,
        provider_id: PROVIDER_ID,
        order_number: "PO-4",
        total_amount: 80,
        wallet_amount: 80,
        gift_card_amount: 0,
        payment_status: "pending",
        payment_method: "cash",
        status: "confirmed",
        order_source: "online",
      }),
    );

    const { POST } = await import("../route");
    const req = new NextRequest(`http://localhost/api/provider/product-orders/${ORDER_ID}/mark-collected`, {
      method: "POST",
      body: JSON.stringify({ payment_method: "cash" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: ORDER_ID }) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error?.code ?? body.code).toBe("NOTHING_TO_COLLECT");
    expect(mockRecordProductOrderPayment).not.toHaveBeenCalled();
  });
});
