import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockNextRequest } from "@/__tests__/helpers/mock-supabase";

/**
 * F3-07 — money-affecting settings / integrations must not be writable by
 * any provider_staff member purely by role:
 *   settings/payments PATCH            → edit_settings
 *   ads/campaigns POST, [id]/checkout  → manage_marketing
 *   paycloud terminals POST/PUT/DELETE → edit_settings
 *   paycloud settings PATCH            → edit_settings
 *   yoco devices POST/PUT/DELETE       → edit_settings
 * A staff user with none of those permissions → 403 and no DB write.
 */

const mockRequireRoleInApi = vi.fn();
const mockRequirePermission = vi.fn();
const dbWrite = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...a: unknown[]) => mockRequireRoleInApi(...a),
    getProviderIdForUser: vi.fn(async () => "provider-1"),
    userHasProviderAccessAdmin: vi.fn(async () => true),
  };
});
vi.mock("@/lib/auth/requirePermission", () => ({
  requirePermission: (...a: unknown[]) => mockRequirePermission(...a),
  requireAnyPermission: (...a: unknown[]) => mockRequirePermission(...a),
  requireOwnerOrEditSettings: (...a: unknown[]) => mockRequirePermission(...a),
}));

function writeTrackingClient() {
  return {
    from: vi.fn(() => {
      const c: Record<string, unknown> = {};
      for (const m of ["select", "eq", "order", "limit", "in", "is", "neq"]) c[m] = vi.fn(() => c);
      for (const m of ["insert", "update", "delete", "upsert"]) {
        c[m] = vi.fn(() => {
          dbWrite(m);
          return c;
        });
      }
      c.single = vi.fn(async () => ({ data: { id: "x", provider_id: "provider-1" }, error: null }));
      c.maybeSingle = c.single;
      return c;
    }),
    rpc: vi.fn(async () => ({ data: null, error: null })),
  };
}
vi.mock("@/lib/supabase/server", () => ({ getSupabaseServer: vi.fn(async () => writeTrackingClient()) }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => writeTrackingClient() }));
vi.mock("@/lib/tenant/resolve-tenant-from-db", () => ({
  resolveTenantIdWithZaFallback: vi.fn(async () => "tenant-1"),
}));
vi.mock("@/lib/tenant/provider-matches-host", () => ({
  PROVIDER_MARKET_MISMATCH_MSG: "mismatch",
  providerTenantMismatchResponse: vi.fn(async () => null),
}));
vi.mock("@/lib/server/feature-flags", () => ({ isFeatureEnabledServer: vi.fn(async () => true) }));
vi.mock("@/lib/payments/paycloud-feature-gate", () => ({
  requirePaycloudPlatformEnabledForProvider: vi.fn(async () => null),
  isPaycloudQrEnabledForProvider: vi.fn(async () => true),
  isPaycloudCashbackEnabledForProvider: vi.fn(async () => true),
}));
vi.mock("@/lib/payments/yoco-feature-gate", () => ({
  requireYocoPlatformEnabledForProvider: vi.fn(async () => null),
}));
vi.mock("@/lib/subscriptions/feature-access", () => ({
  checkYocoFeatureAccess: vi.fn(async () => ({ enabled: true })),
  checkPaycloudFeatureAccess: vi.fn(async () => ({ enabled: true })),
  checkNewGateFeatureAccess: vi.fn(async () => true),
  SUBSCRIPTION_FEATURE_KEYS: { ads: "ads" },
}));

const p = (id = "x1") => ({ params: Promise.resolve({ id }) });
const req = (method: string, body: Record<string, unknown> = {}) =>
  createMockNextRequest({ method, url: "http://localhost:3000/api/provider/test", body });

describe("money settings permission gates (F3-07)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "staff-1", role: "provider_staff" } });
    mockRequirePermission.mockResolvedValue({
      authorized: false,
      response: new Response(JSON.stringify({ error: "Permission denied" }), { status: 403 }),
    });
  });

  it("PATCH settings/payments → 403 for staff without edit_settings", async () => {
    const { PATCH } = await import("../settings/payments/route");
    const res = await PATCH(req("PATCH", { acceptCash: true }));
    expect(res.status).toBe(403);
    expect(dbWrite).not.toHaveBeenCalled();
  }, 120_000); // first import of the payments route is transform-heavy

  it("POST ads/campaigns → 403 for staff without manage_marketing", async () => {
    const { POST } = await import("../ads/campaigns/route");
    const res = await POST(req("POST", { name: "Boost", budget: 500 }));
    expect(res.status).toBe(403);
    expect(mockRequirePermission).toHaveBeenCalledWith("manage_marketing", expect.anything());
    expect(dbWrite).not.toHaveBeenCalled();
  });

  it("POST ads/campaigns/[id]/checkout → 403 for staff without manage_marketing", async () => {
    const { POST } = await import("../ads/campaigns/[id]/checkout/route");
    const res = await POST(req("POST", {}), p());
    expect(res.status).toBe(403);
    expect(dbWrite).not.toHaveBeenCalled();
  });

  it("POST paycloud/terminals → 403 for staff without edit_settings", async () => {
    const { POST } = await import("../paycloud/terminals/route");
    const res = await POST(req("POST", { terminal_sn: "SN1", display_name: "Front" }));
    expect(res.status).toBe(403);
    expect(dbWrite).not.toHaveBeenCalled();
  });

  it("PUT/DELETE paycloud/terminals/[id] → 403 for staff without edit_settings", async () => {
    const { PUT, DELETE } = await import("../paycloud/terminals/[id]/route");
    expect((await PUT(req("PUT", { display_name: "Renamed" }), p())).status).toBe(403);
    expect((await DELETE(req("DELETE"), p())).status).toBe(403);
    expect(dbWrite).not.toHaveBeenCalled();
  });

  it("PATCH paycloud/settings → 403 for staff without edit_settings", async () => {
    const { PATCH } = await import("../paycloud/settings/route");
    const res = await PATCH(req("PATCH", { accept_paycloud: true }));
    expect(res.status).toBe(403);
    expect(dbWrite).not.toHaveBeenCalled();
  });

  it("POST yoco/devices → 403 for staff without edit_settings", async () => {
    const { POST } = await import("../yoco/devices/route");
    const res = await POST(req("POST", { name: "Front desk" }));
    expect(res.status).toBe(403);
    expect(dbWrite).not.toHaveBeenCalled();
  });

  it("PUT/DELETE yoco/devices/[id] → 403 for staff without edit_settings", async () => {
    const { PUT, DELETE } = await import("../yoco/devices/[id]/route");
    expect((await PUT(req("PUT", { name: "Renamed" }), p())).status).toBe(403);
    expect((await DELETE(req("DELETE"), p())).status).toBe(403);
    expect(dbWrite).not.toHaveBeenCalled();
  });
});
