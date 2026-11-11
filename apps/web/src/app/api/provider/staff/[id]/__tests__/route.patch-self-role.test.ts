import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockNextRequest } from "@/__tests__/helpers/mock-supabase";

/**
 * F3-14 — a non-owner with manage_team must not be able to change their OWN
 * role / job preset (self-escalation to the manager preset which carries
 * finance permissions). Editing a colleague's role is still allowed.
 */

const mockRequireRoleInApi = vi.fn();
const mockGetProviderIdForUser = vi.fn();
const mockGetProviderStaffIdForUser = vi.fn();
const mockIsProviderOwner = vi.fn();
const mockHasPermission = vi.fn();
const staffUpdate = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
    getProviderIdForUser: (...args: unknown[]) => mockGetProviderIdForUser(...args),
  };
});

vi.mock("@/lib/auth/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/permissions")>();
  return {
    ...actual,
    isProviderOwner: (...args: unknown[]) => mockIsProviderOwner(...args),
    hasPermission: (...args: unknown[]) => mockHasPermission(...args),
  };
});

vi.mock("@/lib/auth/provider-team-roster-access", () => ({
  getProviderStaffIdForUser: (...args: unknown[]) => mockGetProviderStaffIdForUser(...args),
  getTeamRosterDetailLevel: vi.fn(async () => "full"),
  canViewStaffPay: vi.fn(async () => true),
  redactStaffPayFields: (row: unknown) => row,
  redactStaffRowForViewer: (row: unknown) => row,
}));

vi.mock("@/lib/provider/find-future-bookings-for-staff", () => ({
  findFutureBookingsForStaff: vi.fn(async () => []),
  futureBookingsConflictResponse: vi.fn(() => ({ message: "conflict" })),
}));
vi.mock("@/lib/auth/effective-provider-role", () => ({
  syncPortalRoleAfterWorkplaceChange: vi.fn(async () => undefined),
}));
vi.mock("@/lib/provider/reassign-staff-workload", () => ({
  reassignStaffWorkload: vi.fn(),
}));
vi.mock("@/lib/provider/sync-staff-services", () => ({
  replaceStaffServicesForStaff: vi.fn(async () => undefined),
}));
vi.mock("@/lib/audit/audit", () => ({
  writeAuditLog: vi.fn(async () => undefined),
  extractRequestMeta: vi.fn(() => ({})),
}));
vi.mock("@/lib/provider/staff-offboarding", () => ({
  revokeStaffInvitesForMember: vi.fn(async () => undefined),
  revokeStaffUserSessionsIfOrphaned: vi.fn(async () => undefined),
}));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({}),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: vi.fn(async () => buildSupabase()),
}));

function buildSupabase() {
  const existing = {
    id: "staff-self-1",
    role: "employee",
    user_id: "manager-user-1",
    commission_rate: null,
    service_commission_rate: null,
    product_commission_rate: null,
    name: "Self",
    email: "self@example.com",
  };
  return {
    from: vi.fn(() => {
      const c: Record<string, unknown> = {};
      for (const m of ["select", "eq", "is", "in", "order", "limit", "delete", "insert", "neq"]) {
        c[m] = vi.fn(() => c);
      }
      c.update = vi.fn((v: unknown) => {
        staffUpdate(v);
        return c;
      });
      c.single = vi.fn(async () => ({ data: existing, error: null }));
      c.maybeSingle = vi.fn(async () => ({ data: existing, error: null }));
      return c;
    }),
  };
}

const req = (body: Record<string, unknown>) =>
  createMockNextRequest({
    method: "PATCH",
    url: "http://localhost:3000/api/provider/staff/staff-self-1",
    body,
  });
const params = { params: Promise.resolve({ id: "staff-self-1" }) };

describe("PATCH /api/provider/staff/[id] — self role change (F3-14)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "manager-user-1", role: "provider_staff" } });
    mockGetProviderIdForUser.mockResolvedValue("provider-1");
    mockGetProviderStaffIdForUser.mockResolvedValue("staff-self-1");
    mockIsProviderOwner.mockResolvedValue(false);
    mockHasPermission.mockResolvedValue(true); // manage_team
  });

  it("403 when a manage_team non-owner sets job=manager on their own row", async () => {
    const { PATCH } = await import("../route");
    const res = await PATCH(req({ job: "manager" }), params);
    expect(res.status).toBe(403);
    expect(staffUpdate).not.toHaveBeenCalled();
  });

  it("403 when a manage_team non-owner sets role=provider_manager on their own row", async () => {
    const { PATCH } = await import("../route");
    const res = await PATCH(req({ role: "provider_manager" }), params);
    expect(res.status).toBe(403);
    expect(staffUpdate).not.toHaveBeenCalled();
  });

  it("still allows a manage_team non-owner to rename themselves", async () => {
    const { PATCH } = await import("../route");
    const res = await PATCH(req({ name: "New Name" }), params);
    expect(res.status).toBe(200);
  });

  it("still allows a manage_team non-owner to set job=manager on a colleague", async () => {
    mockGetProviderStaffIdForUser.mockResolvedValue("staff-other-2");
    const { PATCH } = await import("../route");
    const res = await PATCH(req({ job: "manager" }), params);
    expect(res.status).toBe(200);
    expect(staffUpdate).toHaveBeenCalledWith(expect.objectContaining({ role: "manager" }));
  });
});
