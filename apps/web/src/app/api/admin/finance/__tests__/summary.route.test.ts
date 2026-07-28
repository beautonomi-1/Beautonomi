import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireAdminSection = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockGetSupabaseAdmin = vi.fn();
const mockResolveAdminApiTenantId = vi.fn();
const mockFetchFinanceLedgerRowsForTenant = vi.fn();
const mockAggregateFinanceLedgerRows = vi.fn();
const mockGatewayFeesTotalFromAggregate = vi.fn();
const mockGetNegativeBalanceProvidersForTenant = vi.fn();
const mockComputeAlignedBookingsGmv = vi.fn();
const mockCountGatewayFeeCaptureAnomalies = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireAdminSection: (...args: unknown[]) => mockRequireAdminSection(...args),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: (...args: unknown[]) => mockGetSupabaseAdmin(...args),
}));

vi.mock("@/lib/tenant/admin-request-tenant", () => ({
  resolveAdminApiTenantId: (...args: unknown[]) => mockResolveAdminApiTenantId(...args),
}));

vi.mock("@/lib/admin/finance-ledger-tenant", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/finance-ledger-tenant")>();
  return {
    ...actual,
    fetchFinanceLedgerRowsForTenant: (...args: unknown[]) => mockFetchFinanceLedgerRowsForTenant(...args),
  };
});

vi.mock("@/lib/admin/aggregate-finance-ledger-rows", () => ({
  aggregateFinanceLedgerRows: (...args: unknown[]) => mockAggregateFinanceLedgerRows(...args),
  gatewayFeesTotalFromAggregate: (...args: unknown[]) => mockGatewayFeesTotalFromAggregate(...args),
}));

vi.mock("@/lib/admin/negative-provider-payout-balances", () => ({
  getNegativeBalanceProvidersForTenant: (...args: unknown[]) =>
    mockGetNegativeBalanceProvidersForTenant(...args),
}));

vi.mock("@/lib/admin/bookings-gmv-for-reconciliation", () => ({
  computeAlignedBookingsGmv: (...args: unknown[]) => mockComputeAlignedBookingsGmv(...args),
}));

vi.mock("@/lib/admin/gateway-fee-capture-anomalies", () => ({
  countGatewayFeeCaptureAnomalies: (...args: unknown[]) => mockCountGatewayFeeCaptureAnomalies(...args),
}));

function makeSupabaseAdminChain() {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    gt: () => chain,
    gte: () => chain,
    lte: () => chain,
    then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null, count: 0 }),
  };
  return chain;
}

function baseAggregate() {
  return {
    currency: "ZAR",
    service_collected_gross: 1000,
    service_collected_net: 950,
    gateway_fees_services: 50,
    platform_commission_gross: 100,
    platform_refund_contra: 0,
    platform_refund_impact: 0,
    platform_commission_net: 100,
    platform_take_net: 100,
    tips_gross: 20,
    taxes_gross: 15,
    subscription_net: 30,
    subscription_gateway_fees: 2,
    subscription_gross: 32,
    ads_net: 10,
    ads_gateway_fees: 1,
    ads_gross: 11,
    marketing_credit_net: 0,
    marketing_credit_gateway_fees: 0,
    marketing_credit_gross: 0,
    provider_earnings_net: 800,
    gift_card_sales: 0,
    membership_sales: 0,
    refunds_abs_gross: 0,
    refunds_gross: 0,
    provider_refund_net_impact: 0,
    cancellation_fees_retained: 5,
    promotion_discounts: 0,
    membership_discounts: 0,
    loyalty_discounts: 0,
    loyalty_redemptions: 0,
    wallet_topup_ledger: 0,
    payouts_paid_total: -200,
    gift_card_liability_reductions: 0,
    ecommerce_platform_fees: 0,
    platform_fee_revenue: 25,
    service_fee_revenue: 25,
    travel_fees: 0,
    walk_in_additional_charges: 0,
    provider_recognized_revenue_gross: 825,
    additional_charge_gross: 0,
    manual_adjustments_net: 0,
    other_gateway_fees: 0,
    payout_transfer_fees: 0,
    terminal_gateway_fees: 0,
    membership_gateway_fees: 0,
    terminal_revenue_gross: 0,
  };
}

describe("GET /api/admin/finance/summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockRequireAdminSection.mockResolvedValue({ user: { id: "admin-1", role: "superadmin" } });
    mockGetSupabaseServer.mockResolvedValue({});
    mockResolveAdminApiTenantId.mockResolvedValue("tenant-1");
    mockGetSupabaseAdmin.mockReturnValue({
      from: () => makeSupabaseAdminChain(),
    });
    mockFetchFinanceLedgerRowsForTenant.mockResolvedValue([{ id: "tx-1", transaction_type: "payment", net: 1000 }]);
    mockAggregateFinanceLedgerRows.mockImplementation(() => baseAggregate());
    mockGatewayFeesTotalFromAggregate.mockReturnValue(53);
    mockGetNegativeBalanceProvidersForTenant.mockResolvedValue({ count: 0, providers: [] });
    mockComputeAlignedBookingsGmv.mockResolvedValue({
      alignedBookingsGmv: 1000,
      grossBookingsGmv: 1000,
      walkInAddOnDeduction: 0,
    });
    mockCountGatewayFeeCaptureAnomalies.mockResolvedValue({ row_count: 0, expected_fees_total: 0 });
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireAdminSection.mockResolvedValue({ user: null });
    const { GET } = await import("../summary/route");
    const res = await GET(new NextRequest("http://localhost/api/admin/finance/summary"));
    expect(res.status).toBe(401);
  });

  it("returns defaulted period and metrics_meta when no dates supplied", async () => {
    const { GET } = await import("../summary/route");
    const res = await GET(new NextRequest("http://localhost/api/admin/finance/summary"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.error).toBeNull();
    expect(body.data.period.defaulted).toBe(true);
    expect(body.data.service_collected_gross).toBe(1000);
    expect(body.data.metrics_meta.contract_version).toBeTruthy();
    expect(body.data.reconciliation.checks.ledger_vs_bookings_gmv.status).toBe("ok");
  });

  it("passes provider_id filter to ledger fetch", async () => {
    const { GET } = await import("../summary/route");
    await GET(
      new NextRequest("http://localhost/api/admin/finance/summary?provider_id=prov-99"),
    );

    expect(mockFetchFinanceLedgerRowsForTenant).toHaveBeenCalledWith(
      expect.anything(),
      "tenant-1",
      expect.objectContaining({ start: expect.any(String), end: expect.any(String) }),
      { restrictProviderIds: ["prov-99"] },
    );
  });

  it("computes gmv_growth using prior-period ledger fetch", async () => {
    mockFetchFinanceLedgerRowsForTenant
      .mockResolvedValueOnce([{ id: "tx-1", transaction_type: "payment", net: 1000 }])
      .mockResolvedValueOnce([{ id: "tx-0", transaction_type: "payment", net: 800 }]);
    mockAggregateFinanceLedgerRows
      .mockReturnValueOnce(baseAggregate())
      .mockReturnValueOnce({ ...baseAggregate(), service_collected_gross: 800 });

    const { GET } = await import("../summary/route");
    const res = await GET(new NextRequest("http://localhost/api/admin/finance/summary"));
    const body = await res.json();

    expect(mockFetchFinanceLedgerRowsForTenant).toHaveBeenCalledTimes(2);
    expect(body.data.gmv_growth).toBe(25);
  });

  it("marks custom period when both start and end dates are set", async () => {
    const { GET } = await import("../summary/route");
    const res = await GET(
      new NextRequest(
        "http://localhost/api/admin/finance/summary?start_date=2026-01-01&end_date=2026-01-31",
      ),
    );
    const body = await res.json();

    expect(body.data.period.defaulted).toBe(false);
    expect(body.data.period.start_date).toContain("2026-01-01");
    expect(body.data.period.end_date).toContain("2026-01-31");
  });
});
