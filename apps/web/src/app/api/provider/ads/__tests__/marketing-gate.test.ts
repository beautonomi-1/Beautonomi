import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequirePermission = vi.fn();
const mockGetSupabaseAdmin = vi.fn();

vi.mock("@/lib/auth/requirePermission", () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
}));

describe("ads money routes require manage_marketing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue({
      authorized: false,
      response: Response.json({ data: null, error: { code: "FORBIDDEN" } }, { status: 403 }),
    });
  });

  it("does not list campaign budgets without manage_marketing", async () => {
    const { GET } = await import("../campaigns/route");
    const res = await GET(new NextRequest("http://localhost/api/provider/ads/campaigns"));
    expect(res.status).toBe(403);
    expect(mockGetSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("does not return ad spend without manage_marketing", async () => {
    const { GET } = await import("../performance/route");
    const res = await GET(new NextRequest("http://localhost/api/provider/ads/performance"));
    expect(res.status).toBe(403);
    expect(mockGetSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("does not abandon a budget order without manage_marketing", async () => {
    const { POST } = await import("../budget-orders/[id]/abandon/route");
    const res = await POST(new NextRequest("http://localhost/api/provider/ads/budget-orders/ord-1/abandon", { method: "POST" }), {
      params: Promise.resolve({ id: "ord-1" }),
    });
    expect(res.status).toBe(403);
    expect(mockGetSupabaseAdmin).not.toHaveBeenCalled();
  });
});
