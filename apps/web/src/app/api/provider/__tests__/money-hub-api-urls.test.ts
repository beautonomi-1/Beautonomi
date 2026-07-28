import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { providerTransactionsPeriodStart } from "@/lib/provider/provider-ledger-transaction-view";
import { resolveProviderFinanceRangeBounds } from "@/lib/dates/provider-finance-range";
import { formatDateYmd } from "@/lib/dates/provider-tz";
import { startOfMonth } from "date-fns";
import { toZonedTime } from "date-fns-tz";

/** buntulink@gmail.com / provider "bantu" — from production SQL audit */
const BANTU_USER_ID = "11ccc539-9160-47be-b7b3-5fef986f1033";
const BANTU_PROVIDER_ID = "0350ad64-f317-4464-9a19-6c39be1f1255";
const BANTU_TIMEZONE = "Etc/GMT-2";

const mockRequireAnyPermission = vi.fn();
const mockGetProviderIdForUser = vi.fn();
const mockGetSupabaseAdmin = vi.fn();

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

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: (...args: unknown[]) => mockGetSupabaseAdmin(...args),
}));

/** Representative ledger rows from bantu July 2026 (subset of SQL audit). */
const BANTU_LEDGER_ROWS = [
  {
    id: "3b46eb2d-1dc6-4b0b-9cfa-ef36129097e6",
    transaction_type: "provider_earnings",
    amount: 60,
    net: 60,
    created_at: "2026-07-27T21:46:27.144496+00:00",
    description: "Provider earnings for booking BTN-20260727-214626-5F5CDFDF",
    booking_id: "6c777368-bcdc-4aa5-ab37-90ae7290179f",
    product_order_id: null,
    metadata: null,
    refund_component: null,
    currency: "ZAR",
    source_payment_id: null,
  },
  {
    id: "376fe21a-0a5a-455e-a4c9-6a0440e979fa",
    transaction_type: "refund",
    amount: 15,
    net: -15,
    created_at: "2026-07-26T20:55:09.143+00:00",
    description: "Refund platform_fee leg — hidden in UI",
    booking_id: null,
    product_order_id: "427e3e31-a2c7-48ca-8249-ca871ab9cc07",
    metadata: null,
    refund_component: "platform_fee",
    currency: "ZAR",
    source_payment_id: null,
  },
  {
    id: "b63cdd05-8697-4954-a041-660d48a64e9f",
    transaction_type: "refund",
    amount: 150,
    net: -150,
    created_at: "2026-07-26T20:55:09.143+00:00",
    description: "Refund provider_earnings leg — shown in UI",
    booking_id: null,
    product_order_id: "427e3e31-a2c7-48ca-8249-ca871ab9cc07",
    metadata: null,
    refund_component: "provider_earnings",
    currency: "ZAR",
    source_payment_id: null,
  },
  {
    id: "4b19dea7-31a5-4afd-a6dd-d3bca28e7370",
    transaction_type: "tip",
    amount: 6,
    net: 6,
    created_at: "2026-07-27T21:46:27.144496+00:00",
    description: "Tip for booking",
    booking_id: "6c777368-bcdc-4aa5-ab37-90ae7290179f",
    product_order_id: null,
    metadata: null,
    refund_component: null,
    currency: "ZAR",
    source_payment_id: null,
  },
];

function makeFinanceTxnChain(rows: typeof BANTU_LEDGER_ROWS) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.gte = vi.fn(() => chain);
  chain.in = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.range = vi.fn(() => Promise.resolve({ data: rows, error: null }));
  return chain;
}

function makeAdminClient(financeRows: typeof BANTU_LEDGER_ROWS) {
  const financeChain = makeFinanceTxnChain(financeRows);
  return {
    from: vi.fn((table: string) => {
      if (table === "providers") {
        const p: Record<string, unknown> = {};
        p.select = vi.fn(() => p);
        p.eq = vi.fn(() => p);
        p.maybeSingle = vi.fn(() =>
          Promise.resolve({ data: { timezone: BANTU_TIMEZONE }, error: null }),
        );
        return p;
      }
      if (table === "finance_transactions") return financeChain;
      if (table === "bookings" || table === "users" || table === "booking_payments") {
        const q: Record<string, unknown> = {};
        q.select = vi.fn(() => q);
        q.eq = vi.fn(() => q);
        q.in = vi.fn(() => Promise.resolve({ data: [], error: null }));
        return q;
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  };
}

describe("Money hub API URLs — bantu provider fixture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAnyPermission.mockResolvedValue({
      authorized: true,
      user: { id: BANTU_USER_ID, role: "provider_owner" },
    });
    mockGetProviderIdForUser.mockResolvedValue(BANTU_PROVIDER_ID);
    mockGetSupabaseAdmin.mockReturnValue(makeAdminClient(BANTU_LEDGER_ROWS));
  });

  it("default Ledger URL period=month includes July 2026 rows in Etc/GMT-2", () => {
    const monthStart = providerTransactionsPeriodStart("month", BANTU_TIMEZONE);
    const oldestBantuRow = new Date("2026-07-02T18:23:15.460Z");
    expect(monthStart.getTime()).toBeLessThanOrEqual(oldestBantuRow.getTime());
  });

  it("default Sales URL date_from/date_to matches mobile MoneyRangeChips month", () => {
    const now = new Date("2026-07-28T12:00:00.000Z");
    const zNow = toZonedTime(now, BANTU_TIMEZONE);
    const from = formatDateYmd(startOfMonth(zNow), BANTU_TIMEZONE);
    const to = formatDateYmd(now, BANTU_TIMEZONE);
    expect(from).toBe("2026-07-01");
    expect(to).toBe("2026-07-28");
    const url = `/api/provider/sales-history?page=1&limit=25&date_from=${from}&date_to=${to}`;
    expect(url).toBe(
      "/api/provider/sales-history?page=1&limit=25&date_from=2026-07-01&date_to=2026-07-28",
    );
  });

  it("default Overview URL range=month resolves inside bantu ledger window", () => {
    const now = new Date("2026-07-28T12:00:00.000Z");
    const bounds = resolveProviderFinanceRangeBounds("month", BANTU_TIMEZONE, now);
    const oldestBantuRow = new Date("2026-07-02T18:23:15.460Z");
    expect(bounds.startDate.getTime()).toBeLessThanOrEqual(oldestBantuRow.getTime());
    const url = `/api/provider/finance?range=month&tx_limit=50`;
    expect(url).toBe("/api/provider/finance?range=month&tx_limit=50");
  });

  it("GET /api/provider/transactions returns non-empty envelope for bantu ledger fixture", async () => {
    const { GET } = await import("../transactions/route");
    const req = new NextRequest(
      "http://localhost/api/provider/transactions?period=month&limit=50&offset=0",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      data: {
        transactions: Array<{ id: string; type: string }>;
        summary: { row_count: number };
        list_total: number;
      };
      error: null;
    };

    expect(body.error).toBeNull();
    expect(body.data.transactions.length).toBeGreaterThan(0);
    expect(body.data.list_total).toBeGreaterThan(0);
    expect(body.data.summary.row_count).toBe(body.data.list_total);
    // platform_fee refund leg must be dropped; provider_earnings refund kept
    expect(body.data.transactions.some((t) => t.id === "b63cdd05-8697-4954-a041-660d48a64e9f")).toBe(
      true,
    );
    expect(body.data.transactions.some((t) => t.id === "376fe21a-0a5a-455e-a4c9-6a0440e979fa")).toBe(
      false,
    );
  });

  it("GET /api/provider/transactions rejects unauthenticated callers", async () => {
    mockRequireAnyPermission.mockResolvedValueOnce({
      authorized: false,
      response: new Response(JSON.stringify({ data: null, error: { message: "Authentication required" } }), {
        status: 401,
      }),
    });
    const { GET } = await import("../transactions/route");
    const res = await GET(
      new NextRequest("http://localhost/api/provider/transactions?period=month&limit=50&offset=0"),
    );
    expect(res.status).toBe(401);
  });

  it("mobile client unwraps successResponse envelope correctly for transactions", async () => {
    const { GET } = await import("../transactions/route");
    const res = await GET(
      new NextRequest("http://localhost/api/provider/transactions?period=month&limit=50&offset=0"),
    );
    const raw = await res.json();
    // packages/api client: if parsed has `data` key, use parsed.data
    const txnPayload = raw.data ?? raw;
    expect(Array.isArray(txnPayload.transactions)).toBe(true);
    expect(txnPayload.transactions.length).toBeGreaterThan(0);
  });
});
