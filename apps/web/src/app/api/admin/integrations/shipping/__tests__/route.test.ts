import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockGetSupabaseAdmin = vi.fn();
const mockWriteAuditLog = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
}));

vi.mock("@/lib/audit/audit", () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
}));

function patchRequest(body: Record<string, unknown>) {
  return new NextRequest("https://app.test/api/admin/integrations/shipping", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function getRequest() {
  return new NextRequest("https://app.test/api/admin/integrations/shipping", {
    method: "GET",
  });
}

function platformSecretsClient(row: Record<string, unknown> | null, updates: Record<string, unknown>[]) {
  const selectQuery = {
    is: vi.fn(() => selectQuery),
    order: vi.fn(() => selectQuery),
    limit: vi.fn(() => selectQuery),
    maybeSingle: vi.fn(async () => ({ data: row, error: null })),
  };
  const table = {
    select: vi.fn(() => selectQuery),
    update: vi.fn((payload: Record<string, unknown>) => {
      updates.push(payload);
      return { eq: vi.fn(async () => ({ error: null })) };
    }),
    insert: vi.fn(async (payload: Record<string, unknown>) => {
      updates.push(payload);
      return { error: null };
    }),
  };
  return {
    from: vi.fn((name: string) => {
      if (name !== "platform_secrets") throw new Error(`Unexpected table ${name}`);
      return table;
    }),
  };
}

describe("/api/admin/integrations/shipping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    delete process.env.ECOMMERCE_SHIPPING_ENABLED;
    delete process.env.COURIER_GUY_API_KEY;
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "admin-1", role: "superadmin" } });
  });

  it("requires superadmin", async () => {
    mockRequireRoleInApi.mockRejectedValue(
      Object.assign(new Error("Insufficient permissions"), { status: 403 }),
    );
    const { PATCH } = await import("../route");
    const res = await PATCH(patchRequest({ ecommerce_shipping_enabled: true }));
    expect(res.status).toBe(403);
  });

  it("never returns a live courier key from GET", async () => {
    const liveKey = "live-shiplogic-token-secret";
    mockGetSupabaseAdmin.mockReturnValue(
      platformSecretsClient(
        {
          id: "secrets-1",
          ecommerce_shipping_enabled: true,
          courier_guy_api_key: liveKey,
          updated_at: "2026-08-15T00:00:00.000Z",
        },
        [],
      ),
    );
    const { GET } = await import("../route");
    const res = await GET(getRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    const body = JSON.stringify(json);
    expect(body).not.toContain(liveKey);
    expect(json.data.couriers["courier-guy"].configured).toBe(true);
    expect(json.data.couriers["courier-guy"].masked_key).toMatch(/\.\.\./);
    expect(json.data.enabled).toBe(true);
  });

  it("saves the enable flag and masks courier keys in the audit log", async () => {
    const updates: Record<string, unknown>[] = [];
    mockGetSupabaseAdmin.mockReturnValue(
      platformSecretsClient({ id: "secrets-1" }, updates),
    );

    const { PATCH } = await import("../route");
    const res = await PATCH(
      patchRequest({
        ecommerce_shipping_enabled: true,
        courier_guy_api_key: "live-shiplogic-token",
      }),
    );
    expect(res.status).toBe(200);
    expect(updates[0]).toMatchObject({
      ecommerce_shipping_enabled: true,
      courier_guy_api_key: "live-shiplogic-token",
    });
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin.integrations.shipping.updated",
        after_json: expect.objectContaining({
          courier_guy_api_key: expect.stringMatching(/\.\.\./),
        }),
      }),
    );
  });
});
