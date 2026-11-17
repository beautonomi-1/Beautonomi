import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockNextRequest } from "@/__tests__/helpers/mock-supabase";

/**
 * F3-02 — campaign PATCH/DELETE/send/test-send must require `manage_marketing`
 * (same as list/create). A provider_staff user without the permission → 403.
 */

const mockRequireRoleInApi = vi.fn();
const mockRequirePermission = vi.fn();
const mockGetProviderIdForUser = vi.fn();
const tableWrite = vi.fn();
const mockDispatchCampaign = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...a: unknown[]) => mockRequireRoleInApi(...a),
    getProviderIdForUser: (...a: unknown[]) => mockGetProviderIdForUser(...a),
  };
});
vi.mock("@/lib/auth/requirePermission", () => ({
  requirePermission: (...a: unknown[]) => mockRequirePermission(...a),
  requireAnyPermission: (...a: unknown[]) => mockRequirePermission(...a),
}));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseServer: vi.fn(async () => buildSupabase()) }));
vi.mock("@/lib/marketing/dispatch-campaign", () => ({
  dispatchCampaign: (...a: unknown[]) => mockDispatchCampaign(...a),
}));
vi.mock("@/lib/subscriptions/feature-access", () => ({
  canUseMarketingChannel: vi.fn(async () => true),
  checkMarketingFeatureAccess: vi.fn(async () => ({ enabled: true })),
}));
vi.mock("../route", () => ({
  calculateSegmentCount: vi.fn(async () => 0),
  getProviderTimezoneForCampaigns: vi.fn(async () => "Africa/Johannesburg"),
}));

function buildSupabase() {
  return {
    from: vi.fn(() => {
      const c: Record<string, unknown> = {};
      for (const m of ["select", "eq", "order", "limit", "in"]) c[m] = vi.fn(() => c);
      c.update = vi.fn((v: unknown) => {
        tableWrite("update", v);
        return c;
      });
      c.delete = vi.fn(() => {
        tableWrite("delete");
        return c;
      });
      c.single = vi.fn(async () => ({
        data: { id: "camp-1", provider_id: "provider-1", status: "draft", name: "Promo" },
        error: null,
      }));
      c.maybeSingle = c.single;
      return c;
    }),
  };
}

const params = { params: Promise.resolve({ id: "camp-1" }) };
const req = (method: string, body: Record<string, unknown> = {}) =>
  createMockNextRequest({ method, url: "http://localhost:3000/api/provider/campaigns/camp-1", body });

describe("campaign mutations require manage_marketing (F3-02)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Staff user without manage_marketing: role check passes, permission check fails.
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "staff-1", role: "provider_staff" } });
    mockRequirePermission.mockResolvedValue({
      authorized: false,
      response: new Response(JSON.stringify({ error: "Permission denied" }), { status: 403 }),
    });
    mockGetProviderIdForUser.mockResolvedValue("provider-1");
    mockDispatchCampaign.mockResolvedValue({ ok: true, sentCount: 1, failedCount: 0 });
  });

  it("PATCH /campaigns/[id] → 403 without manage_marketing", async () => {
    const { PATCH } = await import("../[id]/route");
    const res = await PATCH(req("PATCH", { name: "Renamed" }), params);
    expect(res.status).toBe(403);
    expect(tableWrite).not.toHaveBeenCalled();
  });

  it("DELETE /campaigns/[id] → 403 without manage_marketing", async () => {
    const { DELETE } = await import("../[id]/route");
    const res = await DELETE(req("DELETE"), params);
    expect(res.status).toBe(403);
    expect(tableWrite).not.toHaveBeenCalled();
  });

  it("POST /campaigns/[id]/send → 403 and does not dispatch", async () => {
    const { POST } = await import("../[id]/send/route");
    const res = await POST(req("POST"), params);
    expect(res.status).toBe(403);
    expect(mockDispatchCampaign).not.toHaveBeenCalled();
  });

  it("POST /campaigns/test-send → 403", async () => {
    const { POST } = await import("../test-send/route");
    const res = await POST(
      req("POST", { type: "sms", content: "hello", to: "+27000000000" }),
    );
    expect(res.status).toBe(403);
  });
});
