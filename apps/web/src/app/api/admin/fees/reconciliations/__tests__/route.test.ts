import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireAdminSection = vi.fn();
const mockGetSupabaseAdmin = vi.fn();
const mockCompute = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireAdminSection: (...args: unknown[]) => mockRequireAdminSection(...args),
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
}));

vi.mock("@/lib/admin/fee-reconciliation-compute", () => ({
  computeGatewayFeeSuggestions: (...args: unknown[]) => mockCompute(...args),
}));

describe("GET /api/admin/fees/reconciliations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockRequireAdminSection.mockResolvedValue({ user: { id: "admin-1", role: "superadmin" } });

    const chain = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn(async () => ({
        data: [],
        error: null,
        count: 0,
      })),
    };
    mockGetSupabaseAdmin.mockReturnValue({ from: vi.fn(() => chain) });

    mockCompute.mockResolvedValue({
      recorded_fees: 12.5,
      expected_fees_from_config: 12.9,
      charge_count: 3,
      payout_transfer_count: 1,
    });
  });

  it("returns auto_computed when auto_compute=true with gateway and date range", async () => {
    const { GET } = await import("../route");
    const req = new NextRequest(
      "http://localhost/api/admin/fees/reconciliations?auto_compute=true&gateway=paystack&start_date=2026-01-01&end_date=2026-01-31",
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.error).toBeNull();
    expect(body.auto_computed).toMatchObject({
      recorded_fees: 12.5,
      expected_fees_from_config: 12.9,
      charge_count: 3,
      payout_transfer_count: 1,
    });
    expect(body.auto_compute_error).toBeNull();
    expect(mockCompute).toHaveBeenCalledWith(
      expect.anything(),
      "paystack",
      "2026-01-01",
      "2026-01-31",
    );
  });

  it("returns auto_compute_error when compute throws", async () => {
    mockCompute.mockRejectedValue(new Error("start_date must be on or before end_date"));
    const { GET } = await import("../route");
    const req = new NextRequest(
      "http://localhost/api/admin/fees/reconciliations?auto_compute=true&gateway=paystack&start_date=2026-02-01&end_date=2026-01-01",
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.auto_computed).toBeNull();
    expect(body.auto_compute_error).toContain("start_date");
  });
});
