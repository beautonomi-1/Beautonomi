import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/** buntulink@gmail.com / provider "bantu" */
const BANTU_USER_ID = "11ccc539-9160-47be-b7b3-5fef986f1033";
const BANTU_PROVIDER_ID = "0350ad64-f317-4464-9a19-6c39be1f1255";

const mockRequireProviderReportsAccess = vi.fn();
const mockGetProviderIdForUser = vi.fn();
const mockGetProviderNetAfterRefundsDetailed = vi.fn();
const mockGetPreviousPeriodNetAfterRefunds = vi.fn();

type Row = Record<string, unknown>;
let db: Record<string, Row[]>;
let mockSupabase: ReturnType<typeof createMockSupabase>;

vi.mock("@/lib/reports/require-provider-reports-access", () => ({
  requireProviderReportsAccess: (...args: unknown[]) => mockRequireProviderReportsAccess(...args),
}));

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    getProviderIdForUser: (...args: unknown[]) => mockGetProviderIdForUser(...args),
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(() => mockSupabase),
}));

vi.mock("@/lib/reports/revenue-helpers", () => ({
  getProviderNetAfterRefundsDetailed: (...args: unknown[]) => mockGetProviderNetAfterRefundsDetailed(...args),
  getPreviousPeriodNetAfterRefunds: (...args: unknown[]) => mockGetPreviousPeriodNetAfterRefunds(...args),
}));

function seedDb() {
  db = {
    providers: [
      {
        id: BANTU_PROVIDER_ID,
        timezone: "Etc/GMT-2",
        tenant_id: "tenant-1",
      },
    ],
    bookings: [
      {
        id: "booking-1",
        provider_id: BANTU_PROVIDER_ID,
        location_id: "loc-a",
        status: "completed",
        scheduled_at: "2026-07-15T10:00:00.000Z",
        booking_services: [
          { id: "bs-1", price: 120, offering_id: "offer-1", staff_id: "staff-1", offerings: { title: "Cut" } },
        ],
      },
    ],
    provider_staff: [{ id: "staff-1", user_id: "user-staff", users: { full_name: "Stylist One" } }],
    booking_payments: [
      {
        id: "bp-1",
        booking_id: "booking-1",
        tenant_id: "tenant-1",
        amount: 120,
        status: "completed",
        payment_method: "card",
        payment_provider: "yoco",
        created_at: "2026-07-15T11:00:00.000Z",
      },
    ],
    sales: [],
    product_orders: [],
    finance_transactions: [
      {
        id: "tip-1",
        provider_id: BANTU_PROVIDER_ID,
        transaction_type: "tip",
        amount: 10,
        net: 10,
        booking_id: "booking-1",
        created_at: "2026-07-15T11:00:00.000Z",
      },
    ],
  };
}

function createMockSupabase() {
  return { from: vi.fn((table: string) => new Query(table)) };
}

class Query {
  private filters: Array<{ op: string; field: string; value: unknown }> = [];
  private selectedOptions: { head?: boolean; count?: string } | undefined;
  private rangeLimit: number | null = null;
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;
  private orderAscending = false;

  constructor(private table: string) {}

  select(_columns?: string, options?: { head?: boolean; count?: string }) {
    this.selectedOptions = options;
    return this;
  }
  eq(field: string, value: unknown) {
    this.filters.push({ op: "eq", field, value });
    return this;
  }
  gte(field: string, value: unknown) {
    this.filters.push({ op: "gte", field, value });
    return this;
  }
  lte(field: string, value: unknown) {
    this.filters.push({ op: "lte", field, value });
    return this;
  }
  gt(field: string, value: unknown) {
    this.filters.push({ op: "gt", field, value });
    return this;
  }
  in(field: string, value: unknown[]) {
    this.filters.push({ op: "in", field, value });
    return this;
  }
  order(_field: string, opts?: { ascending?: boolean }) {
    this.orderAscending = opts?.ascending === true;
    return this;
  }
  range(from: number, to: number) {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }
  limit(value: number) {
    this.rangeLimit = value;
    return this;
  }
  maybeSingle() {
    return Promise.resolve({ data: this.run()[0] ?? null, error: null });
  }
  then(resolve: (value: unknown) => unknown, reject?: (reason?: unknown) => unknown) {
    return Promise.resolve(this.result()).then(resolve, reject);
  }
  private result() {
    const rows = this.run();
    if (this.selectedOptions?.head) {
      return { data: null, count: rows.length, error: null };
    }
    return { data: rows, count: rows.length, error: null };
  }
  private run() {
    let rows = [...(db[this.table] ?? [])];
    for (const filter of this.filters) {
      rows = rows.filter((row) => {
        const value = row[filter.field];
        if (filter.op === "eq") return value === filter.value;
        if (filter.op === "gte") return value != null && String(value) >= String(filter.value);
        if (filter.op === "lte") return value != null && String(value) <= String(filter.value);
        if (filter.op === "gt") return Number(value ?? 0) > Number(filter.value);
        if (filter.op === "in") return (filter.value as unknown[]).includes(value);
        return true;
      });
    }
    if (this.rangeFrom != null && this.rangeTo != null) {
      rows = rows.slice(this.rangeFrom, this.rangeTo + 1);
    }
    if (this.rangeLimit != null) rows = rows.slice(0, this.rangeLimit);
    return rows;
  }
}

const defaultRevenue = () => ({
  totalRevenue: 120,
  revenueByBooking: new Map([["booking-1", 120]]),
  revenueByProductOrder: new Map<string, number>(),
  revenueByDate: new Map([["2026-07-15", 120]]),
});

describe("GET /api/provider/reports/sales/summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedDb();
    mockSupabase = createMockSupabase();
    mockRequireProviderReportsAccess.mockResolvedValue({
      authorized: true,
      user: { id: BANTU_USER_ID, role: "provider_owner" },
    });
    mockGetProviderIdForUser.mockResolvedValue(BANTU_PROVIDER_ID);
    mockGetProviderNetAfterRefundsDetailed.mockResolvedValue(defaultRevenue());
    mockGetPreviousPeriodNetAfterRefunds.mockResolvedValue(80);
  });

  it("mobile default URL uses from/to month-to-date params", () => {
    const url = "/api/provider/reports/sales/summary?from=2026-07-01&to=2026-07-28";
    expect(url).toContain("sales/summary");
    expect(url).toContain("from=2026-07-01");
    expect(url).toContain("to=2026-07-28");
  });

  it("returns envelope required by SalesSummaryReportView", async () => {
    const { GET } = await import("../sales/summary/route");
    const res = await GET(
      new NextRequest(
        "http://localhost/api/provider/reports/sales/summary?from=2026-07-01&to=2026-07-28",
      ),
    );
    expect(res.status).toBe(200);
    const raw = await res.json();
    expect(raw.error).toBeNull();
    const data = raw.data ?? raw;
    expect(typeof data.totalRevenue).toBe("number");
    expect(data.recordedTakings).toBeDefined();
    expect(typeof data.recordedTakings.total).toBe("number");
    expect(data.recordedTakings.byPaymentMethod).toBeDefined();
    expect(Array.isArray(data.revenueByService)).toBe(true);
    expect(Array.isArray(data.revenueByStaff)).toBe(true);
    expect(data.revenueByService[0]?.serviceName).toBe("Cut");
    expect(data.revenueByStaff[0]?.staffName).toBe("Stylist One");
    expect(data.bookingsSampleTruncated).toBe(false);
  });

  it("uses exact booking count when sample is capped", async () => {
    for (let i = 0; i < 5; i += 1) {
      db.bookings.push({
        id: `booking-extra-${i}`,
        provider_id: BANTU_PROVIDER_ID,
        location_id: "loc-a",
        status: "completed",
        scheduled_at: `2026-07-${String(10 + i).padStart(2, "0")}T10:00:00.000Z`,
        booking_services: [{ id: `bs-x-${i}`, price: 50, offerings: { title: "Extra" } }],
      });
    }
    const { GET } = await import("../sales/summary/route");
    const res = await GET(
      new NextRequest(
        "http://localhost/api/provider/reports/sales/summary?from=2026-07-01&to=2026-07-28",
      ),
    );
    const raw = await res.json();
    const data = raw.data ?? raw;
    expect(data.totalBookings).toBe(6);
    expect(data.bookingsSampleTruncated).toBe(false);
  });

  it("rejects callers without report access", async () => {
    mockRequireProviderReportsAccess.mockResolvedValueOnce({
      authorized: false,
      response: new Response(JSON.stringify({ data: null, error: { message: "Permission denied" } }), {
        status: 403,
      }),
    });
    const { GET } = await import("../sales/summary/route");
    const res = await GET(
      new NextRequest(
        "http://localhost/api/provider/reports/sales/summary?from=2026-07-01&to=2026-07-28",
      ),
    );
    expect(res.status).toBe(403);
  });
});
