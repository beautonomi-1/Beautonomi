import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequirePermission = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockGetSupabaseAdmin = vi.fn();

vi.mock("@/lib/auth/requirePermission", () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
}));

describe("client contact reads require view_clients", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue({
      authorized: false,
      response: Response.json({ data: null, error: { code: "FORBIDDEN" } }, { status: 403 }),
    });
  });

  it("does not load a customer profile", async () => {
    const { GET } = await import("../[id]/profile/route");
    const res = await GET(new NextRequest("http://localhost/api/provider/customers/cust-1/profile"), {
      params: Promise.resolve({ id: "cust-1" }),
    });
    expect(res.status).toBe(403);
    expect(mockGetSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("does not list membership subscribers", async () => {
    const { GET } = await import("../../membership-subscribers/route");
    const res = await GET(new NextRequest("http://localhost/api/provider/membership-subscribers"));
    expect(res.status).toBe(403);
    expect(mockGetSupabaseAdmin).not.toHaveBeenCalled();
  });
});
