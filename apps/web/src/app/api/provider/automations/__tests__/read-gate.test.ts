import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequirePermission = vi.fn();
const mockRequireAnyPermission = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockGetSupabaseAdmin = vi.fn();

vi.mock("@/lib/auth/requirePermission", () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
  requireAnyPermission: (...args: unknown[]) => mockRequireAnyPermission(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: (...args: unknown[]) => mockGetSupabaseAdmin(...args),
}));

function forbidden() {
  return {
    authorized: false,
    response: Response.json({ data: null, error: { code: "FORBIDDEN" } }, { status: 403 }),
  };
}

describe("automation and supplier reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue(forbidden());
    mockRequireAnyPermission.mockResolvedValue(forbidden());
  });

  it("does not list automations without manage_marketing", async () => {
    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/provider/automations"));
    expect(res.status).toBe(403);
    expect(mockRequirePermission).toHaveBeenCalledWith("manage_marketing", expect.anything());
    expect(mockGetSupabaseServer).not.toHaveBeenCalled();
  });

  it("does not load one automation", async () => {
    const { GET } = await import("../[id]/route");
    const res = await GET(new NextRequest("http://localhost/api/provider/automations/auto-1"), {
      params: Promise.resolve({ id: "auto-1" }),
    });
    expect(res.status).toBe(403);
    expect(mockGetSupabaseServer).not.toHaveBeenCalled();
  });

  it("does not return execution history with customer email and phone", async () => {
    const { GET } = await import("../[id]/executions/route");
    const res = await GET(new NextRequest("http://localhost/api/provider/automations/auto-1/executions"), {
      params: Promise.resolve({ id: "auto-1" }),
    });
    expect(res.status).toBe(403);
    expect(mockGetSupabaseServer).not.toHaveBeenCalled();
  });

  it("does not list supplier contact details without a product permission", async () => {
    const { GET } = await import("../../suppliers/route");
    const res = await GET(new NextRequest("http://localhost/api/provider/suppliers"));
    expect(res.status).toBe(403);
    expect(mockRequireAnyPermission).toHaveBeenCalledWith(
      ["view_products", "edit_products"],
      expect.anything(),
    );
    expect(mockGetSupabaseServer).not.toHaveBeenCalled();
    expect(mockGetSupabaseAdmin).not.toHaveBeenCalled();
  });
});
