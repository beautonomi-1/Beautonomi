import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireAnyPermission = vi.fn();
const mockRequirePermission = vi.fn();
const mockGetSupabaseServer = vi.fn();

vi.mock("@/lib/auth/requirePermission", () => ({
  requireAnyPermission: (...args: unknown[]) => mockRequireAnyPermission(...args),
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
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

describe("Yoco integration and bank lookup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAnyPermission.mockResolvedValue(forbidden());
    mockRequirePermission.mockResolvedValue(forbidden());
  });

  it("does not return the Yoco account email or public key", async () => {
    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/provider/yoco/integration"));
    expect(res.status).toBe(403);
    expect(mockRequireAnyPermission).toHaveBeenCalledWith(
      ["process_payments", "edit_settings"],
      expect.anything(),
    );
    expect(mockGetSupabaseServer).not.toHaveBeenCalled();
  });

  it("does not resolve a bank account name", async () => {
    const { POST } = await import("../../../payout-accounts/verify/route");
    const res = await POST(
      new NextRequest("http://localhost/api/provider/payout-accounts/verify", {
        method: "POST",
        body: JSON.stringify({ account_number: "1234567890", bank_code: "058" }),
      }),
    );
    expect(res.status).toBe(403);
    expect(mockRequirePermission).toHaveBeenCalledWith("edit_settings", expect.anything());
    expect(mockGetSupabaseServer).not.toHaveBeenCalled();
  });
});
