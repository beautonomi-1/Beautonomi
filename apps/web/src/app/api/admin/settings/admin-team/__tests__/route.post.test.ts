/**
 * POST /api/admin/settings/admin-team — upsert failures and idempotent tenant sync.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { MOCK_USERS } from "@/__tests__/helpers/mock-supabase";

const mockRequireRoleInApi = vi.fn();
vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
  };
});

const mockGetSupabaseAdmin = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
}));

vi.mock("@/lib/audit/audit", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

const mockSyncAdminUserTenantRole = vi.fn();
vi.mock("@/lib/tenant/sync-admin-user-tenant-role", () => ({
  syncAdminUserTenantRole: (...args: unknown[]) => mockSyncAdminUserTenantRole(...args),
}));

const EXISTING_ID = "admin-existing-0000-0000-0000-000000000088";
const INVITE_ID = "admin-invite-0000-0000-0000-000000000077";

describe("POST /api/admin/settings/admin-team", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: MOCK_USERS.superadmin });
    mockSyncAdminUserTenantRole.mockResolvedValue(undefined);
  });

  it("returns error and skips tenant sync when invite upsert fails", async () => {
    const upsert = vi.fn(async () => ({ error: { message: "upsert failed" } }));
    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "users") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            upsert,
          };
        }
        return {};
      }),
      auth: {
        admin: {
          inviteUserByEmail: vi.fn(async () => ({
            data: { user: { id: INVITE_ID } },
            error: null,
          })),
        },
      },
    });

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/admin/settings/admin-team", {
      method: "POST",
      body: JSON.stringify({
        email: "invite@example.com",
        full_name: "Invite",
        role: "admin_support",
      }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error?.code).toBe("DATABASE_ERROR");
    expect(mockSyncAdminUserTenantRole).not.toHaveBeenCalled();
  });

  it("syncs tenant and succeeds when existing user already has the requested admin role", async () => {
    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "users") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: EXISTING_ID, role: "admin_support", email: "existing@example.com" },
              error: null,
            }),
          };
        }
        return {};
      }),
      auth: { admin: {} },
    });

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/admin/settings/admin-team", {
      method: "POST",
      body: JSON.stringify({
        email: "existing@example.com",
        full_name: "Existing",
        role: "admin_support",
      }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.error).toBeNull();
    expect(mockSyncAdminUserTenantRole).toHaveBeenCalledWith(
      expect.anything(),
      EXISTING_ID,
      "admin_support",
      undefined,
      req,
    );
  });
});
