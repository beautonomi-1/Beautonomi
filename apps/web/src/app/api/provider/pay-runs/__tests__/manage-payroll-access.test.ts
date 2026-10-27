import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/payroll/payroll-access", () => ({
  userCanManagePayroll: vi.fn(),
  assertPayrollEnabledForProvider: vi.fn(async () => ({ ok: true as const })),
}));

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: vi.fn(async () => ({ user: { id: "u1", role: "provider_staff" } })),
    getProviderIdForUser: vi.fn(async () => "prov-1"),
    successResponse: (data: unknown) => Response.json({ data }),
    handleApiError: (err: Error, _code?: string, status?: number) =>
      Response.json({ error: err.message }, { status: status ?? 500 }),
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
    }),
  }),
}));

describe("GET /api/provider/pay-runs manage payroll gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty list when staff lacks manage_payroll", async () => {
    const { userCanManagePayroll } = await import("@/lib/payroll/payroll-access");
    vi.mocked(userCanManagePayroll).mockResolvedValue(false);

    const { GET } = await import("../route");
    const res = await GET(new Request("http://localhost/api/provider/pay-runs") as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });

  it("lists pay runs when manage_payroll is granted", async () => {
    const { userCanManagePayroll } = await import("@/lib/payroll/payroll-access");
    vi.mocked(userCanManagePayroll).mockResolvedValue(true);

    const { GET } = await import("../route");
    const res = await GET(new Request("http://localhost/api/provider/pay-runs") as never);
    expect(res.status).toBe(200);
  });
});
