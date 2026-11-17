import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockNextRequest } from "@/__tests__/helpers/mock-supabase";

/**
 * F3-15 — a role may only contain permissions the editor holds.
 * A manage_team-only manager minting a role with finance permissions → 403
 * listing the disallowed keys. Owners / superadmins are unrestricted.
 */

const mockRequireRoleInApi = vi.fn();
const mockGetProviderIdForUser = vi.fn();
const mockIsProviderOwner = vi.fn();
const mockHasPermission = vi.fn();
const mockGetStaffPermissions = vi.fn();
const rolesInsert = vi.fn();
const rolesUpdate = vi.fn();

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
    getStaffPermissions: (...args: unknown[]) => mockGetStaffPermissions(...args),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: vi.fn(async () => buildSupabase()),
}));

function buildSupabase() {
  return {
    from: vi.fn((table: string) => {
      if (table !== "provider_roles") throw new Error(`Unexpected table: ${table}`);
      const c: Record<string, unknown> = {};
      c.select = vi.fn(() => c);
      c.eq = vi.fn(() => c);
      c.order = vi.fn(() => c);
      c.insert = vi.fn((v: unknown) => {
        rolesInsert(v);
        return c;
      });
      c.update = vi.fn((v: unknown) => {
        rolesUpdate(v);
        return c;
      });
      c.single = vi.fn(async () => ({
        data: { id: "role-1", provider_id: "provider-1", permissions: {} },
        error: null,
      }));
      return c;
    }),
  };
}

const financeRole = {
  name: "Finance lead",
  permissions: {
    view_calendar: true,
    manage_team: true,
    manage_finance: true,
    issue_refunds: true,
    process_payments: true,
  },
};

describe("provider roles permission ceiling (F3-15)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "manager-user-1", role: "provider_staff" } });
    mockGetProviderIdForUser.mockResolvedValue("provider-1");
    mockIsProviderOwner.mockResolvedValue(false);
    mockHasPermission.mockResolvedValue(true);
    mockGetStaffPermissions.mockResolvedValue({ view_calendar: true, manage_team: true });
  });

  it("POST /api/provider/roles: 403 listing unheld keys when editor lacks them", async () => {
    const { POST } = await import("../route");
    const res = await POST(
      createMockNextRequest({ method: "POST", url: "http://localhost:3000/api/provider/roles", body: financeRole }),
    );
    expect(res.status).toBe(403);
    const json = await res.json();
    const text = JSON.stringify(json);
    expect(text).toContain("manage_finance");
    expect(text).toContain("issue_refunds");
    expect(text).toContain("process_payments");
    expect(rolesInsert).not.toHaveBeenCalled();
  });

  it("PATCH /api/provider/roles/[id]: 403 when editor grants an unheld permission", async () => {
    const { PATCH } = await import("../[id]/route");
    const res = await PATCH(
      createMockNextRequest({ method: "PATCH", url: "http://localhost:3000/api/provider/roles/role-1", body: financeRole }),
      { params: Promise.resolve({ id: "role-1" }) },
    );
    expect(res.status).toBe(403);
    expect(rolesUpdate).not.toHaveBeenCalled();
  });

  it("POST allows a role whose permissions are within the editor's own set", async () => {
    const { POST } = await import("../route");
    const res = await POST(
      createMockNextRequest({
        method: "POST",
        url: "http://localhost:3000/api/provider/roles",
        body: { name: "Front desk", permissions: { view_calendar: true } },
      }),
    );
    expect(res.status).toBe(200);
    expect(rolesInsert).toHaveBeenCalledTimes(1);
  });

  it("POST allows the business owner to grant anything", async () => {
    mockIsProviderOwner.mockResolvedValue(true);
    const { POST } = await import("../route");
    const res = await POST(
      createMockNextRequest({ method: "POST", url: "http://localhost:3000/api/provider/roles", body: financeRole }),
    );
    expect(res.status).toBe(200);
  });
});
