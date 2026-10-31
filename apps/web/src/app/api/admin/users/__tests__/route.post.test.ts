/**
 * POST /api/admin/users — duplicate id recovery after signup trigger insert.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { MOCK_USERS } from "@/__tests__/helpers/mock-supabase";

const AUTH_USER_ID = "auth-user-0000-0000-0000-000000000001";
const TENANT_ID = "tenant-0000-0000-0000-000000000099";

const mockRequireRoleInApi = vi.fn();
vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
  };
});

const mockResolveAdminApiTenantId = vi.fn();
vi.mock("@/lib/tenant/admin-request-tenant", () => ({
  resolveAdminApiTenantId: (...args: unknown[]) => mockResolveAdminApiTenantId(...args),
}));

vi.mock("@/lib/regions/config", () => ({
  getTenantRegionConfig: vi.fn(async () => ({ defaultCurrency: "ZAR" })),
}));

const mockSyncAdminUserTenantRole = vi.fn();
vi.mock("@/lib/tenant/sync-admin-user-tenant-role", () => ({
  syncAdminUserTenantRole: (...args: unknown[]) => mockSyncAdminUserTenantRole(...args),
  shouldSyncAdminUserTenantRole: (role: string) =>
    !["customer", "provider_owner", "provider_staff"].includes(role),
}));

const mockGetSupabaseServer = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

const mockDeleteUser = vi.fn();
const mockCreateUser = vi.fn();
const mockGetSupabaseAdmin = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
}));

function postBody(overrides: Record<string, unknown> = {}) {
  return {
    email: "new.admin@example.com",
    password: "password123",
    full_name: "New Admin",
    role: "admin_support",
    preferred_currency: "USD",
    ...overrides,
  };
}

function buildAdminClient(options: {
  rowForAuthId?: { id: string } | null;
  updateError?: { message: string } | null;
  updatedRow?: Record<string, unknown>;
}) {
  const updateEq = vi.fn().mockResolvedValue({
    data: options.updatedRow ?? { id: AUTH_USER_ID, role: "admin_support" },
    error: options.updateError ?? null,
  });
  const adminFrom = vi.fn((table: string) => {
    if (table === "users") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: options.rowForAuthId ?? null,
              error: null,
            })),
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            select: vi.fn(() => ({
              single: updateEq,
            })),
          })),
        })),
      };
    }
    return {};
  });
  return {
    auth: {
      admin: {
        createUser: mockCreateUser,
        deleteUser: mockDeleteUser,
      },
    },
    from: adminFrom,
    updateEq,
  };
}

function buildServerClient(insertError: { code: string; message: string } | null) {
  const walletInsert = vi.fn(async () => ({ error: null }));
  return {
    from: vi.fn((table: string) => {
      if (table === "users") {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: null,
                error: insertError,
              })),
            })),
          })),
        };
      }
      if (table === "user_wallets") {
        return { insert: walletInsert };
      }
      return {};
    }),
    walletInsert,
  };
}

describe("POST /api/admin/users duplicate id recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: MOCK_USERS.superadmin });
    mockResolveAdminApiTenantId.mockResolvedValue(TENANT_ID);
    mockSyncAdminUserTenantRole.mockResolvedValue(undefined);
    mockCreateUser.mockResolvedValue({
      data: { user: { id: AUTH_USER_ID } },
      error: null,
    });
    mockDeleteUser.mockResolvedValue({ error: null });
  });

  it("updates profile via admin client on 23505 when auth id row exists", async () => {
    const admin = buildAdminClient({
      rowForAuthId: { id: AUTH_USER_ID },
      updatedRow: { id: AUTH_USER_ID, role: "admin_support", full_name: "New Admin" },
    });
    mockGetSupabaseAdmin.mockReturnValue(admin);
    const server = buildServerClient({ code: "23505", message: "duplicate key" });
    mockGetSupabaseServer.mockResolvedValue(server);

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/admin/users", {
      method: "POST",
      body: JSON.stringify(postBody()),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.error).toBeNull();
    expect(body.data).toMatchObject({ id: AUTH_USER_ID, role: "admin_support" });
    expect(mockCreateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        user_metadata: expect.objectContaining({
          role: "admin_support",
          currency: "USD",
        }),
      }),
    );
    expect(mockDeleteUser).not.toHaveBeenCalled();
    expect(server.walletInsert).toHaveBeenCalled();
    expect(mockSyncAdminUserTenantRole).toHaveBeenCalledWith(
      admin,
      AUTH_USER_ID,
      "admin_support",
      undefined,
      req,
      { throwOnError: true },
    );
  });

  it("returns error without deleteUser when tenant sync fails after id-conflict update", async () => {
    const admin = buildAdminClient({ rowForAuthId: { id: AUTH_USER_ID } });
    mockGetSupabaseAdmin.mockReturnValue(admin);
    mockGetSupabaseServer.mockResolvedValue(
      buildServerClient({ code: "23505", message: "duplicate key" }),
    );
    mockSyncAdminUserTenantRole.mockRejectedValue(new Error("tenant upsert failed"));

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/admin/users", {
      method: "POST",
      body: JSON.stringify(postBody()),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error?.code).toBe("TENANT_ROLE_SYNC_FAILED");
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it("deletes auth user on 23505 when no public.users row exists for auth id", async () => {
    const admin = buildAdminClient({ rowForAuthId: null });
    mockGetSupabaseAdmin.mockReturnValue(admin);
    mockGetSupabaseServer.mockResolvedValue(
      buildServerClient({ code: "23505", message: "duplicate key" }),
    );

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/admin/users", {
      method: "POST",
      body: JSON.stringify(postBody({ role: "customer" })),
    });
    const res = await POST(req);

    expect(res.status).toBe(500);
    expect(mockDeleteUser).toHaveBeenCalledWith(AUTH_USER_ID);
    expect(mockSyncAdminUserTenantRole).not.toHaveBeenCalled();
  });

  it("does not delete auth user when service-role role update fails", async () => {
    const admin = buildAdminClient({
      rowForAuthId: { id: AUTH_USER_ID },
      updateError: { message: "update denied" },
      updatedRow: undefined,
    });
    mockGetSupabaseAdmin.mockReturnValue(admin);
    mockGetSupabaseServer.mockResolvedValue(
      buildServerClient({ code: "23505", message: "duplicate key" }),
    );

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/admin/users", {
      method: "POST",
      body: JSON.stringify(postBody()),
    });
    const res = await POST(req);

    expect(res.status).toBe(500);
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });
});
