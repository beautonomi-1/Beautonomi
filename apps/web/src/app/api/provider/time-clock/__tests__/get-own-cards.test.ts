import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = { canSeeAll: false, filters: [] as string[] };

vi.mock("@/lib/auth/permissions", () => ({
  isProviderOwner: async () => state.canSeeAll,
  hasPermission: async () => false,
}));

vi.mock("@/lib/auth/provider-team-roster-access", () => ({
  getProviderStaffIdForUser: async () => "staff-me",
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
    from: (table: string) => {
      if (table === "providers") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { tenant_id: null }, error: null }),
            }),
          }),
        };
      }
      const chain = {
        select: () => chain,
        eq: (col: string, val: string) => {
          state.filters.push(`${col}=${val}`);
          return chain;
        },
        order: () => chain,
        gte: () => chain,
        lte: () => chain,
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ data: [], error: null }).then(resolve),
      };
      return chain;
    },
  }),
}));

describe("GET /api/provider/time-clock", () => {
  beforeEach(() => {
    state.canSeeAll = false;
    state.filters = [];
    vi.resetModules();
  });

  it("limits cards to the caller without manage_team", async () => {
    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/provider/time-clock"));
    expect(res.status).toBe(200);
    expect(state.filters).toContain("staff_id=staff-me");
  });

  it("returns the team list for an owner", async () => {
    state.canSeeAll = true;
    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/provider/time-clock"));
    expect(res.status).toBe(200);
    expect(state.filters).not.toContain("staff_id=staff-me");
  });
});
