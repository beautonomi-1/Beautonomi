import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  canManage: false,
  itemFilters: [] as string[],
};

function admin() {
  return {
    from(table: string) {
      if (table === "provider_pay_runs") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: async () => ({
                  data: {
                    id: "run-1",
                    provider_id: "prov-1",
                    status: "approved",
                    total_net_pay: 9000,
                    total_gross_pay: 12000,
                  },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === "provider_staff") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  is: () => ({
                    maybeSingle: async () => ({ data: { id: "staff-me" }, error: null }),
                  }),
                }),
              }),
            }),
            in: async () => ({
              data: [{ id: "staff-me", users: { full_name: "Me" } }],
              error: null,
            }),
          }),
        };
      }
      if (table === "provider_pay_run_items") {
        const chain: {
          eq: (col: string, val: string) => typeof chain;
          order: () => typeof chain;
          then: (resolve: (v: unknown) => unknown) => Promise<unknown>;
        } = {
          eq: (col: string, val: string) => {
            state.itemFilters.push(`${col}=${val}`);
            return chain;
          },
          order: () => chain,
          then: (resolve) =>
            Promise.resolve({
              data: [
                {
                  id: "item-1",
                  staff_id: "staff-me",
                  gross_pay: 100,
                  net_pay: 80,
                  tax_deduction: 10,
                  uif_contribution: 1,
                },
              ],
              error: null,
            }).then(resolve),
        };
        return { select: () => chain };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

vi.mock("@/lib/payroll/payroll-access", () => ({
  payrollDisabledMessage: async () => null,
  userCanManagePayroll: async () => state.canManage,
}));

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: async () => ({ user: { id: "u-staff", role: "provider_staff" } }),
    getProviderIdForUser: async () => "prov-1",
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => admin(),
}));

describe("GET /api/provider/pay-runs/[id] staff scope", () => {
  beforeEach(() => {
    state.canManage = false;
    state.itemFilters = [];
    vi.resetModules();
  });

  it("limits items to the caller and hides salon totals without manage_payroll", async () => {
    const { GET } = await import("../route");
    const res = await GET(new Request("http://localhost/api/provider/pay-runs/run-1") as never, {
      params: Promise.resolve({ id: "run-1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(state.itemFilters).toContain("staff_id=staff-me");
    expect(body.data.items).toEqual([
      expect.objectContaining({ staff_id: "staff-me", net_pay: 80 }),
    ]);
    expect(body.data.total_net_pay).toBeNull();
    expect(body.data.total_gross_pay).toBeNull();
  });

  it("returns the pay-run totals for a payroll manager", async () => {
    state.canManage = true;
    const { GET } = await import("../route");
    const res = await GET(new Request("http://localhost/api/provider/pay-runs/run-1") as never, {
      params: Promise.resolve({ id: "run-1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(state.itemFilters).not.toContain("staff_id=staff-me");
    expect(body.data.total_net_pay).toBe(9000);
  });
});
