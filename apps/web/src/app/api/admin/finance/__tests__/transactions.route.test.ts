import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireAdminSection = vi.fn();
const mockGetSupabaseAdmin = vi.fn();
const mockResolveAdminApiTenantId = vi.fn();
const mockFetchFinanceLedgerExportRowsForTenant = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireAdminSection: (...args: unknown[]) => mockRequireAdminSection(...args),
  };
});

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
    fetchFinanceLedgerExportRowsForTenant: (...args: unknown[]) =>
      mockFetchFinanceLedgerExportRowsForTenant(...args),
  };
});

function makeRows(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `tx-${i + 1}`,
    transaction_type: i % 2 === 0 ? "payment" : "refund",
    amount: 100,
    fees: 2,
    commission: 10,
    net: 88,
    created_at: "2026-07-01T10:00:00.000Z",
    booking_id: i % 3 === 0 ? `booking-${i}` : null,
    booking: i % 3 === 0 ? { booking_number: `B-${i}` } : null,
  }));
}

describe("GET /api/admin/finance/transactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockRequireAdminSection.mockResolvedValue({ user: { id: "admin-1", role: "superadmin" } });
    mockResolveAdminApiTenantId.mockResolvedValue("tenant-1");
    mockGetSupabaseAdmin.mockReturnValue({});
    mockFetchFinanceLedgerExportRowsForTenant.mockResolvedValue(makeRows(75));
  });

  it("paginates in-memory export rows", async () => {
    const { GET } = await import("../transactions/route");
    const res = await GET(
      new NextRequest("http://localhost/api/admin/finance/transactions?page=2&limit=50"),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(25);
    expect(body.meta).toMatchObject({ page: 2, limit: 50, total: 75, has_more: false });
  });

  it("passes refund type filter to ledger export fetch", async () => {
    const { GET } = await import("../transactions/route");
    await GET(
      new NextRequest(
        "http://localhost/api/admin/finance/transactions?type=refund&start_date=2026-07-01&end_date=2026-07-31",
      ),
    );

    expect(mockFetchFinanceLedgerExportRowsForTenant).toHaveBeenCalledWith(
      expect.anything(),
      "tenant-1",
      expect.objectContaining({
        start: "2026-07-01",
        end: "2026-07-31",
      }),
      expect.objectContaining({
        transactionTypes: ["refund"],
      }),
    );
  });

  it("passes provider_id restriction when supplied", async () => {
    const { GET } = await import("../transactions/route");
    await GET(
      new NextRequest("http://localhost/api/admin/finance/transactions?provider_id=prov-42"),
    );

    expect(mockFetchFinanceLedgerExportRowsForTenant).toHaveBeenCalledWith(
      expect.anything(),
      "tenant-1",
      expect.any(Object),
      expect.objectContaining({
        restrictProviderIds: ["prov-42"],
      }),
    );
  });
});
