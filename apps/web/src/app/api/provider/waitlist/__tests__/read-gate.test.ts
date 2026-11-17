import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequirePermission = vi.fn();
const mockCreateClient = vi.fn();

vi.mock("@/lib/auth/requirePermission", () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));

describe("GET /api/provider/waitlist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue({
      authorized: false,
      response: Response.json({ data: null, error: { code: "FORBIDDEN" } }, { status: 403 }),
    });
  });

  it("does not load waitlist contact details without view_calendar", async () => {
    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/provider/waitlist"));
    expect(res.status).toBe(403);
    expect(mockRequirePermission).toHaveBeenCalledWith("view_calendar", expect.anything());
    expect(mockCreateClient).not.toHaveBeenCalled();
  });
});
