import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../route";

const snapshotRow = {
  as_of: "2026-03-01",
  booking_frequency_30d: 1.2,
  repeat_rate_90d: 0.4,
  transacting_providers_7d: 5,
  transacting_providers_30d: 20,
  active_providers: 40,
  supply_liquidity: 0.5,
  provider_bookings_per_week: 3,
  take_rate: 0.18,
  gmv: 1000,
  platform_net: 200,
  contribution_margin: 150,
  completed_bookings_day: 10,
  booking_take_net: 100,
  subscription_net: 50,
  ads_net: 20,
  service_fees_net: 30,
  refreshed_at: "2026-03-01T00:00:00Z",
};

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: vi.fn(async () => mockSupabase),
}));

vi.mock("@/lib/supabase/api-helpers", () => ({
  requireAdminSection: vi.fn(async () => ({})),
  successResponse: vi.fn((data) => Response.json({ data, error: null })),
  handleApiError: vi.fn((error: unknown) =>
    Response.json({ data: null, error: String(error) }, { status: 500 }),
  ),
}));

vi.mock("@/lib/tenant/admin-request-tenant", () => ({
  resolveAdminApiTenantId: vi.fn(async () => "tenant-1"),
}));

vi.mock("@/lib/reports/fetch-all-ledger-pages", () => ({
  fetchAllLedgerPages: vi.fn(async () => []),
}));

let mockSupabase: { from: ReturnType<typeof vi.fn> };

function healthDailyChain() {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        order: vi.fn(() => ({
          limit: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: snapshotRow, error: null })),
          })),
        })),
        lte: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            })),
          })),
        })),
        gte: vi.fn(() => ({
          lte: vi.fn(() => ({
            order: vi.fn(async () => ({ data: [snapshotRow], error: null })),
          })),
        })),
      })),
    })),
  };
}

beforeEach(() => {
  mockSupabase = {
    from: vi.fn((table: string) => {
      if (table === "marketplace_health_daily") return healthDailyChain();
      return healthDailyChain();
    }),
  };
});

describe("GET /api/admin/marketplace-health", () => {
  it("returns contract definitions for the glossary", async () => {
    const res = await GET({
      url: "https://example.test/api/admin/marketplace-health?period=30d",
    } as never);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data?.contracts?.length).toBeGreaterThan(0);
    expect(body.data.contracts.some((c: { key: string }) => c.key === "takeRate")).toBe(true);
    expect(body.data.period).toBe("30d");
    expect(body.data.latest?.as_of).toBe("2026-03-01");
  });
});
