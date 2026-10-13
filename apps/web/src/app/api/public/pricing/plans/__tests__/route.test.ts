import { describe, it, expect, vi, beforeEach } from "vitest";

const mockResolvePublished = vi.fn();
const mockFetchScopedListMerged = vi.fn();
const mockLoadLinkedMap = vi.fn();

vi.mock("@/lib/pricing/published-pricing-plans", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/pricing/published-pricing-plans")>();
  return {
    ...actual,
    resolvePublishedPricingPlanRows: (...args: unknown[]) => mockResolvePublished(...args),
  };
});

vi.mock("@/lib/tenant/scoped-overrides", () => ({
  fetchScopedListMerged: (...args: unknown[]) => mockFetchScopedListMerged(...args),
}));

vi.mock("@/lib/tenant/resolve-tenant-from-db", () => ({
  resolveTenantFromRequest: vi.fn(async () => ({ id: "tenant-1" })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(async () => ({ data: [] })),
        })),
      })),
    })),
  })),
}));

vi.mock("@/lib/pricing/public-pricing-billing-periods", () => ({
  loadLinkedSubscriptionPlanPricesMap: (...args: unknown[]) => mockLoadLinkedMap(...args),
  buildPublicPricingBillingPeriods: vi.fn(() => []),
}));

describe("GET /api/public/pricing/plans", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockFetchScopedListMerged.mockResolvedValue({
      data: [
        { id: "legacy", name: "Starter", subscription_plan_id: null },
        { id: "modern", name: "Beautonomi Starter", subscription_plan_id: "sub-free" },
      ],
    });
    mockResolvePublished.mockImplementation(async (_sb, rows) =>
      rows.filter((r: { subscription_plan_id?: string | null }) => r.subscription_plan_id),
    );
    mockLoadLinkedMap.mockResolvedValue(new Map());
  });

  it("returns only published catalog rows after filter", async () => {
    const { GET } = await import("../route");
    const res = await GET(new Request("http://localhost/api/public/pricing/plans"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(1);
    expect(json.data[0].id).toBe("modern");
    expect(mockResolvePublished).toHaveBeenCalled();
  });
});
