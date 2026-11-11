import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockReportsAccess = vi.fn();
const mockAnyPermission = vi.fn();
const mockGetSupabaseServer = vi.fn();

vi.mock("@/lib/reports/require-provider-reports-access", () => ({
  requireProviderReportsAccess: (...args: unknown[]) => mockReportsAccess(...args),
}));

vi.mock("@/lib/auth/requirePermission", () => ({
  requireAnyPermission: (...args: unknown[]) => mockAnyPermission(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

function forbidden() {
  return {
    authorized: false,
    response: Response.json({ data: null, error: { code: "FORBIDDEN" } }, { status: 403 }),
  };
}

describe("salon report reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReportsAccess.mockResolvedValue(forbidden());
    mockAnyPermission.mockResolvedValue(forbidden());
  });

  it("does not load at-home booking revenue without view_reports", async () => {
    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/provider/service-zones/analytics"));
    expect(res.status).toBe(403);
    expect(mockGetSupabaseServer).not.toHaveBeenCalled();
  });

  it("does not read VAT registration or tax rows without a finance permission", async () => {
    const { GET } = await import("../../../finance/vat-reports/check-reminders/route");
    const res = await GET(new NextRequest("http://localhost/api/provider/finance/vat-reports/check-reminders"));
    expect(res.status).toBe(403);
    expect(mockGetSupabaseServer).not.toHaveBeenCalled();
  });
});
