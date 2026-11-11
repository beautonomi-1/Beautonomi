import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireAnyPermission = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockGetSupabaseAdmin = vi.fn();

vi.mock("@/lib/auth/requirePermission", () => ({
  requireAnyPermission: (...args: unknown[]) => mockRequireAnyPermission(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: (...args: unknown[]) => mockGetSupabaseAdmin(...args),
}));

describe("messaging integration reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAnyPermission.mockResolvedValue({
      authorized: false,
      response: Response.json({ data: null, error: { code: "FORBIDDEN" } }, { status: 403 }),
    });
  });

  it("does not load Twilio settings without marketing or settings access", async () => {
    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/provider/twilio-integration"));
    expect(res.status).toBe(403);
    expect(mockGetSupabaseServer).not.toHaveBeenCalled();
    expect(mockGetSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("does not call Twilio for the account balance", async () => {
    const { GET } = await import("../balance/route");
    const res = await GET(new NextRequest("http://localhost/api/provider/twilio-integration/balance"));
    expect(res.status).toBe(403);
    expect(mockGetSupabaseServer).not.toHaveBeenCalled();
    expect(mockGetSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("does not load email integration settings", async () => {
    const { GET } = await import("../../email-integration/route");
    const res = await GET(new NextRequest("http://localhost/api/provider/email-integration"));
    expect(res.status).toBe(403);
    expect(mockGetSupabaseServer).not.toHaveBeenCalled();
    expect(mockGetSupabaseAdmin).not.toHaveBeenCalled();
  });
});
