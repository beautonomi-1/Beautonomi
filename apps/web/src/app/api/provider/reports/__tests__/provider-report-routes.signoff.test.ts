import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET as cancellationsGET } from "../bookings/cancellations/route";
import { GET as bookingSummaryGET } from "../bookings/summary/route";
import { GET as endOfDayGET } from "../end-of-day/route";
import { GET as refundsGET } from "../payments/refunds/route";
import { GET as paymentsSummaryGET } from "../payments/summary/route";
import { GET as payoutsGET } from "../payments/payouts/route";
import { GET as revenueGET } from "../revenue/route";

type Row = Record<string, any>;

const providerId = "provider-1";
const user = { id: "user-1" };
let db: Record<string, Row[]>;
let mockSupabase: ReturnType<typeof createMockSupabase>;

const getProviderRevenueMock = vi.fn();
const getPreviousPeriodRevenueMock = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => mockSupabase),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(() => mockSupabase),
}));

vi.mock("@/lib/supabase/api-helpers", () => ({
  requireRoleInApi: vi.fn(async () => ({ user })),
  getProviderIdForUser: vi.fn(async () => providerId),
  successResponse: vi.fn((data) => Response.json(data)),
  notFoundResponse: vi.fn((message = "Not found") => Response.json({ error: message }, { status: 404 })),
  errorResponse: vi.fn((message: string, _code?: string, status = 400) =>
    Response.json({ error: message }, { status }),
  ),
  handleApiError: vi.fn((error: unknown) =>
    Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 }),
  ),
}));

vi.mock("@/lib/reports/revenue-helpers", () => ({
  getProviderRevenue: (...args: unknown[]) => getProviderRevenueMock(...args),
  getPreviousPeriodRevenue: (...args: unknown[]) => getPreviousPeriodRevenueMock(...args),
}));

function request(path: string) {
  return { nextUrl: new URL(`https://example.test${path}`) } as any;
}

async function json(response: Response) {
  expect(response.status).toBe(200);
  return response.json();
}

function seedDb() {
  db = {
    providers: [{ id: providerId, timezone: "Africa/Johannesburg", tenant_id: "tenant-1" }],
    provider_locations: [{ id: "loc-a", provider_id: providerId, is_active: true, location_type: "salon", is_primary: true }],
    bookings: [
      {
        id: "booking-loc-a",
        provider_id: providerId,
        location_id: "loc-a",
        status: "completed",
        scheduled_at: "2026-05-01T22:30:00.000Z",
        total_amount: 120,
        total_paid: 120,
        wallet_amount: 0,
        payment_status: "paid",
        payment_provider: "yoco",
        booking_source: "online",
        customer_id: "client-1",
        booking_services: [{ price: 120, offerings: { title: "Cut" } }],
      },
      {
        id: "booking-loc-b",
        provider_id: providerId,
        location_id: "loc-b",
        status: "completed",
        scheduled_at: "2026-05-02T08:00:00.000Z",
        total_amount: 200,
        total_paid: 200,
        wallet_amount: 0,
        payment_status: "paid",
        payment_provider: "cash",
        booking_source: "walk_in",
        customer_id: "client-2",
        booking_services: [{ price: 200, offerings: { title: "Colour" } }],
      },
      {
        id: "wallet-booking",
        provider_id: providerId,
        location_id: "loc-a",
        status: "completed",
        scheduled_at: "2026-05-02T09:00:00.000Z",
        total_amount: 10,
        total_paid: 0,
        wallet_amount: 10,
        payment_status: "paid",
      },
    ],
    users: [{ id: "client-1", full_name: "Client One", email: "client@example.test" }],
    product_orders: [
      {
        id: "order-loc-a",
        provider_id: providerId,
        tenant_id: "tenant-1",
        total_amount: 40,
        payment_method: "cash",
        payment_status: "paid",
        order_source: "walk_in",
        paid_at: "2026-05-02T10:00:00.000Z",
        created_at: "2026-05-02T10:00:00.000Z",
        fulfillment_type: "pickup",
        collection_location_id: "loc-a",
      },
      {
        id: "order-loc-b",
        provider_id: providerId,
        tenant_id: "tenant-1",
        total_amount: 60,
        payment_method: "cash",
        payment_status: "paid",
        order_source: "walk_in",
        paid_at: "2026-05-02T10:30:00.000Z",
        created_at: "2026-05-02T10:30:00.000Z",
        fulfillment_type: "pickup",
        collection_location_id: "loc-b",
      },
    ],
    booking_payments: [
      {
        id: "bp-1",
        booking_id: "booking-loc-a",
        tenant_id: "tenant-1",
        amount: 100,
        status: "completed",
        payment_method: "card",
        payment_provider: "yoco",
        created_at: "2026-05-02T07:00:00.000Z",
      },
      {
        id: "bp-2",
        booking_id: "booking-loc-b",
        tenant_id: "tenant-1",
        amount: 200,
        status: "completed",
        payment_method: "cash",
        created_at: "2026-05-02T07:00:00.000Z",
      },
    ],
    payment_transactions: [
      {
        provider: "yoco",
        amount: 100,
        net_amount: 90,
        status: "success",
        booking_id: "booking-loc-a",
        metadata: {},
      },
    ],
    sales: [],
    provider_staff: [],
    finance_transactions: [
      {
        id: "payment-linked-booking",
        provider_id: providerId,
        transaction_type: "payment",
        amount: 100,
        net: 100,
        booking_id: "booking-loc-a",
        product_order_id: null,
        created_at: "2026-05-01T22:30:00.000Z",
        metadata: { payment_method: "card" },
      },
      {
        id: "gift-card-unlinked",
        provider_id: providerId,
        transaction_type: "gift_card_payment",
        amount: 25,
        net: 25,
        booking_id: null,
        product_order_id: null,
        created_at: "2026-05-02T08:30:00.000Z",
        metadata: {},
      },
      {
        id: "refund-booking",
        provider_id: providerId,
        transaction_type: "refund",
        amount: 20,
        net: -20,
        booking_id: "booking-loc-a",
        product_order_id: null,
        created_at: "2026-05-02T08:00:00.000Z",
        metadata: { payment_method: "card" },
      },
      {
        id: "refund-product-order",
        provider_id: providerId,
        transaction_type: "refund",
        amount: 30,
        net: -30,
        booking_id: null,
        product_order_id: "order-loc-a",
        created_at: "2026-05-02T08:15:00.000Z",
        metadata: { payment_method: "cash" },
      },
      {
        id: "refund-unlinked",
        provider_id: providerId,
        transaction_type: "refund",
        amount: 5,
        net: -5,
        booking_id: null,
        product_order_id: null,
        created_at: "2026-05-02T08:20:00.000Z",
        metadata: {},
      },
      {
        id: "tip-linked",
        provider_id: providerId,
        transaction_type: "tip",
        amount: 5,
        net: 5,
        booking_id: "booking-loc-a",
        product_order_id: null,
        created_at: "2026-05-02T08:30:00.000Z",
      },
      {
        id: "tip-unlinked",
        provider_id: providerId,
        transaction_type: "tip",
        amount: 7,
        net: 7,
        booking_id: null,
        product_order_id: null,
        created_at: "2026-05-02T08:45:00.000Z",
      },
      {
        id: "cancel-fee-order",
        provider_id: providerId,
        transaction_type: "cancellation_fee",
        amount: 8,
        net: 8,
        booking_id: null,
        product_order_id: "order-loc-a",
        created_at: "2026-05-02T08:50:00.000Z",
      },
      {
        id: "platform-fee-booking",
        provider_id: providerId,
        transaction_type: "platform_fee",
        amount: 10,
        net: 10,
        booking_id: "booking-loc-a",
        product_order_id: null,
        created_at: "2026-05-02T08:55:00.000Z",
      },
      {
        id: "platform-fee-unlinked",
        provider_id: providerId,
        transaction_type: "platform_fee",
        amount: 3,
        net: 3,
        booking_id: null,
        product_order_id: null,
        created_at: "2026-05-02T09:00:00.000Z",
      },
    ],
  };
}

function createMockSupabase() {
  return {
    from: vi.fn((table: string) => new Query(table)),
  };
}

class Query {
  private filters: Array<{ op: string; field: string; value: any }> = [];
  private selectedOptions: any;
  private rangeLimit: number | null = null;
  private orderField: string | null = null;

  constructor(private table: string) {}

  select(_columns?: string, options?: any) {
    this.selectedOptions = options;
    return this;
  }
  eq(field: string, value: any) {
    this.filters.push({ op: "eq", field, value });
    return this;
  }
  gte(field: string, value: any) {
    this.filters.push({ op: "gte", field, value });
    return this;
  }
  lte(field: string, value: any) {
    this.filters.push({ op: "lte", field, value });
    return this;
  }
  gt(field: string, value: any) {
    this.filters.push({ op: "gt", field, value });
    return this;
  }
  in(field: string, value: any[]) {
    this.filters.push({ op: "in", field, value });
    return this;
  }
  not(field: string, _op: string, value: any) {
    this.filters.push({ op: "not", field, value });
    return this;
  }
  or() {
    return this;
  }
  order(field: string) {
    this.orderField = field;
    return this;
  }
  limit(value: number) {
    this.rangeLimit = value;
    return this;
  }
  maybeSingle() {
    const data = this.run()[0] ?? null;
    return Promise.resolve({ data, error: null });
  }
  then(resolve: (value: any) => unknown, reject?: (reason?: any) => unknown) {
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
      rows = rows.filter((row) => matches(row, filter));
    }
    if (this.orderField) {
      rows.sort((a, b) => String(b[this.orderField!] ?? "").localeCompare(String(a[this.orderField!] ?? "")));
    }
    if (this.rangeLimit != null) rows = rows.slice(0, this.rangeLimit);
    return rows;
  }
}

function matches(row: Row, filter: { op: string; field: string; value: any }) {
  const value = row[filter.field];
  if (filter.op === "eq") return value === filter.value;
  if (filter.op === "gte") return value == null ? false : String(value) >= String(filter.value);
  if (filter.op === "lte") return value == null ? false : String(value) <= String(filter.value);
  if (filter.op === "gt") return Number(value ?? 0) > Number(filter.value);
  if (filter.op === "in") return filter.value.includes(value);
  if (filter.op === "not") {
    if (filter.value === null) return value !== null && value !== undefined;
    if (typeof filter.value === "string" && filter.value.startsWith("(")) {
      const blocked = filter.value.slice(1, -1).split(",");
      return !blocked.includes(String(value));
    }
    return value !== filter.value;
  }
  return true;
}

describe("provider report routes sign-off coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedDb();
    mockSupabase = createMockSupabase();
    getProviderRevenueMock.mockResolvedValue({
      totalRevenue: 90,
      revenueByBooking: new Map([["booking-loc-a", 90]]),
      revenueByProductOrder: new Map([["order-loc-a", 32]]),
      revenueByDate: new Map([["2026-05-02", 90]]),
    });
    getPreviousPeriodRevenueMock.mockResolvedValue(50);
  });

  it("bookings summary uses provider timezone day keys and location-filtered bookings", async () => {
    const data = await json(
      await bookingSummaryGET(
        request("/api/provider/reports/bookings/summary?from=2026-05-02&to=2026-05-02&location_id=loc-a"),
      ),
    );

    expect(data.totalBookings).toBe(2);
    expect(data.dailyBookings).toEqual([{ date: "2026-05-02", count: 2, revenue: 90 }]);
    expect(getProviderRevenueMock).toHaveBeenCalledWith(
      expect.anything(),
      providerId,
      expect.any(Date),
      expect.any(Date),
      "loc-a",
      expect.objectContaining({ timezone: "Africa/Johannesburg" }),
    );
  });

  it("refunds include booking and product-order linked rows, while surfacing unattributed branch exclusions", async () => {
    const data = await json(
      await refundsGET(
        request("/api/provider/reports/payments/refunds?from=2026-05-02&to=2026-05-02&location_id=loc-a"),
      ),
    );

    expect(data.totalRefunds).toBe(2);
    expect(data.totalRefundAmount).toBe(50);
    expect(data.dailyBreakdown).toEqual([{ date: "2026-05-02", count: 2, amount: 50 }]);
    expect(data.locationAttribution).toMatchObject({
      scopedByLocation: true,
      excludedUnattributedRows: 1,
    });
  });

  it("cancellations uses provider timezone day keys and exact branch counts", async () => {
    db.bookings.push({
      id: "cancelled-loc-a",
      provider_id: providerId,
      location_id: "loc-a",
      status: "cancelled",
      scheduled_at: "2026-05-02T08:30:00.000Z",
      cancelled_at: "2026-05-01T22:15:00.000Z",
      cancellation_reason: "client request",
      customer_id: "client-1",
    });

    const data = await json(
      await cancellationsGET(
        request("/api/provider/reports/bookings/cancellations?from=2026-05-02&to=2026-05-02&location_id=loc-a"),
      ),
    );

    expect(data.totalCancelled).toBe(1);
    expect(data.totalBookings).toBe(3);
    expect(data.dailyBreakdown).toEqual([{ date: "2026-05-02", count: 1 }]);
  });

  it("end-of-day reconciles booking payments, wallet bookings, walk-in product orders, and scoped ledger extras", async () => {
    const data = await json(
      await endOfDayGET(request("/api/provider/reports/end-of-day?date=2026-05-02&location_id=loc-a")),
    );

    expect(data.bookingPaymentsTotal).toBe(100);
    expect(data.walletTotal).toBe(10);
    expect(data.salesTotal).toBe(40);
    expect(data.tipsTotal).toBe(5);
    expect(data.cancellationFeesTotal).toBe(8);
    expect(data.total).toBe(163);
    expect(data.byPaymentMethod).toMatchObject({ card: 100, wallet: 10, cash: 40 });
    expect(data.locationAttribution.excludedUnattributedRows).toBe(1);
  });

  it("payment summary exposes branch-level ledger attribution limits for provider-level rows", async () => {
    const data = await json(
      await paymentsSummaryGET(
        request("/api/provider/reports/payments/summary?from=2026-05-02&to=2026-05-02&location_id=loc-a"),
      ),
    );

    expect(data.settledLedgerAmount).toBe(100);
    expect(data.collectionBreakdown.gift_card).toBe(0);
    expect(data.locationAttribution.excludedUnattributedRows).toBeGreaterThan(0);
    expect(data.basis.location).toContain("unattributed");
  });

  it("revenue and payout earnings route responses expose location attribution for ledger add-ons", async () => {
    const revenue = await json(
      await revenueGET(request("/api/provider/reports/revenue?from=2026-05-02&to=2026-05-02&location_id=loc-a")),
    );
    const payouts = await json(
      await payoutsGET(request("/api/provider/reports/payments/payouts?from=2026-05-02&to=2026-05-02&location_id=loc-a")),
    );

    expect(revenue.cancellation_fees).toBe(8);
    expect(revenue.locationAttribution.excludedUnattributedRows).toBe(0);
    expect(payouts.totalPayoutAmount).toBe(122);
    expect(payouts.locationAttribution.excludedUnattributedRows).toBe(2);
  });
});
