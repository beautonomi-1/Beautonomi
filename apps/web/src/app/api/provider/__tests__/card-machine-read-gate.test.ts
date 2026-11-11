import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireAnyPermission = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockGetSupabaseAdmin = vi.fn();

vi.mock("@/lib/auth/requirePermission", () => ({
  requireAnyPermission: (...args: unknown[]) => mockRequireAnyPermission(...args),
  requirePermission: (...args: unknown[]) => mockRequireAnyPermission(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
}));

describe("card-machine reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAnyPermission.mockResolvedValue({
      authorized: false,
      response: Response.json({ data: null, error: { code: "FORBIDDEN" } }, { status: 403 }),
    });
  });

  it("does not list Yoco devices or their takings", async () => {
    const { GET } = await import("../yoco/devices/route");
    const res = await GET(new NextRequest("http://localhost/api/provider/yoco/devices"));
    expect(res.status).toBe(403);
    expect(mockGetSupabaseServer).not.toHaveBeenCalled();
  });

  it("does not load one Yoco device", async () => {
    const { GET } = await import("../yoco/devices/[id]/route");
    const res = await GET(new NextRequest("http://localhost/api/provider/yoco/devices/dev-1"), {
      params: Promise.resolve({ id: "dev-1" }),
    });
    expect(res.status).toBe(403);
    expect(mockGetSupabaseServer).not.toHaveBeenCalled();
  });

  it("does not return the Yoco account email", async () => {
    const { GET } = await import("../yoco/oauth/status/route");
    const res = await GET(new NextRequest("http://localhost/api/provider/yoco/oauth/status"));
    expect(res.status).toBe(403);
    expect(mockGetSupabaseServer).not.toHaveBeenCalled();
    expect(mockGetSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("does not load PayCloud settings", async () => {
    const { GET } = await import("../paycloud/settings/route");
    const res = await GET(new NextRequest("http://localhost/api/provider/paycloud/settings"));
    expect(res.status).toBe(403);
    expect(mockGetSupabaseServer).not.toHaveBeenCalled();
  });

  it("does not list PayCloud reconciliation rows", async () => {
    const { GET } = await import("../paycloud/reconciliation/route");
    const res = await GET(new NextRequest("http://localhost/api/provider/paycloud/reconciliation"));
    expect(res.status).toBe(403);
    expect(mockGetSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("does not load or reconcile one PayCloud payment", async () => {
    const { GET } = await import("../paycloud/payments/[id]/route");
    const res = await GET(new NextRequest("http://localhost/api/provider/paycloud/payments/pay-1"), {
      params: Promise.resolve({ id: "pay-1" }),
    });
    expect(res.status).toBe(403);
    expect(mockGetSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("does not list terminal merchant connections", async () => {
    const { GET } = await import("../terminal-integrations/vendors/route");
    const res = await GET(new NextRequest("http://localhost/api/provider/terminal-integrations/vendors"));
    expect(res.status).toBe(403);
    expect(mockGetSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("does not load one terminal integration", async () => {
    const { GET } = await import("../terminal-integrations/[vendor]/route");
    const res = await GET(new NextRequest("http://localhost/api/provider/terminal-integrations/yoco"), {
      params: { vendor: "yoco" },
    });
    expect(res.status).toBe(403);
    expect(mockGetSupabaseAdmin).not.toHaveBeenCalled();
  });
});
