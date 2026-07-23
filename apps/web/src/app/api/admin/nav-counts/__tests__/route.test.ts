import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockResolveAdminApiTenantId = vi.fn();
const mockFetchAllProviderIdsForTenant = vi.fn();
const mockCountRefundable = vi.fn();
const mockGetSupabaseAdmin = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
  };
});

vi.mock("@/lib/tenant/admin-request-tenant", () => ({
  resolveAdminApiTenantId: (...args: unknown[]) => mockResolveAdminApiTenantId(...args),
}));

vi.mock("@/lib/tenant/admin-tenant-scope", () => ({
  fetchAllProviderIdsForTenant: (...args: unknown[]) => mockFetchAllProviderIdsForTenant(...args),
}));

vi.mock("@/lib/admin/refundable-payment-transactions", () => ({
  countRefundableSuccessPaymentTxsForTenant: (...args: unknown[]) => mockCountRefundable(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: (...args: unknown[]) => mockGetSupabaseAdmin(...args),
}));

vi.mock("@/lib/admin/verification-tenant-access", () => ({
  filterVerificationsForAdminTenant: async (_s: unknown, _t: unknown, rows: unknown[]) => rows,
}));

vi.mock("@/lib/admin/safety-events-tenant-scope", () => ({
  countAllOpenSafetyEvents: async () => 0,
  countOpenSafetyEventsForTenant: async () => 0,
}));

function makeCountChain(count: number) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    is: () => chain,
    or: () => chain,
    lt: () => chain,
    not: () => chain,
    gte: () => chain,
    then: (resolve: (v: unknown) => void) => resolve({ count, error: null }),
  };
  return chain;
}

function makeSupabase() {
  return {
    from: (table: string) => {
      if (table === "user_verifications") return makeCountChain(0);
      if (table === "payouts") return makeCountChain(0);
      if (table === "booking_disputes") return makeCountChain(0);
      if (table === "providers") return makeCountChain(0);
      if (table === "bookings") return makeCountChain(0);
      if (table === "user_reports") return makeCountChain(0);
      if (table === "product_orders") return makeCountChain(0);
      if (table === "product_return_requests") return makeCountChain(0);
      if (table === "provider_subscriptions") return makeCountChain(0);
      if (table === "webhook_events") return makeCountChain(0);
      if (table === "provider_leads") return makeCountChain(0);
      if (table === "provider_onboarding_tracking") return makeCountChain(0);
      return makeCountChain(0);
    },
    rpc: async () => ({ data: [], error: null }),
  };
}

describe("GET /api/admin/nav-counts refunds badge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: { role: "superadmin" } });
    mockResolveAdminApiTenantId.mockResolvedValue("tenant-1");
    mockFetchAllProviderIdsForTenant.mockResolvedValue([]);
    mockGetSupabaseAdmin.mockReturnValue(makeSupabase());
  });

  it("uses refundable success payment count for /admin/refunds", async () => {
    mockCountRefundable.mockResolvedValue(42);

    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/admin/nav-counts"));
    const body = await res.json();

    expect(mockCountRefundable).toHaveBeenCalledWith(expect.anything(), "tenant-1");
    expect(body.data["/admin/refunds"]).toBe(42);
  });
});
