import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminSection = vi.fn();
vi.mock("@/lib/supabase/api-helpers", () => ({
  requireAdminSection: (...args: unknown[]) => requireAdminSection(...args),
}));
vi.mock("@/lib/admin-sections", () => ({
  ADMIN_SECTION_FINANCE: "finance",
}));

import { requirePaystackPayoutAdmin } from "../require-paystack-payout-admin";

describe("requirePaystackPayoutAdmin (F2-72)", () => {
  beforeEach(() => {
    requireAdminSection.mockReset();
  });

  it("returns the finance-section user", async () => {
    requireAdminSection.mockResolvedValue({ user: { id: "admin-1", role: "superadmin" } });
    const req = new Request("http://localhost/api/paystack/transfers");
    const result = await requirePaystackPayoutAdmin(req);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.user.id).toBe("admin-1");
    expect(requireAdminSection).toHaveBeenCalledWith("finance", req);
  });

  it("maps a missing session to 401", async () => {
    requireAdminSection.mockRejectedValue(new Error("Authentication required"));
    const result = await requirePaystackPayoutAdmin(new Request("http://localhost/api/paystack/transfers"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it("maps a section miss to 403", async () => {
    requireAdminSection.mockRejectedValue(new Error("Insufficient permissions: access to section 'finance' required"));
    const result = await requirePaystackPayoutAdmin(new Request("http://localhost/api/paystack/transfers"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });
});
