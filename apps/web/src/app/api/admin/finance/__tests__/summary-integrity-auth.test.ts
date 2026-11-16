import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireAdminSection = vi.fn();
vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireAdminSection: (...args: unknown[]) => mockRequireAdminSection(...args),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(),
}));

describe("finance admin auth failures", () => {
  beforeEach(() => {
    mockRequireAdminSection.mockReset();
    mockRequireAdminSection.mockRejectedValue(new Error("Authentication required"));
  });

  it("returns 401 from finance summary", async () => {
    const { GET } = await import("../summary/route");
    const res = await GET(new NextRequest("http://localhost/api/admin/finance/summary"));
    expect(res.status).toBe(401);
  });

  it("returns 401 from the integrity report", async () => {
    const { GET } = await import("../integrity-report/route");
    const res = await GET(new NextRequest("http://localhost/api/admin/finance/integrity-report"));
    expect(res.status).toBe(401);
  });
});
