import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockNextRequest } from "@/__tests__/helpers/mock-supabase";

/**
 * F3-12 — only the linked business owner (or superadmin) may create a staff
 * row with role `owner`. A manager with `manage_team` must get 403.
 */

const mockRequirePermission = vi.fn();
const mockIsProviderOwner = vi.fn();
const mockGetProviderIdForUser = vi.fn();
const staffInsert = vi.fn();

vi.mock("@/lib/auth/requirePermission", () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

vi.mock("@/lib/auth/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/permissions")>();
  return {
    ...actual,
    isProviderOwner: (...args: unknown[]) => mockIsProviderOwner(...args),
  };
});

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    getProviderIdForUser: (...args: unknown[]) => mockGetProviderIdForUser(...args),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: vi.fn(async () => buildServerSupabase()),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => buildAdminSupabase(),
}));

vi.mock("@/lib/subscriptions/feature-access", () => ({
  checkStaffManagementFeatureAccess: vi.fn(async () => ({ enabled: true })),
}));

vi.mock("@/lib/subscriptions/limit-checker", () => ({
  checkStaffLimit: vi.fn(async () => ({ canProceed: true })),
}));

vi.mock("@/lib/provider/seed-staff-schedules", () => ({
  seedStaffSchedulesOnCreate: vi.fn(async () => undefined),
}));
vi.mock("@/lib/provider/sync-staff-services", () => ({
  replaceStaffServicesForStaff: vi.fn(async () => undefined),
}));
vi.mock("@/lib/provider/staff-invite", () => ({
  sendStaffInvite: vi.fn(async () => ({ ok: true })),
  STAFF_INVITE_EXPIRY_DAYS: 7,
}));
vi.mock("@/lib/provider/staff-invitations", () => ({
  recordStaffInvitationSent: vi.fn(async () => undefined),
}));
vi.mock("@/lib/analytics/amplitude/server", () => ({
  trackServer: vi.fn(async () => undefined),
}));
vi.mock("@/lib/provider/staff-location-scope", () => ({
  resolveStaffLocationScope: vi.fn(async () => ({ locationIds: [] })),
}));

function chain(result: { data: unknown; error: null } = { data: null, error: null }) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "neq", "is", "in", "ilike", "order", "limit", "update", "delete", "upsert"]) {
    c[m] = vi.fn(() => c);
  }
  c.insert = vi.fn((payload: unknown) => {
    staffInsert(payload);
    return c;
  });
  c.single = vi.fn(async () => result);
  c.maybeSingle = vi.fn(async () => result);
  return c;
}

function buildServerSupabase() {
  return {
    from: vi.fn(() => chain({ data: { id: "staff-new-1", role: "owner" }, error: null })),
  };
}

function buildAdminSupabase() {
  return {
    from: vi.fn(() =>
      chain({ data: { id: "user-existing-1", email: "new.owner@example.com" }, error: null }),
    ),
    auth: { admin: { createUser: vi.fn() } },
  };
}

describe("POST /api/provider/staff — owner role guard (F3-12)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue({
      authorized: true,
      user: { id: "manager-user-1", role: "provider_staff" },
    });
    mockGetProviderIdForUser.mockResolvedValue("provider-1");
    mockIsProviderOwner.mockResolvedValue(false);
  });

  it("returns 403 when a non-owner with manage_team sends role=provider_owner", async () => {
    const { POST } = await import("../route");
    const res = await POST(
      createMockNextRequest({
        method: "POST",
        url: "http://localhost:3000/api/provider/staff",
        body: { email: "new.owner@example.com", role: "provider_owner", name: "New Owner" },
      }),
    );
    expect(res.status).toBe(403);
    expect(staffInsert).not.toHaveBeenCalled();
  });

  it("allows the linked business owner to create an owner row", async () => {
    mockIsProviderOwner.mockResolvedValue(true);
    const { POST } = await import("../route");
    const res = await POST(
      createMockNextRequest({
        method: "POST",
        url: "http://localhost:3000/api/provider/staff",
        body: { email: "new.owner@example.com", role: "provider_owner", name: "New Owner" },
      }),
    );
    expect(res.status).not.toBe(403);
  });
});
