import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockGetSupabaseAdmin = vi.fn();
const mockResolveTenantIdWithZaFallback = vi.fn();
const mockGetTenantRegionConfig = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
}));

vi.mock("@/lib/tenant/resolve-tenant-from-db", () => ({
  resolveTenantIdWithZaFallback: (...args: unknown[]) => mockResolveTenantIdWithZaFallback(...args),
}));

vi.mock("@/lib/regions/config", () => ({
  getTenantRegionConfig: (...args: unknown[]) => mockGetTenantRegionConfig(...args),
}));

class BookingsQuery {
  eq = vi.fn(() => this);
  neq = vi.fn(() => this);
  in = vi.fn(() => this);
  or = vi.fn(() => this);
  order = vi.fn(() => this);
  select = vi.fn(() => this);
  range = vi.fn(async () => ({
    data: [
      {
        id: "booking-1",
        status: "completed",
        scheduled_at: "2026-01-01T10:00:00.000Z",
        booking_services: [],
        booking_addons: [],
        booking_products: [],
      },
    ],
    error: null,
    count: 125,
  }));
}

describe("GET /api/me/bookings pagination", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "customer-1", role: "customer" } });
    mockResolveTenantIdWithZaFallback.mockResolvedValue("tenant-za");
    mockGetTenantRegionConfig.mockResolvedValue({ defaultCurrency: "ZAR" });
  });

  it("filters past bookings in SQL and applies range pagination", async () => {
    const query = new BookingsQuery();
    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn(() => query),
    });

    const { GET } = await import("../route");
    const req = new NextRequest(
      "http://localhost/api/me/bookings?status=past&page=2&limit=100&sort_by=scheduled_at&sort_dir=desc",
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(query.neq).toHaveBeenCalledWith("status", "cancelled");
    expect(query.neq).toHaveBeenCalledWith("status", "in_progress");
    expect(query.or).toHaveBeenCalledWith(expect.stringContaining("status.eq.completed"));
    expect(query.range).toHaveBeenCalledWith(100, 199);
    expect(body.data.items).toHaveLength(1);
    expect(body.data.total).toBe(125);
    expect(body.data.has_more).toBe(false);
  });
});
