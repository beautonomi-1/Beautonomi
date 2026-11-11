import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockNextRequest } from "@/__tests__/helpers/mock-supabase";

/**
 * F3-13 — `is_admin` grants every permission. Only the business owner (or
 * superadmin) may set it; a manage_team manager sending it must get 403 and
 * nothing may be written.
 */

const mockRequireRoleInApi = vi.fn();
const mockRequirePermission = vi.fn();
const mockGetProviderIdForUser = vi.fn();
const mockGetStaffPermissions = vi.fn();
const mockIsProviderOwner = vi.fn();
const staffUpdate = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
    getProviderIdForUser: (...args: unknown[]) => mockGetProviderIdForUser(...args),
  };
});

vi.mock("@/lib/auth/requirePermission", () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

vi.mock("@/lib/auth/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/permissions")>();
  return {
    ...actual,
    getStaffPermissions: (...args: unknown[]) => mockGetStaffPermissions(...args),
    isProviderOwner: (...args: unknown[]) => mockIsProviderOwner(...args),
  };
});

vi.mock("@/lib/subscriptions/feature-access", () => ({
  checkStaffSmsNotificationsFeatureAccess: vi.fn(async () => true),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: vi.fn(async () => buildSupabase()),
}));

function buildSupabase() {
  return {
    from: vi.fn((table: string) => {
      if (table !== "provider_staff") throw new Error(`Unexpected table: ${table}`);
      const c: Record<string, unknown> = {};
      c.select = vi.fn(() => c);
      c.eq = vi.fn(() => c);
      c.update = vi.fn((values: unknown) => {
        staffUpdate(values);
        return c;
      });
      c.single = vi.fn(async () => ({
        data: { id: "staff-target-1", user_id: "other-user-9", is_admin: true },
        error: null,
      }));
      return c;
    }),
  };
}

function patch(body: Record<string, unknown>) {
  return createMockNextRequest({
    method: "PATCH",
    url: "http://localhost:3000/api/provider/staff/staff-target-1/settings",
    body,
  });
}

const params = { params: Promise.resolve({ id: "staff-target-1" }) };

describe("PATCH /api/provider/staff/[id]/settings — is_admin (F3-13)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "manager-user-1", role: "provider_staff" } });
    mockRequirePermission.mockResolvedValue({ authorized: true, user: { id: "manager-user-1" } });
    mockGetProviderIdForUser.mockResolvedValue("provider-1");
    mockGetStaffPermissions.mockResolvedValue({ manage_team: true });
    mockIsProviderOwner.mockResolvedValue(false);
  });

  it("returns 403 and writes nothing when a manage_team non-owner sends is_admin", async () => {
    const { PATCH } = await import("../route");
    const res = await PATCH(patch({ is_admin: true, work_hours_enabled: true }), params);
    expect(res.status).toBe(403);
    expect(staffUpdate).not.toHaveBeenCalled();
  });

  it("lets the business owner set is_admin", async () => {
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "owner-user-1", role: "provider_owner" } });
    mockIsProviderOwner.mockResolvedValue(true);
    const { PATCH } = await import("../route");
    const res = await PATCH(patch({ is_admin: true }), params);
    expect(res.status).toBe(200);
    expect(staffUpdate).toHaveBeenCalledWith(expect.objectContaining({ is_admin: true }));
  });
});
