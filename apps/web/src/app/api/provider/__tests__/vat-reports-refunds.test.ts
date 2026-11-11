import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockRequireAnyPermission = vi.fn();
const mockGetProviderIdForUser = vi.fn();
const mockGetSupabaseServer = vi.fn();

vi.mock("@/lib/auth/requirePermission", () => ({
  requireAnyPermission: (...args: unknown[]) => mockRequireAnyPermission(...args),
}));

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    getProviderIdForUser: (...args: unknown[]) => mockGetProviderIdForUser(...args),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

vi.mock("@/lib/tenant/resolve-tenant-from-db", () => ({
  resolveTenantIdWithZaFallback: vi.fn().mockResolvedValue("tenant-1"),
}));

vi.mock("@/lib/regions/config", () => ({
  getTenantRegionConfig: vi.fn().mockResolvedValue({ defaultCurrency: "ZAR" }),
}));

vi.mock("@/lib/locale/tenant-locale", () => ({
  getTenantLocaleTagFromRegionConfig: vi.fn().mockReturnValue("en-ZA"),
}));

function makeVatServerClient(vatTxRows: unknown[]) {
  return {
    from: vi.fn((table: string) => {
      if (table === "providers") {
        const chain: Record<string, unknown> = {};
        chain.select = vi.fn(() => chain);
        chain.eq = vi.fn(() => chain);
        chain.maybeSingle = vi.fn(() =>
          Promise.resolve({
            data: {
              is_vat_registered: true,
              vat_number: "4123456789",
              tenant_id: "tenant-1",
              timezone: "Africa/Johannesburg",
            },
            error: null,
          }),
        );
        return chain;
      }
      if (table === "finance_transactions") {
        // F2-24: honour the selected column list like PostgREST does, so a
        // column the route filters on but forgot to select is actually absent.
        let selectedColumns: string[] | null = null;
        const chain: Record<string, unknown> = {};
        chain.select = vi.fn((cols?: string) => {
          selectedColumns =
            typeof cols === "string" && cols.trim() !== "*"
              ? cols.split(",").map((c) => c.trim()).filter(Boolean)
              : null;
          return chain;
        });
        chain.eq = vi.fn(() => chain);
        chain.in = vi.fn(() => chain);
        chain.gte = vi.fn(() => chain);
        chain.lte = vi.fn(() => chain);
        chain.order = vi.fn(() => chain);
        chain.range = vi.fn(() => {
          const projected = selectedColumns
            ? (vatTxRows as Array<Record<string, unknown>>).map((row) =>
                Object.fromEntries(selectedColumns!.map((c) => [c, row[c]])),
              )
            : vatTxRows;
          return Promise.resolve({ data: projected, error: null });
        });
        return chain;
      }
      if (table === "vat_remittance_reminders") {
        const chain: Record<string, unknown> = {};
        chain.select = vi.fn(() => chain);
        chain.eq = vi.fn(() => chain);
        chain.gte = vi.fn(() => chain);
        chain.lte = vi.fn(() => chain);
        chain.order = vi.fn(() => Promise.resolve({ data: [], error: null }));
        return chain;
      }
      if (table === "bookings") {
        const chain: Record<string, unknown> = {};
        chain.select = vi.fn(() => chain);
        chain.in = vi.fn(() => Promise.resolve({ data: [], error: null }));
        return chain;
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  };
}

describe("GET /api/provider/finance/vat-reports — tax refunds reduce VAT collected", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAnyPermission.mockResolvedValue({
      authorized: true,
      user: { id: "user-1", role: "provider_owner" },
    });
    mockGetProviderIdForUser.mockResolvedValue("provider-1");
  });

  it("subtracts refund rows with refund_component=tax", async () => {
    const year = 2026;
    const vatTxRows = [
      {
        id: "t1",
        transaction_type: "tax",
        amount: 15,
        net: 0,
        created_at: "2026-01-10T12:00:00.000Z",
        booking_id: null,
        description: "Tax for booking",
        metadata: { vat_source: "booking" },
        refund_component: null,
      },
      {
        id: "r1",
        transaction_type: "refund",
        refund_component: "tax",
        amount: 5,
        net: 0,
        created_at: "2026-01-20T12:00:00.000Z",
        booking_id: null,
        description: "Refund tax",
        metadata: {},
      },
    ];
    mockGetSupabaseServer.mockResolvedValue(makeVatServerClient(vatTxRows));

    const { GET } = await import("../finance/vat-reports/route");
    const res = await GET(new NextRequest(`http://localhost/api/provider/finance/vat-reports?year=${year}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.error).toBeNull();
    expect(Array.isArray(body.data.reports)).toBe(true);

    const janFeb = body.data.reports.find((r: any) => r.period_start === "2026-01-01");
    expect(janFeb).toBeTruthy();
    expect(janFeb.vat_collected).toBe(10);

    const txn = (janFeb.transactions ?? []).find((t: any) => t.id === "r1");
    expect(txn.amount).toBe(-5);
  });

  it("F2-24: tax rows produce a non-zero vat_collected (transaction_type must be selected)", async () => {
    const vatTxRows = [
      {
        id: "t1",
        transaction_type: "tax",
        amount: 30,
        net: 0,
        created_at: "2026-03-05T12:00:00.000Z",
        booking_id: null,
        description: "Tax for booking",
        metadata: { vat_source: "booking" },
        refund_component: null,
      },
      {
        id: "t2",
        transaction_type: "tax",
        amount: 12.5,
        net: 0,
        created_at: "2026-04-15T12:00:00.000Z",
        booking_id: null,
        description: "Tax for booking",
        metadata: { vat_source: "booking" },
        refund_component: null,
      },
    ];
    mockGetSupabaseServer.mockResolvedValue(makeVatServerClient(vatTxRows));

    const { GET } = await import("../finance/vat-reports/route");
    const res = await GET(new NextRequest(`http://localhost/api/provider/finance/vat-reports?year=2026`));
    expect(res.status).toBe(200);
    const body = await res.json();

    const marApr = body.data.reports.find((r: any) => r.period_start === "2026-03-01");
    expect(marApr).toBeTruthy();
    expect(marApr.vat_collected).toBe(42.5);
    expect(marApr.transaction_count).toBe(2);
  });
});

