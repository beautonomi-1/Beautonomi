/**
 * F2-25 / F-07: additional-charge `amount` must be bounded (positive, max 2dp,
 * upper cap). Previously `z.number().positive()` accepted 1e12 and 0.001.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequirePermission = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/auth/requirePermission", () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: vi.fn(async () => ({ from: mockFrom })),
}));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(() => ({ from: mockFrom })),
}));
vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return { ...actual, getProviderIdForUser: vi.fn(async () => "prov-1") };
});
vi.mock("@/lib/tenant/resolve-tenant-from-db", () => ({
  resolveTenantIdWithZaFallback: vi.fn(async () => "tenant-1"),
}));
vi.mock("@/lib/regions/config", () => ({
  getTenantRegionConfig: vi.fn(async () => ({ defaultCurrency: "ZAR" })),
}));
vi.mock("@/lib/provider-booking/booking-branch-access", () => ({
  assertProviderUserCanAccessBookingBranch: vi.fn(async () => ({ allowed: true })),
}));
vi.mock("@/lib/bookings/resolve-payment-tenant", () => ({
  resourceTenantMatchesHostTenant: vi.fn(() => true),
}));

function post(body: unknown) {
  return new NextRequest("http://localhost/api/provider/bookings/booking-1/request-payment", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}
const params = { params: Promise.resolve({ id: "booking-1" }) };

describe("POST /api/provider/bookings/[id]/request-payment — amount bounds (F2-25)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue({
      authorized: true,
      user: { id: "user-1", role: "provider_owner" },
    });
    // If validation lets the request through, DB access blows up → 500, not 400.
    mockFrom.mockImplementation(() => {
      throw new Error("DB should not be reached for an invalid amount");
    });
  });

  it("rejects an absurdly large amount with 400 VALIDATION_ERROR", async () => {
    const { POST } = await import("../route");
    const res = await POST(post({ description: "Extra", amount: 1_000_000_000 }), params);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error?.code ?? json.code).toBe("VALIDATION_ERROR");
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("rejects fractional-cent amounts (more than 2 decimals)", async () => {
    const { POST } = await import("../route");
    const res = await POST(post({ description: "Extra", amount: 10.005 }), params);
    expect(res.status).toBe(400);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("rejects zero / negative amounts", async () => {
    const { POST } = await import("../route");
    expect((await POST(post({ description: "Extra", amount: 0 }), params)).status).toBe(400);
    expect((await POST(post({ description: "Extra", amount: -5 }), params)).status).toBe(400);
  });
});
