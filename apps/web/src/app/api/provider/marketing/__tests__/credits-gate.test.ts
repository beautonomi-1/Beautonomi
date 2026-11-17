import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequirePermission = vi.fn();
const mockGetSupabaseServer = vi.fn();

vi.mock("@/lib/auth/requirePermission", () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

describe("marketing credit routes require manage_marketing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue({
      authorized: false,
      response: Response.json({ data: null, error: { code: "FORBIDDEN" } }, { status: 403 }),
    });
  });

  it("does not return the credit balance", async () => {
    const { GET } = await import("../credits/route");
    const res = await GET(new NextRequest("http://localhost/api/provider/marketing/credits"));
    expect(res.status).toBe(403);
    expect(mockGetSupabaseServer).not.toHaveBeenCalled();
  });

  it("does not return the credit ledger", async () => {
    const { GET } = await import("../credits/ledger/route");
    const res = await GET(new NextRequest("http://localhost/api/provider/marketing/credits/ledger"));
    expect(res.status).toBe(403);
    expect(mockGetSupabaseServer).not.toHaveBeenCalled();
  });

  it("does not start a credit top-up", async () => {
    const { POST } = await import("../credits/topup/route");
    const res = await POST(
      new NextRequest("http://localhost/api/provider/marketing/credits/topup", {
        method: "POST",
        body: JSON.stringify({ amount_zar: 50 }),
      }),
    );
    expect(res.status).toBe(403);
    expect(mockGetSupabaseServer).not.toHaveBeenCalled();
  });

  it("does not estimate a send against the salon balance", async () => {
    const { GET } = await import("../credits/estimate/route");
    const res = await GET(
      new NextRequest("http://localhost/api/provider/marketing/credits/estimate?channel=sms&recipients=10"),
    );
    expect(res.status).toBe(403);
    expect(mockGetSupabaseServer).not.toHaveBeenCalled();
  });

  it("does not return marketing status with the balance", async () => {
    const { GET } = await import("../status/route");
    const res = await GET(new NextRequest("http://localhost/api/provider/marketing/status"));
    expect(res.status).toBe(403);
    expect(mockGetSupabaseServer).not.toHaveBeenCalled();
  });
});
