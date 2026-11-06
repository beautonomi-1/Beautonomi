import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const LEAD_ID = "11111111-1111-4111-8111-111111111111";
const CHILD_ID = "22222222-2222-4222-8222-222222222222";
const GUEST_CHILD_ID = "55555555-5555-4555-8555-555555555555";
const GROUP_ID = "33333333-3333-4333-8333-333333333333";
const USER_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

const mockRequireAuthInApi = vi.fn();
const mockLoadOutcome = vi.fn();
const mockHasPendingReplacement = vi.fn();
let groupRow: { id: string; ref_number: string } | null = null;

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return { ...actual, requireAuthInApi: (...args: unknown[]) => mockRequireAuthInApi(...args) };
});

vi.mock("@/lib/supabase/server", () => ({ getSupabaseServer: vi.fn(async () => ({})) }));

vi.mock("@/lib/bookings/load-cancellation-outcome", () => ({
  loadCancellationOutcomeForBooking: (...args: unknown[]) => mockLoadOutcome(...args),
}));

vi.mock("@/lib/bookings/reschedule-carry-over", () => ({
  hasPendingRescheduleReplacement: (...args: unknown[]) => mockHasPendingReplacement(...args),
  RESCHEDULE_IN_PROGRESS_MESSAGE: "in progress",
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table === "group_bookings") {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: groupRow, error: null }) }) }) };
      }
      if (table === "bookings") {
        return {
          select: () => ({
            eq: async () => ({
              data: [
                { id: LEAD_ID, status: "cancelled", customer_id: USER_ID },
                { id: CHILD_ID, status: "confirmed", customer_id: USER_ID },
                { id: GUEST_CHILD_ID, status: "confirmed", customer_id: "someone-else" },
              ],
              error: null,
            }),
          }),
        };
      }
      if (table === "booking_participants") {
        return {
          select: () => ({
            eq: () => ({ eq: async () => ({ data: [{ id: "p1" }, { id: "p2" }], error: null }) }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

function outcome(overrides: Record<string, unknown> = {}) {
  return {
    allowed: true,
    isLate: true,
    platformCollected: 300,
    inPersonCollected: 0,
    feeRetained: 30,
    walletRefund: 270,
    inPersonRefundDue: 0,
    policy: { hours_before_cutoff: 24, grace_window_minutes: 15, late_cancellation_type: "percentage", refund_percentage: 90 },
    noShowAvailableAt: new Date().toISOString(),
    ...overrides,
  };
}

async function callPreview() {
  const { GET } = await import("../route");
  const res = await GET(new NextRequest(`http://localhost/api/me/bookings/${LEAD_ID}/cancel-preview`), {
    params: Promise.resolve({ id: LEAD_ID }),
  });
  return (await res.json()).data;
}

describe("GET /api/me/bookings/[id]/cancel-preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    groupRow = null;
    mockRequireAuthInApi.mockResolvedValue({ user: { id: USER_ID } });
    mockHasPendingReplacement.mockResolvedValue(false);
  });

  it("shows the lead's own refund, not the guest shares that go back to guests' cards", async () => {
    mockLoadOutcome.mockResolvedValue({
      booking: { id: LEAD_ID, customer_id: USER_ID, total_amount: 300, currency: "ZAR" },
      outcome: outcome({ guestSharesHeld: 200, leadFeeRetained: 10, leadWalletRefund: 90 }),
    });

    const data = await callPreview();
    expect(data.expected_wallet_refund).toBe(90);
    expect(data.expected_cancellation_fee).toBe(10);
    expect(data.guest_shares_refunded).toBe(200);
    expect(data.group).toBeNull();
  });

  it("previews the other group bookings the organizer owns when cancelling the lead", async () => {
    groupRow = { id: GROUP_ID, ref_number: "GB-7" };
    mockLoadOutcome.mockImplementation(async (_client: unknown, bookingId: string) => {
      if (bookingId === LEAD_ID) {
        return {
          booking: { id: LEAD_ID, customer_id: USER_ID, total_amount: 100, currency: "ZAR" },
          outcome: outcome({ walletRefund: 90, feeRetained: 10, platformCollected: 100 }),
        };
      }
      return {
        booking: { id: bookingId, customer_id: USER_ID, total_amount: 100, currency: "ZAR" },
        outcome: outcome({ walletRefund: 80, feeRetained: 20, inPersonRefundDue: 5 }),
      };
    });

    const data = await callPreview();
    expect(data.group).toEqual({
      group_booking_id: GROUP_ID,
      ref_number: "GB-7",
      guest_count: 2,
      other_bookings_cancelled: 2,
      other_bookings_wallet_refund: 80,
      other_bookings_cancellation_fee: 20,
      other_bookings_in_person_refund_due: 5,
    });
    const previewedIds = mockLoadOutcome.mock.calls.map((c) => c[1]);
    expect(previewedIds).toContain(CHILD_ID);
    expect(previewedIds).not.toContain(GUEST_CHILD_ID);
  });

  it("blocks the preview while a reschedule checkout is open", async () => {
    mockHasPendingReplacement.mockResolvedValue(true);
    mockLoadOutcome.mockResolvedValue({
      booking: { id: LEAD_ID, customer_id: USER_ID, total_amount: 100, currency: "ZAR" },
      outcome: outcome(),
    });
    const data = await callPreview();
    expect(data.allowed).toBe(false);
    expect(data.block_code).toBe("RESCHEDULE_IN_PROGRESS");
  });
});
