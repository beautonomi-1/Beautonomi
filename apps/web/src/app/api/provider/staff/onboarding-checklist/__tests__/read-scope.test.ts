import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = { staffUserId: "someone-else", canViewPay: false };

vi.mock("@/lib/auth/provider-team-roster-access", () => ({
  canViewStaffPay: async () => state.canViewPay,
}));

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: async () => ({ user: { id: "u1", role: "provider_staff" } }),
    getProviderIdForUser: async () => "prov-1",
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        limit: () => chain,
        maybeSingle: async () => ({
          data: {
            id: "staff-2",
            user_id: state.staffUserId,
            commission_enabled: true,
            service_commission_rate: 40,
            time_clock_enabled: true,
            time_clock_pin: "1234",
            is_service_provider: true,
            invite_accepted_at: null,
          },
          error: null,
        }),
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ count: 0, data: [], error: null }).then(resolve),
      };
      return chain;
    },
  }),
}));

describe("GET /api/provider/staff/onboarding-checklist", () => {
  beforeEach(() => {
    state.staffUserId = "someone-else";
    state.canViewPay = false;
    vi.resetModules();
  });

  it("does not reveal another staff member's checklist without pay access", async () => {
    const { GET } = await import("../route");
    const res = await GET(
      new NextRequest("http://localhost/api/provider/staff/onboarding-checklist?staff_id=staff-2"),
    );
    expect(res.status).toBe(404);
  });

  it("returns the caller's own checklist", async () => {
    state.staffUserId = "u1";
    const { GET } = await import("../route");
    const res = await GET(
      new NextRequest("http://localhost/api/provider/staff/onboarding-checklist?staff_id=staff-2"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.staff_id).toBe("staff-2");
    expect(JSON.stringify(body.data)).not.toContain("1234");
  });
});
