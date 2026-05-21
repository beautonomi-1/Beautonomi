import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockResolveAdminTenantContext = vi.fn();
const mockGetSupabaseAdmin = vi.fn();
const mockWriteAuditLog = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
  };
});

vi.mock("@/lib/tenant/scoped-overrides", () => ({
  resolveAdminTenantContext: (...args: unknown[]) => mockResolveAdminTenantContext(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
}));

vi.mock("@/lib/audit/audit", () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
}));

function request(body: Record<string, unknown>) {
  return new NextRequest("https://app.test/api/admin/integrations/yoco", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("PATCH /api/admin/integrations/yoco", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "admin-1", role: "superadmin" } });
    mockResolveAdminTenantContext.mockResolvedValue({
      currentTenantId: "tenant-1",
      requestedScope: { scope: "tenant", tenantId: "tenant-1" },
    });
  });

  it("upserts a tenant-scoped Yoco OAuth app without returning secrets", async () => {
    const inserted: Record<string, unknown>[] = [];
    const selectQuery = {
      eq: vi.fn(() => selectQuery),
      is: vi.fn(() => selectQuery),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    };
    const table = {
      select: vi.fn(() => selectQuery),
      insert: vi.fn((payload: Record<string, unknown>) => {
        inserted.push(payload);
        return { error: null };
      }),
    };
    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn((name: string) => {
        if (name !== "tenant_yoco_oauth_apps") throw new Error(`Unexpected table ${name}`);
        return table;
      }),
    });

    const { PATCH } = await import("../route");
    const res = await PATCH(
      request({
        environment: "live",
        client_id: "client_live_123",
        client_secret: "secret_live_123",
        redirect_uri: "https://app.test/api/provider/yoco/oauth/callback",
        default_scopes: "openid offline_access business/webpos:read business/webpos:write",
        is_enabled: true,
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.message).toBe("Yoco OAuth app configuration updated");
    expect(inserted[0]).toMatchObject({
      tenant_id: "tenant-1",
      environment: "live",
      client_id: "client_live_123",
      client_secret: "secret_live_123",
      redirect_uri: "https://app.test/api/provider/yoco/oauth/callback",
      is_enabled: true,
    });
    expect(json.data.client_secret).toBeUndefined();
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin.integrations.yoco.oauth_app.updated",
      }),
    );
  });

  it("rejects creating an incomplete OAuth app row", async () => {
    const selectQuery = {
      eq: vi.fn(() => selectQuery),
      is: vi.fn(() => selectQuery),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    };
    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => selectQuery),
      })),
    });

    const { PATCH } = await import("../route");
    const res = await PATCH(
      request({
        environment: "sandbox",
        client_id: "client_sandbox_123",
        redirect_uri: "https://app.test/api/provider/yoco/oauth/callback",
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });
});
