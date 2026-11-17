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

function forbidden() {
  return {
    authorized: false,
    response: Response.json({ data: null, error: { code: "FORBIDDEN" } }, { status: 403 }),
  };
}

describe("custom request reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue(forbidden());
  });

  it("does not list custom requests without send_messages", async () => {
    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/provider/custom-requests"));
    expect(res.status).toBe(403);
    expect(mockRequirePermission).toHaveBeenCalledWith("send_messages", expect.anything());
    expect(mockGetSupabaseServer).not.toHaveBeenCalled();
  });

  it("does not load one custom request", async () => {
    const { GET } = await import("../[id]/route");
    const res = await GET(new NextRequest("http://localhost/api/provider/custom-requests/req-1"), {
      params: Promise.resolve({ id: "req-1" }),
    });
    expect(res.status).toBe(403);
    expect(mockGetSupabaseServer).not.toHaveBeenCalled();
  });
});
