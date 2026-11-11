import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = { canViewAll: false, filters: [] as string[] };

vi.mock("@/lib/auth/permissions", () => ({
  isProviderOwner: async () => false,
  getStaffPermissions: async () =>
    state.canViewAll
      ? { manage_payroll: true, manage_team: false }
      : { manage_payroll: false, manage_team: false },
}));

vi.mock("@/lib/auth/requirePermission", () => ({
  requirePermission: async () => ({ authorized: false }),
}));

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: async () => ({ user: { id: "u1", role: "provider_staff" } }),
    getProviderIdForUser: async () => "prov-1",
  };
});

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: async () => ({
    from: () => {
      const chain: {
        select: () => typeof chain;
        eq: (col: string, val: string) => typeof chain;
        order: () => Promise<{ data: unknown[]; error: null }>;
        in: () => typeof chain;
        is: () => typeof chain;
      } = {
        select: () => chain,
        eq: (col: string, val: string) => {
          state.filters.push(`${col}=${val}`);
          return chain;
        },
        order: () => Promise.resolve({ data: [], error: null }),
        in: () => chain,
        is: () => chain,
      };
      return chain;
    },
  }),
}));

describe("GET /api/provider/settings/team/commissions read scope", () => {
  beforeEach(() => {
    state.canViewAll = false;
    state.filters = [];
    vi.resetModules();
  });

  it("limits the list to the caller without payroll or team access", async () => {
    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/provider/settings/team/commissions"));
    expect(res.status).toBe(200);
    expect(state.filters).toContain("user_id=u1");
    const body = await res.json();
    expect(body.data).toEqual([]);
  });

  it("returns every staff row for a payroll manager", async () => {
    state.canViewAll = true;
    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/provider/settings/team/commissions"));
    expect(res.status).toBe(200);
    expect(state.filters).not.toContain("user_id=u1");
  });
});
