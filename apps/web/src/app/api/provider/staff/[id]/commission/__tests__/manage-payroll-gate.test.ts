import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/permissions", () => ({
  getStaffPermissions: vi.fn(),
  isProviderOwner: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: vi.fn(),
}));

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: vi.fn(async () => ({ user: { id: "u1", role: "provider_staff" } })),
    getProviderIdForUser: vi.fn(async () => "prov-1"),
    handleApiError: (err: Error, _code?: string, status?: number) =>
      Response.json({ error: err.message }, { status: status ?? 500 }),
  };
});

describe("PATCH /api/provider/staff/[id]/commission manage payroll gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 when pay fields change without manage_payroll", async () => {
    const { isProviderOwner, getStaffPermissions } = await import("@/lib/auth/permissions");
    vi.mocked(isProviderOwner).mockResolvedValue(false);
    vi.mocked(getStaffPermissions).mockResolvedValue({ manage_payroll: false } as never);

    const { PATCH } = await import("../route");
    const req = new NextRequest("http://localhost/api/provider/staff/staff-1/commission", {
      method: "PATCH",
      body: JSON.stringify({ service_commission_rate: 12 }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "staff-1" }) });
    expect(res.status).toBe(403);
  });

  it("allows non-pay toggles without manage_payroll", async () => {
    const { isProviderOwner, getStaffPermissions } = await import("@/lib/auth/permissions");
    vi.mocked(isProviderOwner).mockResolvedValue(false);
    vi.mocked(getStaffPermissions).mockResolvedValue({ manage_payroll: false } as never);

    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.single = vi.fn(() => Promise.resolve({ data: { id: "staff-1" }, error: null }));
    chain.update = vi.fn(() => chain);
    chain.order = vi.fn(() => Promise.resolve({ data: [], error: null }));

    const { getSupabaseServer } = await import("@/lib/supabase/server");
    vi.mocked(getSupabaseServer).mockResolvedValue({
      from: vi.fn(() => chain),
    } as never);

    const { PATCH } = await import("../route");
    const req = new NextRequest("http://localhost/api/provider/staff/staff-1/commission", {
      method: "PATCH",
      body: JSON.stringify({ tips_enabled: false }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "staff-1" }) });
    expect(res.status).toBe(200);
  });
});

function commissionReadClient(userId: string) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.single = vi.fn(() =>
    Promise.resolve({
      data: {
        id: "staff-1",
        user_id: userId,
        commission_enabled: true,
        service_commission_rate: 40,
        product_commission_rate: 10,
        hourly_rate: 80,
        salary: 12000,
        tips_enabled: true,
      },
      error: null,
    }),
  );
  chain.order = vi.fn(() => Promise.resolve({ data: [], error: null }));
  return { from: vi.fn(() => chain) };
}

describe("GET /api/provider/staff/[id]/commission pay visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hides another staff member's salary without payroll or team access", async () => {
    const { isProviderOwner, getStaffPermissions } = await import("@/lib/auth/permissions");
    vi.mocked(isProviderOwner).mockResolvedValue(false);
    vi.mocked(getStaffPermissions).mockResolvedValue({
      manage_payroll: false,
      manage_team: false,
    } as never);
    const { getSupabaseServer } = await import("@/lib/supabase/server");
    vi.mocked(getSupabaseServer).mockResolvedValue(commissionReadClient("someone-else") as never);

    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/provider/staff/staff-1/commission"), {
      params: Promise.resolve({ id: "staff-1" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns the caller's own salary", async () => {
    const { isProviderOwner, getStaffPermissions } = await import("@/lib/auth/permissions");
    vi.mocked(isProviderOwner).mockResolvedValue(false);
    vi.mocked(getStaffPermissions).mockResolvedValue({
      manage_payroll: false,
      manage_team: false,
    } as never);
    const { getSupabaseServer } = await import("@/lib/supabase/server");
    vi.mocked(getSupabaseServer).mockResolvedValue(commissionReadClient("u1") as never);

    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/provider/staff/staff-1/commission"), {
      params: Promise.resolve({ id: "staff-1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.salary).toBe(12000);
  });
});
