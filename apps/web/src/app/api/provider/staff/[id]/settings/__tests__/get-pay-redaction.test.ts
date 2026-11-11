import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = { staffUserId: "someone-else" };

vi.mock("@/lib/auth/permissions", () => ({
  isProviderOwner: async () => false,
  hasPermission: async () => false,
  getStaffPermissions: async () => ({ manage_payroll: false, manage_team: false }),
}));

vi.mock("@/lib/auth/requirePermission", () => ({
  requirePermission: async () => ({ authorized: false }),
}));

vi.mock("@/lib/subscriptions/feature-access", () => ({
  checkStaffSmsNotificationsFeatureAccess: async () => false,
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
      const chain = {
        select: () => chain,
        eq: () => chain,
        single: async () => ({
          data: {
            id: "staff-2",
            user_id: state.staffUserId,
            name: "Other",
            role: "staff",
            salary: 9000,
            hourly_rate: 80,
            commission_rate: 40,
            service_commission_rate: 40,
            product_commission_rate: 10,
            commission_enabled: true,
            time_clock_pin: "1234",
            time_clock_enabled: true,
          },
          error: null,
        }),
      };
      return chain;
    },
  }),
}));

describe("GET /api/provider/staff/[id]/settings pay redaction", () => {
  beforeEach(() => {
    state.staffUserId = "someone-else";
    vi.resetModules();
  });

  it("hides salary and the time-clock PIN for another staff member", async () => {
    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/provider/staff/staff-2/settings"), {
      params: Promise.resolve({ id: "staff-2" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.name).toBe("Other");
    expect(body.data.salary).toBeNull();
    expect(body.data.hourly_rate).toBeNull();
    expect(body.data.commission_rate).toBeNull();
    expect(body.data.time_clock_pin).toBe("");
  });

  it("returns the caller's own salary and PIN", async () => {
    state.staffUserId = "u1";
    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/provider/staff/staff-2/settings"), {
      params: Promise.resolve({ id: "staff-2" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.salary).toBe(9000);
    expect(body.data.time_clock_pin).toBe("1234");
  });
});
