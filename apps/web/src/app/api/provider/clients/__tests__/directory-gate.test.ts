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

describe("client directory feeds require view_clients", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue({
      authorized: false,
      response: Response.json({ data: null, error: { code: "FORBIDDEN" } }, { status: 403 }),
    });
  });

  it("does not return serviced customers' contact details or spend", async () => {
    const { GET } = await import("../serviced/route");
    const res = await GET(new NextRequest("http://localhost/api/provider/clients/serviced"));
    expect(res.status).toBe(403);
    expect(mockRequirePermission).toHaveBeenCalledWith("view_clients", expect.anything());
    expect(mockGetSupabaseServer).not.toHaveBeenCalled();
    expect(mockGetSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("does not return conversation customers' contact details or spend", async () => {
    const { GET } = await import("../conversations/route");
    const res = await GET(new NextRequest("http://localhost/api/provider/clients/conversations"));
    expect(res.status).toBe(403);
    expect(mockGetSupabaseServer).not.toHaveBeenCalled();
    expect(mockGetSupabaseAdmin).not.toHaveBeenCalled();
  });
});
