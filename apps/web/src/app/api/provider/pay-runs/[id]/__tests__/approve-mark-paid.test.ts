import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mockRequireManagePayroll = vi.fn();
const mockGetProviderIdForUser = vi.fn();
const mockPayrollDisabledMessage = vi.fn();
const mockNotifyPayRunStaff = vi.fn();

function payRunAdmin(payRun: { id: string; status: string } | null) {
  const thenable = {
    eq: () => thenable,
    gte: () => thenable,
    lte: () => thenable,
    is: () => thenable,
    then: (resolve: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve),
  };
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            single: async () => ({
              data: payRun,
              error: payRun ? null : { message: "missing" },
            }),
          }),
        }),
      }),
      update: () => thenable,
    }),
  };
}

vi.mock("@/lib/payroll/require-manage-payroll", () => ({
  requireManagePayroll: (...args: unknown[]) => mockRequireManagePayroll(...args),
}));

vi.mock("@/lib/payroll/payroll-access", () => ({
  payrollDisabledMessage: (...args: unknown[]) => mockPayrollDisabledMessage(...args),
}));

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    getProviderIdForUser: (...args: unknown[]) => mockGetProviderIdForUser(...args),
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => mockAdmin,
}));

vi.mock("@/lib/notifications/notify-staff-event", () => ({
  notifyPayRunStaff: (...args: unknown[]) => mockNotifyPayRunStaff(...args),
}));

let mockAdmin: ReturnType<typeof payRunAdmin> = payRunAdmin(null);

function forbidden() {
  return {
    authorized: false as const,
    response: NextResponse.json(
      { error: "Permission denied", permission: "manage_payroll" },
      { status: 403 },
    ),
  };
}

describe("pay-runs approve / mark-paid (F3-27)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetProviderIdForUser.mockResolvedValue("prov-1");
    mockPayrollDisabledMessage.mockResolvedValue(null);
    mockNotifyPayRunStaff.mockResolvedValue(undefined);
    mockRequireManagePayroll.mockResolvedValue({
      authorized: true,
      user: { id: "u1", role: "provider_owner" },
    });
    mockAdmin = payRunAdmin({ id: "run-1", status: "draft" });
  });

  it("POST approve returns 403 without manage_payroll", async () => {
    mockRequireManagePayroll.mockResolvedValue(forbidden());
    const { POST } = await import("../approve/route");
    const res = await POST(new NextRequest("http://localhost/api/provider/pay-runs/run-1/approve", {
      method: "POST",
    }), { params: Promise.resolve({ id: "run-1" }) });
    expect(res.status).toBe(403);
  });

  it("POST approve rejects a non-draft run", async () => {
    mockAdmin = payRunAdmin({ id: "run-1", status: "approved" });
    const { POST } = await import("../approve/route");
    const res = await POST(new NextRequest("http://localhost/api/provider/pay-runs/run-1/approve", {
      method: "POST",
    }), { params: Promise.resolve({ id: "run-1" }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(String(body.error?.message ?? body.error ?? "")).toMatch(/draft/i);
  });

  it("POST mark-paid returns 403 without manage_payroll", async () => {
    mockRequireManagePayroll.mockResolvedValue(forbidden());
    const { POST } = await import("../mark-paid/route");
    const res = await POST(new NextRequest("http://localhost/api/provider/pay-runs/run-1/mark-paid", {
      method: "POST",
    }), { params: Promise.resolve({ id: "run-1" }) });
    expect(res.status).toBe(403);
  });

  it("POST mark-paid rejects a run that is not approved", async () => {
    mockAdmin = payRunAdmin({ id: "run-1", status: "draft" });
    const { POST } = await import("../mark-paid/route");
    const res = await POST(new NextRequest("http://localhost/api/provider/pay-runs/run-1/mark-paid", {
      method: "POST",
    }), { params: Promise.resolve({ id: "run-1" }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(String(body.error?.message ?? body.error ?? "")).toMatch(/approved/i);
  });
});
