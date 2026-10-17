import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockUserHasProviderAccessAdmin = vi.fn();
const mockGetSupabaseAdmin = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
}));

vi.mock("@/lib/ads/refund-unused-ads-budget", () => ({
  refundUnusedAdsBudget: vi.fn(),
}));

vi.mock("@/lib/ads/notify-ads-campaign-event", () => ({
  notifyAdsCampaignEvent: vi.fn(),
}));

vi.mock("@/lib/supabase/api-helpers", () => ({
  requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
  userHasProviderAccessAdmin: (...args: unknown[]) => mockUserHasProviderAccessAdmin(...args),
  successResponse: (data: unknown) => Response.json({ data, error: null }, { status: 200 }),
  handleApiError: (error: unknown, fallback: string) =>
    Response.json(
      { data: null, error: { message: error instanceof Error ? error.message : fallback } },
      { status: 500 },
    ),
  errorResponse: (msg: string, code: string, status: number) =>
    Response.json({ data: null, error: { message: msg, code } }, { status }),
}));

function mockCampaignRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "camp-1",
    provider_id: "provider-1",
    status: "paused",
    pack_impressions: null,
    budget: 500,
    spent: 100,
    billing_model: "cpc_budget",
    start_at: null,
    end_at: null,
    funded_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function setupSupabase(existing: Record<string, unknown>, updateResult?: Record<string, unknown>) {
  mockGetSupabaseAdmin.mockReturnValue({
    from: (table: string) => {
      if (table === "ads_campaigns") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: existing, error: null }),
            }),
          }),
          update: () => ({
            eq: () => ({
              eq: () => ({
                select: () => ({
                  single: vi.fn().mockResolvedValue({
                    data: updateResult ?? existing,
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  });
}

describe("PATCH /api/provider/ads/campaigns/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "user-1" } });
    mockUserHasProviderAccessAdmin.mockResolvedValue(true);
  });

  it("blocks budget increase with BUDGET_INCREASE_REQUIRES_PAYMENT and no top-up copy", async () => {
    setupSupabase(mockCampaignRow());
    const { PATCH } = await import("../route");
    const req = new NextRequest("http://localhost/api/provider/ads/campaigns/camp-1", {
      method: "PATCH",
      body: JSON.stringify({ budget: 600 }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "camp-1" }) });
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error?.code).toBe("BUDGET_INCREASE_REQUIRES_PAYMENT");
    expect(json.error?.message).toContain("Budget can only be lowered");
    expect(json.error?.message).not.toContain("top-up");
  });

  it("blocks activating a campaign that is pending_review", async () => {
    setupSupabase(mockCampaignRow({ status: "pending_review" }));
    const { PATCH } = await import("../route");
    const req = new NextRequest("http://localhost/api/provider/ads/campaigns/camp-1", {
      method: "PATCH",
      body: JSON.stringify({ status: "active" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "camp-1" }) });
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error?.code).toBe("PENDING_REVIEW");
  });
});
