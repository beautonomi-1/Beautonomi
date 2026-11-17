import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * F3-06 — POST /api/provider/sales must not trust client-computed money:
 * unit_price resolved from the catalogue, subtotal recomputed, discount
 * clamped to subtotal, tip ≥ 0, payment_status derived server-side.
 */

const PROVIDER_ID = "44444444-4444-4444-8444-444444444444";
const SVC_ID = "55555555-5555-4555-8555-555555555555";

const mockRequirePermission = vi.fn();
const mockGetProviderIdForUser = vi.fn();
const salesInsert = vi.fn();
const saleItemsInsert = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ getSupabaseServer: vi.fn(async () => buildSupabase()) }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({}) }));
vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return { ...actual, getProviderIdForUser: (...a: unknown[]) => mockGetProviderIdForUser(...a) };
});
vi.mock("@/lib/auth/requirePermission", () => ({
  requirePermission: (...a: unknown[]) => mockRequirePermission(...a),
  requireAnyPermission: (...a: unknown[]) => mockRequirePermission(...a),
}));
vi.mock("@/lib/subscriptions/feature-access", () => ({
  checkNewGateFeatureAccess: vi.fn(async () => true),
  SUBSCRIPTION_FEATURE_KEYS: { posWalkIn: "pos_walk_in" },
}));
vi.mock("@/lib/provider-sales/pos-product-stock", () => ({
  validatePosProductStock: vi.fn(async () => null),
  applyPosProductStockDecrementsReversible: vi.fn(async () => []),
  restorePosProductStock: vi.fn(async () => undefined),
}));
vi.mock("@/lib/tax/resolve-provider-vat", () => ({
  resolveProviderVat: vi.fn(async () => ({ registered: false, inclusive: true, ratePercent: 0 })),
}));
vi.mock("@/lib/gift-cards/sale-gift-card", () => ({
  captureSaleGiftCard: vi.fn(),
  reserveSaleGiftCard: vi.fn(),
  saleGiftTenderMismatch: vi.fn(() => null),
  saleCardAmountStillDue: vi.fn(),
  sumSaleGiftCardPaidBySaleIds: vi.fn(),
  sumSuccessfulSaleCardTakenBySaleIds: vi.fn(),
  voidSaleGiftCard: vi.fn(),
}));
vi.mock("@/lib/payments/yoco-feature-gate", () => ({
  requireYocoPlatformEnabledForProvider: vi.fn(async () => null),
}));

function chain(result: unknown) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "order", "limit", "delete", "update", "gte", "lte", "is"]) {
    c[m] = vi.fn(() => c);
  }
  c.single = vi.fn(async () => ({ data: result, error: null }));
  c.maybeSingle = vi.fn(async () => ({ data: result, error: null }));
  c.then = (resolve: (v: unknown) => unknown) => resolve({ data: result, error: null });
  return c;
}

function buildSupabase() {
  return {
    from: vi.fn((table: string) => {
      if (table === "offerings") return chain({ id: SVC_ID, price: 200, provider_id: PROVIDER_ID });
      if (table === "providers") return chain({ tenant_id: "t1", currency: "ZAR" });
      if (table === "sales") {
        const c = chain({ id: "sale-1", sale_date: "2026-06-01T10:00:00.000Z", subtotal: 0, tax_amount: 0, total_amount: 0, payment_method: "cash", payment_status: "completed" });
        c.insert = vi.fn((row: unknown) => {
          salesInsert(row);
          return c;
        });
        return c;
      }
      if (table === "sale_items") {
        const c = chain([]);
        c.insert = vi.fn(async (rows: unknown) => {
          saleItemsInsert(rows);
          return { error: null };
        });
        return c;
      }
      if (table === "sale_payments") {
        const c = chain(null);
        c.insert = vi.fn(async () => ({ error: null }));
        return c;
      }
      return chain(null);
    }),
  };
}

function post(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/provider/sales", { method: "POST", body: JSON.stringify(body) });
}

const serviceLine = { item_id: SVC_ID, type: "service", name: "Cut", quantity: 2, unit_price: 1 };

describe("POST /api/provider/sales — server-side totals (F3-06)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue({ authorized: true, user: { id: "user-1", role: "provider_owner" } });
    mockGetProviderIdForUser.mockResolvedValue(PROVIDER_ID);
  });

  it("resolves unit_price from the catalogue and recomputes subtotal (ignores client subtotal)", async () => {
    const { POST } = await import("../route");
    const res = await POST(post({ items: [serviceLine], subtotal: 1, total_amount: 1, payment_method: "cash" }));
    expect(res.status).toBe(200);
    const sale = salesInsert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(sale.subtotal).toBe(400);
    expect(sale.total_amount).toBe(400);
    const items = saleItemsInsert.mock.calls[0]?.[0] as Array<Record<string, unknown>>;
    expect(items[0]?.unit_price).toBe(200);
    expect(items[0]?.total_price).toBe(400);
  });

  it("clamps discount to the subtotal and tip to ≥ 0", async () => {
    const { POST } = await import("../route");
    const res = await POST(
      post({ items: [serviceLine], total_amount: 0, discount_amount: 99999, tip_amount: -50, payment_method: "cash" }),
    );
    expect(res.status).toBe(200);
    const sale = salesInsert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(sale.discount_amount).toBe(400);
    expect(sale.total_amount).toBe(0);
  });

  it("does not accept an arbitrary payment_status from the client", async () => {
    const { POST } = await import("../route");
    const res = await POST(post({ items: [serviceLine], total_amount: 400, payment_method: "cash", payment_status: "refunded" }));
    expect(res.status).toBe(200);
    const sale = salesInsert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(sale.payment_status).toBe("completed");
  });

  it("still honours the deferred 'pending' status used by terminal flows", async () => {
    const { POST } = await import("../route");
    const res = await POST(post({ items: [serviceLine], total_amount: 400, payment_method: "card", payment_status: "pending" }));
    expect(res.status).toBe(200);
    const sale = salesInsert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(sale.payment_status).toBe("pending");
  });

  it("rejects negative unit_price on ad-hoc lines", async () => {
    const { POST } = await import("../route");
    const res = await POST(
      post({ items: [{ item_id: null, type: "service", name: "Adhoc", quantity: 1, unit_price: -10 }], total_amount: -10, payment_method: "cash" }),
    );
    expect(res.status).toBe(400);
    expect(salesInsert).not.toHaveBeenCalled();
  });
});
