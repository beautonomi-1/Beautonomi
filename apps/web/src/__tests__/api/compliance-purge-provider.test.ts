import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockNextRequest, MOCK_USERS } from "../helpers/mock-supabase";

const mockRequireRoleInApi = vi.fn();
const mockGetSupabaseAdmin = vi.fn();
const mockResolveAdminApiTenantId = vi.fn();
const mockInsertCompliancePurgeAuditLog = vi.fn();
const mockWriteAuditLog = vi.fn();
const mockPurgeProviderOrganizationFully = vi.fn();
const mockCollectProviderOrgPurgeSnapshot = vi.fn();
const mockCollectUserPurgeSnapshot = vi.fn();
const mockInvalidatePublicProviderCache = vi.fn();

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
        error: { message: `${message}: ${error instanceof Error ? error.message : String(error)}` },
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

vi.mock("@/lib/account/compliance-purge-audit", () => ({
  insertCompliancePurgeAuditLog: (...args: unknown[]) => mockInsertCompliancePurgeAuditLog(...args),
}));

vi.mock("@/lib/audit/audit", () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
  extractRequestMeta: () => ({ ip_address: "127.0.0.1", user_agent: "vitest" }),
}));

vi.mock("@/lib/account/purge-platform-user", () => ({
  purgeProviderOrganizationFully: (...args: unknown[]) => mockPurgeProviderOrganizationFully(...args),
}));

vi.mock("@/lib/account/compliance-purge-snapshot", () => ({
  collectProviderOrgPurgeSnapshot: (...args: unknown[]) => mockCollectProviderOrgPurgeSnapshot(...args),
  collectUserPurgeSnapshot: (...args: unknown[]) => mockCollectUserPurgeSnapshot(...args),
}));

vi.mock("@/lib/providers/invalidate-public-provider-cache", () => ({
  invalidatePublicProviderCache: (...args: unknown[]) => mockInvalidatePublicProviderCache(...args),
}));

const ROUTE_URL = "http://localhost:3000/api/admin/compliance/purge-provider";
const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const PROVIDER_ID = "33333333-3333-4333-8333-333333333333";
const OWNER_ID = "44444444-4444-4444-8444-444444444444";

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    provider_id: PROVIDER_ID,
    reason: "Regulatory cleanup ahead of tenant decommission — see ticket COMP-1742.",
    confirmation_phrase: "PURGE PROVIDER ORG",
    typed_email_confirmation: "biz@example.com",
    acknowledge_irreversible: true,
    ...overrides,
  };
}

function buildAdminClient() {
  const ownerRoleMaybeSingle = vi.fn().mockResolvedValue({ data: { role: "provider_owner" }, error: null });
  const actorEmailMaybeSingle = vi.fn().mockResolvedValue({ data: { email: "admin@example.com" }, error: null });
  const eq = vi
    .fn()
    .mockImplementationOnce(() => ({ maybeSingle: ownerRoleMaybeSingle }))
    .mockImplementationOnce(() => ({ maybeSingle: actorEmailMaybeSingle }));
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  const auth = {
    admin: {
      getUserById: vi.fn().mockResolvedValue({ data: { user: { email: "owner@example.com" } }, error: null }),
    },
  };
  return { from, auth };
}

const orgSnap = {
  provider_id: PROVIDER_ID,
  provider_email: "biz@example.com",
  provider_billing_email: null,
  owner_email: "owner@example.com",
  owner_user_id: OWNER_ID,
  staff_login_user_ids: [] as string[],
  stats: { booking_count: 1, review_count: 0, staff_with_login_count: 0 },
};

describe("POST /api/admin/compliance/purge-provider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: MOCK_USERS.superadmin });
    mockResolveAdminApiTenantId.mockResolvedValue(TENANT_ID);
    mockInsertCompliancePurgeAuditLog.mockResolvedValue({ ok: true, id: "audit-id" });
    mockWriteAuditLog.mockResolvedValue(undefined);
    mockCollectProviderOrgPurgeSnapshot.mockResolvedValue(orgSnap);
  });

  it("dry_run returns org preview without purge", async () => {
    mockGetSupabaseAdmin.mockReturnValue(buildAdminClient());

    const { POST } = await import("@/app/api/admin/compliance/purge-provider/route");
    const res = await POST(
      createMockNextRequest({
        method: "POST",
        url: ROUTE_URL,
        body: validBody({ dry_run: true }),
      }) as NextRequest,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data?.dry_run).toBe(true);
    expect(body.data?.preview).toBeTruthy();
    expect(mockPurgeProviderOrganizationFully).not.toHaveBeenCalled();
    expect(mockCollectUserPurgeSnapshot).not.toHaveBeenCalled();
    expect(mockInsertCompliancePurgeAuditLog).not.toHaveBeenCalled();
  });

  it("writes failed audit log when provider purge fails", async () => {
    mockGetSupabaseAdmin.mockReturnValue(buildAdminClient());
    mockCollectUserPurgeSnapshot.mockResolvedValue({ user_id: OWNER_ID });
    mockPurgeProviderOrganizationFully.mockResolvedValue({
      ok: false,
      message: "blocked",
      code: "PURGE_FAILED",
    });

    const { POST } = await import("@/app/api/admin/compliance/purge-provider/route");
    const res = await POST(
      createMockNextRequest({
        method: "POST",
        url: ROUTE_URL,
        body: validBody(),
      }) as NextRequest,
    );

    expect(res.status).toBe(500);
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", action: "admin.provider.compliance_purge" }),
    );
    expect(mockInsertCompliancePurgeAuditLog).not.toHaveBeenCalled();
  });
});
