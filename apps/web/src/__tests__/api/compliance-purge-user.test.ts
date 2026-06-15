/**
 * Tests for POST /api/admin/compliance/purge-user — tenant scope enforcement.
 */

import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockNextRequest, MOCK_USERS } from "../helpers/mock-supabase";

const mockRequireRoleInApi = vi.fn();
const mockGetSupabaseAdmin = vi.fn();
const mockResolveAdminApiTenantId = vi.fn();
const mockGetUserRowIfAccessibleToAdminTenant = vi.fn();
const mockInsertCompliancePurgeAuditLog = vi.fn();
const mockWriteAuditLog = vi.fn();
const mockPurgePlatformUserAccountFully = vi.fn();
const mockCollectUserPurgeSnapshot = vi.fn();

vi.mock("@/lib/supabase/api-helpers", () => ({
  requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
  successResponse: (data: unknown, status = 200) =>
    new Response(JSON.stringify({ data, error: null }), {
      status,
      headers: { "content-type": "application/json" },
    }),
  handleApiError: (error: unknown, message = "Error") =>
    new Response(
      JSON.stringify({
        data: null,
        error: {
          message: `${message}: ${error instanceof Error ? error.message : String(error)}`,
        },
      }),
      { status: 500, headers: { "content-type": "application/json" } },
    ),
  notFoundResponse: (message: string) =>
    new Response(JSON.stringify({ data: null, error: { message, code: "NOT_FOUND" } }), {
      status: 404,
      headers: { "content-type": "application/json" },
    }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: (...args: unknown[]) => mockGetSupabaseAdmin(...args),
}));

vi.mock("@/lib/tenant/admin-request-tenant", () => ({
  resolveAdminApiTenantId: (...args: unknown[]) => mockResolveAdminApiTenantId(...args),
}));

vi.mock("@/lib/tenant/admin-user-tenant-access", () => ({
  getUserRowIfAccessibleToAdminTenant: (...args: unknown[]) =>
    mockGetUserRowIfAccessibleToAdminTenant(...args),
}));

vi.mock("@/lib/account/compliance-purge-audit", () => ({
  insertCompliancePurgeAuditLog: (...args: unknown[]) => mockInsertCompliancePurgeAuditLog(...args),
}));

vi.mock("@/lib/audit/audit", () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
}));

vi.mock("@/lib/account/purge-platform-user", () => ({
  purgePlatformUserAccountFully: (...args: unknown[]) => mockPurgePlatformUserAccountFully(...args),
}));

vi.mock("@/lib/account/compliance-purge-snapshot", () => ({
  collectUserPurgeSnapshot: (...args: unknown[]) => mockCollectUserPurgeSnapshot(...args),
}));

const ROUTE_URL = "http://localhost:3000/api/admin/compliance/purge-user";
const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const TARGET_USER_ID = "22222222-2222-4222-8222-222222222222";

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    user_id: TARGET_USER_ID,
    reason: "Regulatory cleanup ahead of tenant decommission — see ticket COMP-1742.",
    confirmation_phrase: "DELETE USER FOREVER",
    target_email_confirmation: "victim@example.com",
    acknowledge_irreversible: true,
    ...overrides,
  };
}

function buildAdminClient(userRow: { id: string; email: string; role: string } | null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: userRow, error: null });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  const auth = {
    admin: {
      getUserById: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
  };
  return { from, auth, select, eq, maybeSingle };
}

describe("POST /api/admin/compliance/purge-user — tenant scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: MOCK_USERS.superadmin });
    mockResolveAdminApiTenantId.mockResolvedValue(TENANT_ID);
    mockInsertCompliancePurgeAuditLog.mockResolvedValue({ ok: true, id: "audit-id" });
    mockWriteAuditLog.mockResolvedValue(undefined);
  });

  it("returns 404 USER_NOT_FOUND when target user is outside tenant scope", async () => {
    const admin = buildAdminClient({
      id: TARGET_USER_ID,
      email: "victim@example.com",
      role: "customer",
    });
    mockGetSupabaseAdmin.mockReturnValue(admin);
    mockGetUserRowIfAccessibleToAdminTenant.mockResolvedValue(null);

    const { POST } = await import("@/app/api/admin/compliance/purge-user/route");
    const res = await POST(
      createMockNextRequest({
        method: "POST",
        url: ROUTE_URL,
        body: validBody(),
      }) as NextRequest,
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error?.code).toBe("USER_NOT_FOUND");
    expect(body.error?.message).toMatch(/tenant scope/i);
    expect(mockGetUserRowIfAccessibleToAdminTenant).toHaveBeenCalledWith(
      admin,
      TENANT_ID,
      TARGET_USER_ID,
    );
    expect(mockPurgePlatformUserAccountFully).not.toHaveBeenCalled();
    expect(mockInsertCompliancePurgeAuditLog).not.toHaveBeenCalled();
  });

  it("proceeds with purge when user is accessible in tenant scope", async () => {
    const admin = buildAdminClient({
      id: TARGET_USER_ID,
      email: "victim@example.com",
      role: "customer",
    });
    mockGetSupabaseAdmin.mockReturnValue(admin);
    mockGetUserRowIfAccessibleToAdminTenant.mockResolvedValue({ id: TARGET_USER_ID });
    mockCollectUserPurgeSnapshot.mockResolvedValue({
      user_id: TARGET_USER_ID,
      email: "victim@example.com",
    });
    mockPurgePlatformUserAccountFully.mockResolvedValue({
      ok: true,
      storage_attachments_removed: 0,
    });

    const { POST } = await import("@/app/api/admin/compliance/purge-user/route");
    const res = await POST(
      createMockNextRequest({
        method: "POST",
        url: ROUTE_URL,
        body: validBody(),
      }) as NextRequest,
    );

    expect(res.status).toBe(200);
    expect(mockPurgePlatformUserAccountFully).toHaveBeenCalledWith(admin, TARGET_USER_ID);
    expect(mockInsertCompliancePurgeAuditLog).toHaveBeenCalledTimes(1);
  });
});
