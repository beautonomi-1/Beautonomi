import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockRequire = vi.fn();
const mockTenant = vi.fn();
const mockSupabase = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireAdminSectionAny: (...args: unknown[]) => mockRequire(...args),
  };
});

vi.mock("@/lib/tenant/admin-request-tenant", () => ({
  resolveAdminApiTenantId: (...args: unknown[]) => mockTenant(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => mockSupabase(),
}));

vi.mock("@/lib/admin/payment-transactions-tenant-scope", () => ({
  fetchOrphanRefundPaymentTxsForTenant: async () => [],
}));

vi.mock("@/lib/admin/fetch-booking-refunds", () => ({
  extractBookingIdsFromRefundRows: (rows: { booking_id?: string }[]) =>
    rows.map((r) => r.booking_id).filter(Boolean),
  fetchBookingRefundsForBookingIds: async () => new Map(),
}));

vi.mock("@/lib/admin/refund-list-normalize", () => ({
  attachBookingRefundsToRows: (rows: unknown[]) => rows,
}));

vi.mock("@/lib/admin/fetch-refund-queue-context", () => ({
  fetchRefundQueueContext: async () => ({
    disputesByBookingId: new Set(),
    ticketsByBookingId: new Set(),
    coverageByBookingId: new Map(),
    additionalChargesById: new Map(),
    bookingPaymentsByBookingId: new Map(),
  }),
  attachAdditionalChargesToContext: async () => undefined,
  collectAdditionalChargeIds: () => [],
}));

vi.mock("@/lib/admin/fetch-booking-tender-rows", () => ({
  fetchBookingTenderSyntheticRows: async () => [],
}));

vi.mock("@/lib/admin/refund-queue-rows", () => ({
  buildRefundQueueRows: () => [
    {
      key: "txn:tx-1",
      source: "gateway_capture",
      booking_id: "b1",
      booking: { booking_number: "BK-1", status: "cancelled" },
      tender_label: "Card (Paystack)",
      collected: 200,
      refunded: 0,
      remaining_refundable: 200,
      reserved: 0,
      queue_reason: "cancelled_unrefunded",
      queue_reason_detail: "200.00 not yet credited",
      queue_reason_label: "Cancelled — refund owed",
      needs_action: true,
      is_processable: true,
      captures: [{ id: "tx-1", status: "success", remaining_refundable: 200, charge_label: "Booking payment" }],
      primary_transaction_id: "tx-1",
      enriched: { id: "tx-1", status: "success", created_at: "2026-01-01", booking_refunds: [] },
    },
  ],
  countRefundsNeedingReviewFromQueue: () => 1,
}));

function makeSupabase() {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    or: () => chain,
    in: () => chain,
    order: () => chain,
    gte: () => chain,
    lte: () => chain,
    limit: () => Promise.resolve({ data: [], error: null }),
  };
  return { from: () => chain };
}

describe("GET /api/admin/refunds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequire.mockResolvedValue(undefined);
    mockTenant.mockResolvedValue("tenant-1");
    mockSupabase.mockReturnValue(makeSupabase());
  });

  it("returns booking-centric queue fields", async () => {
    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/admin/refunds?status=needs_action"));
    const body = await res.json();

    expect(body.data.refunds[0]).toMatchObject({
      queue_reason: "cancelled_unrefunded",
      tender_label: "Card (Paystack)",
      source: "gateway_capture",
      needs_action: true,
      primary_transaction_id: "tx-1",
    });
    expect(body.data.statistics.actionable_refundable).toBe(1);
  });
});
