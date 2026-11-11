import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = { authorized: false };

vi.mock("@/lib/reports/require-provider-reports-access", () => ({
  requireProviderReportsAccess: async () =>
    state.authorized
      ? { authorized: true, user: { id: "u1", role: "provider_owner" } }
      : {
          authorized: false,
          response: Response.json(
            { error: { code: "FORBIDDEN", message: "You do not have permission to view reports" } },
            { status: 403 },
          ),
        },
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({}),
}));

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    getProviderIdForUser: async () => null,
  };
});

describe("GET /api/provider/analytics", () => {
  beforeEach(() => {
    state.authorized = false;
    vi.resetModules();
  });

  it("rejects a staff member without view_reports", async () => {
    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/provider/analytics"));
    expect(res.status).toBe(403);
  });

  it("returns the empty payload when reports access is granted and there is no provider", async () => {
    state.authorized = true;
    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/provider/analytics"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.revenue.total).toBe(0);
  });
});
