import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET as cancellationsGET } from "../bookings/cancellations/route";
import { GET as bookingsReportGET } from "../bookings/route";
import { GET as bookingStatusGET } from "../bookings/status/route";
import { GET as bookingSummaryGET } from "../bookings/summary/route";
import { GET as endOfDayGET } from "../end-of-day/route";
import { GET as membershipsGET } from "../memberships/route";
import { GET as refundsGET } from "../payments/refunds/route";
import { GET as paymentsSummaryGET } from "../payments/summary/route";
import { GET as payoutsGET } from "../payments/payouts/route";
import { GET as revenueGET } from "../revenue/route";
import { GET as salesServicesGET } from "../sales/services/route";
import { GET as salesSummaryGET } from "../sales/summary/route";
import { GET as clientsGET } from "../clients/route";
import { GET as noShowsGET } from "../bookings/no-shows/route";

type Row = Record<string, any>;

const providerId = "provider-1";
const user = { id: "user-1" };
let db: Record<string, Row[]>;
let mockSupabase: ReturnType<typeof createMockSupabase>;

const getProviderRevenueMock = vi.fn();
const getPreviousPeriodRevenueMock = vi.fn();
const getProviderNetAfterRefundsDetailedMock = vi.fn();
const getProviderNetAfterRefundsByBookingMock = vi.fn();
const getPreviousPeriodNetAfterRefundsMock = vi.fn();

const defaultRevenueResult = () => ({
  totalRevenue: 122,
  revenueByBooking: new Map([["booking-loc-a", 90]]),
  revenueByProductOrder: new Map([["order-loc-a", 32]]),
  revenueByDate: new Map([["2026-05-02", 122]]),
  latestSettlementAtByBooking: new Map([["booking-loc-a", "2026-05-02T12:00:00.000Z"]]),
  latestSettlementAtByProductOrder: new Map([["order-loc-a", "2026-05-02T11:00:00.000Z"]]),
});

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
  getProviderNetAfterRefundsDetailed: (...args: unknown[]) =>
    getProviderNetAfterRefundsDetailedMock(...args),
  getProviderNetAfterRefundsByBooking: (...args: unknown[]) =>
    getProviderNetAfterRefundsByBookingMock(...args),
  getPreviousPeriodNetAfterRefunds: (...args: unknown[]) =>
    getPreviousPeriodNetAfterRefundsMock(...args),
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
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;
  private orderField: string | null = null;
  private orderAscending = false;

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
  order(field: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
    this.orderField = field;
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
      rows.sort((a, b) => {
        const av = a[this.orderField!];
        const bv = b[this.orderField!];
        const cmp = String(av ?? "").localeCompare(String(bv ?? ""));
        return this.orderAscending ? cmp : -cmp;
      });
    }
    if (this.rangeFrom != null && this.rangeTo != null) {
      rows = rows.slice(this.rangeFrom, this.rangeTo + 1);
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
    getProviderRevenueMock.mockResolvedValue(defaultRevenueResult());
    getProviderNetAfterRefundsDetailedMock.mockResolvedValue(defaultRevenueResult());
    getProviderNetAfterRefundsByBookingMock.mockResolvedValue(
      new Map([["booking-loc-a", 90]]),
    );
    getPreviousPeriodRevenueMock.mockResolvedValue(50);
    getPreviousPeriodNetAfterRefundsMock.mockResolvedValue(50);
  });

  it("bookings report exposes channel_breakdown with recognized revenue", async () => {
    getProviderNetAfterRefundsByBookingMock.mockResolvedValue(
      new Map([
        ["booking-loc-a", 90],
        ["wallet-booking", 0],
      ]),
    );

    const data = await json(
      await bookingsReportGET(
        request("/api/provider/reports/bookings?from=2026-05-02&to=2026-05-02&location_id=loc-a"),
      ),
    );

    expect(Array.isArray(data.channel_breakdown)).toBe(true);
    expect(data.channel_breakdown.length).toBeGreaterThan(0);
    const online = data.channel_breakdown.find((r: { channel: string }) => r.channel === "online");
    expect(online?.recognized_revenue).toBe(90);
    expect(data.channelBasisNote).toContain("scheduled_at");
  });

  it("bookings summary uses provider timezone day keys and location-filtered bookings", async () => {
    const data = await json(
      await bookingSummaryGET(
        request("/api/provider/reports/bookings/summary?from=2026-05-02&to=2026-05-02&location_id=loc-a"),
      ),
    );

    expect(data.totalBookings).toBe(2);
    expect(data.dailyBookings).toEqual([{ date: "2026-05-02", count: 2, revenue: 122 }]);
    expect(getProviderNetAfterRefundsDetailedMock).toHaveBeenCalledWith(
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

  it("clients report exposes booked gross and ledger earnings with basis", async () => {
    const data = await json(
      await clientsGET(request("/api/provider/reports/clients?from=2026-05-01&to=2026-05-31&location_id=loc-a")),
    );

    expect(data.basisNote).toContain("Booked gross");
    expect(data.avg_booked_gross).toBeGreaterThan(0);
    expect(typeof data.avg_ledger_earnings).toBe("number");
    expect(data.top_clients[0]).toMatchObject({
      booked_gross_spend: expect.any(Number),
      ledger_earnings: expect.any(Number),
    });
  });

  it("revenue total_revenue_inclusive equals total_revenue (no cancellation-fee double-count)", async () => {
    const data = await json(
      await revenueGET(
        request("/api/provider/reports/revenue?from=2026-05-02&to=2026-05-02"),
      ),
    );
    // After the double-count fix, total_revenue_inclusive must equal total_revenue
    expect(data.total_revenue_inclusive).toBe(data.total_revenue);
  });

  it("no-shows repeat offenders include booked_value and ledger_earnings", async () => {
    db.bookings.push(
      {
        id: "ns-1",
        provider_id: providerId,
        location_id: "loc-a",
        status: "no_show",
        scheduled_at: "2026-05-02T10:00:00.000Z",
        total_amount: 200,
        customer_id: "client-1",
        booking_services: [{ staff_id: "staff-1" }],
      },
      {
        id: "ns-2",
        provider_id: providerId,
        location_id: "loc-a",
        status: "no_show",
        scheduled_at: "2026-05-02T14:00:00.000Z",
        total_amount: 150,
        customer_id: "client-1",
        booking_services: [{ staff_id: "staff-1" }],
      },
    );
    getProviderRevenueMock.mockResolvedValue({
      totalRevenue: 0,
      revenueByBooking: new Map([
        ["ns-1", 0],
        ["ns-2", 0],
      ]),
      revenueByProductOrder: new Map(),
      revenueByDate: new Map(),
      latestSettlementAtByBooking: new Map(),
      latestSettlementAtByProductOrder: new Map(),
    });

    const data = await json(
      await noShowsGET(
        request("/api/provider/reports/bookings/no-shows?from=2026-05-02&to=2026-05-02&location_id=loc-a"),
      ),
    );

    expect(data.basisNote).toContain("ledgerNetRecognized");
    expect(data.ledgerNetRecognized).toBe(0);
    expect(data.lostRevenue).toBe(0);
    const offender = data.repeatOffenders.find((c: { name: string }) => c.name);
    expect(offender).toMatchObject({
      booked_value: 350,
      ledger_earnings: 0,
      revenue: 350,
    });
  });
});

/**
 * Cross-report reconciliation suite — seeded dataset asserts that totals are
 * consistent across all report surfaces that claim to share the same basis.
 */
describe("cross-report reconciliation (seeded dataset)", () => {
  const FROM = "2026-05-01";
  const TO = "2026-05-31";
  const qs = `from=${FROM}&to=${TO}`;

  beforeEach(() => {
    vi.clearAllMocks();
    seedDb();
    mockSupabase = createMockSupabase();

    // Seed provider_earnings and membership_provider_earnings in finance_transactions
    db.finance_transactions.push(
      {
        id: "pe-booking-a",
        provider_id: providerId,
        transaction_type: "provider_earnings",
        amount: 90,
        net: 90,
        booking_id: "booking-loc-a",
        product_order_id: null,
        created_at: "2026-05-02T08:00:00.000Z",
        refund_component: null,
        description: null,
      },
      {
        id: "membership-earnings",
        provider_id: providerId,
        transaction_type: "membership_provider_earnings",
        amount: 50,
        net: 50,
        booking_id: null,
        product_order_id: null,
        created_at: "2026-05-03T10:00:00.000Z",
        refund_component: null,
        description: null,
      },
      {
        id: "membership-sale-1",
        provider_id: providerId,
        transaction_type: "membership_sale",
        amount: 200,
        net: 200,
        booking_id: null,
        product_order_id: null,
        created_at: "2026-05-03T10:00:00.000Z",
        refund_component: null,
        description: null,
      },
    );

    // Seed booking_services for sales-by-service test
    db.bookings[0].booking_services = [
      { id: "bs-1", price: 120, offering_id: "offer-1", offerings: { id: "offer-1", title: "Cut", duration_minutes: 30, provider_category_id: null } },
    ];

    // Net-after-refunds mock: 90 for booking-loc-a (same as Sales Summary would return)
    const revenueByBookingMap = new Map<string, number>([
      ["booking-loc-a", 90],
      ["booking-loc-b", 200],
    ]);
    getProviderNetAfterRefundsDetailedMock.mockResolvedValue({
      totalRevenue: 290,
      revenueByBooking: revenueByBookingMap,
      revenueByProductOrder: new Map(),
      revenueByDate: new Map([["2026-05-02", 290]]),
      latestSettlementAtByBooking: new Map([["booking-loc-a", "2026-05-02T12:00:00.000Z"]]),
      latestSettlementAtByProductOrder: new Map(),
    });
    getProviderNetAfterRefundsByBookingMock.mockResolvedValue(revenueByBookingMap);
    getProviderRevenueMock.mockResolvedValue({
      totalRevenue: 290,
      revenueByBooking: revenueByBookingMap,
      revenueByProductOrder: new Map(),
      revenueByDate: new Map([["2026-05-02", 290]]),
      latestSettlementAtByBooking: new Map(),
      latestSettlementAtByProductOrder: new Map(),
    });
    getPreviousPeriodNetAfterRefundsMock.mockResolvedValue(200);
    getPreviousPeriodRevenueMock.mockResolvedValue(200);

    // Seed user_memberships for active subscribers
    db.user_memberships = [
      { id: "mem-1", provider_id: providerId, status: "active" },
    ];
  });

  it("Sales by service totalRevenue == getProviderNetAfterRefundsByBooking sum (reconciles with Sales Summary)", async () => {
    const [servicesData, summaryData] = await Promise.all([
      json(await salesServicesGET(request(`/api/provider/reports/sales/services?${qs}`))),
      json(await salesSummaryGET(request(`/api/provider/reports/sales/summary?${qs}`))),
    ]);

    // Services total must use net-after-refunds — same mock value as summary
    // Both bookings have booking_services so expect sum of the map (90 + 200 = 290)
    expect(servicesData.totalRevenue).toBeCloseTo(290, 1);
    expect(servicesData.reportBasis).toContain("net-after-refunds");
    // The ledger sub-total from bookings in Sales Summary should equal services total
    // (summaryData.revenueByService total, or as a proxy use the same recognized revenue)
    expect(summaryData.totalRevenue).toBe(servicesData.totalRevenue);
  });

  it("Booking Summary total_bookings reconciles with Booking Status totalBookings for the same window", async () => {
    // Add a cancelled booking to test all-status count
    db.bookings.push({
      id: "cancelled-rec",
      provider_id: providerId,
      location_id: "loc-a",
      status: "cancelled",
      scheduled_at: "2026-05-10T09:00:00.000Z",
      total_amount: 100,
      cancellation_reason: "client request",
      booking_source: "online",
    });

    const [summaryData, statusData, bookingsData] = await Promise.all([
      json(await bookingSummaryGET(request(`/api/provider/reports/bookings/summary?${qs}`))),
      json(await bookingStatusGET(request(`/api/provider/reports/bookings/status?${qs}`))),
      json(await bookingsReportGET(request(`/api/provider/reports/bookings?${qs}`))),
    ]);

    // All three reports count bookings by scheduled_at — totals must agree
    expect(summaryData.totalBookings).toBe(statusData.totalBookings);
    expect(statusData.totalBookings).toBe(bookingsData.total_bookings);
  });

  it("Booking counts reconcile with Cancellations count for the same window", async () => {
    // Seed a cancelled booking
    db.bookings.push({
      id: "cancelled-count-check",
      provider_id: providerId,
      location_id: "loc-a",
      status: "cancelled",
      scheduled_at: "2026-05-15T10:00:00.000Z",
      total_amount: 80,
      cancellation_reason: "provider request",
      booking_source: "online",
    });

    const [bookingsData, cancellationsData] = await Promise.all([
      json(await bookingsReportGET(request(`/api/provider/reports/bookings?${qs}`))),
      json(await cancellationsGET(request(`/api/provider/reports/bookings/cancellations?${qs}`))),
    ]);

    expect(bookingsData.cancellation_count).toBe(cancellationsData.totalCancelled);
  });

  it("Membership recognized_earnings > 0 when membership_provider_earnings rows exist", async () => {
    const data = await json(
      await membershipsGET(request(`/api/provider/reports/memberships?${qs}`)),
    );

    expect(data.recognized_earnings).toBeGreaterThan(0);
    expect(data.recognized_earnings).toBe(50);
    expect(data.gross_sales).toBe(200);
    expect(data.active_subscribers).toBe(1);
    expect(data.reportBasis).toContain("membership_provider_earnings");
  });

  it("revenue total_revenue_inclusive equals total_revenue (no cancellation-fee double-count in reconciliation suite)", async () => {
    const data = await json(
      await revenueGET(request(`/api/provider/reports/revenue?${qs}`)),
    );
    expect(data.total_revenue_inclusive).toBe(data.total_revenue);
    expect(data.cancellation_fees).toBeGreaterThanOrEqual(0);
  });
});
