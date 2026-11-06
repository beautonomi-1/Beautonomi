import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/** Cancel route pulls a large module graph; avoid 45s flakes under parallel Vitest. */
const ROUTE_TEST_TIMEOUT_MS = 90_000;

const BOOKING_ID = "11111111-1111-4111-8111-111111111111";
const GROUP_ID = "33333333-3333-4333-8333-333333333333";
const USER_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const PROVIDER_ID = "44444444-4444-4444-8444-444444444444";

const mockRequireAuthInApi = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockGetSupabaseAdmin = vi.fn();
const mockGetCancellationPolicy = vi.fn();
const mockCanCancelBooking = vi.fn();
const mockCancelGroupBooking = vi.fn();
const mockCancelGroupBookingParticipant = vi.fn();
const mockTryRecalculateGroupBookingTotal = vi.fn();
const mockSyncGroupBookingStatusFromChildren = vi.fn();
const mockSettleBookingCancellation = vi.fn();
const mockSendCancellationNotification = vi.fn();
const mockHasPendingRescheduleReplacement = vi.fn();
const mockNotifyGuestsWithoutAccounts = vi.fn();

vi.mock("@/lib/bookings/reschedule-carry-over", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bookings/reschedule-carry-over")>();
  return {
    ...actual,
    hasPendingRescheduleReplacement: (...args: unknown[]) =>
      mockHasPendingRescheduleReplacement(...args),
  };
});

vi.mock("@/lib/bookings/group-booking-notifications", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bookings/group-booking-notifications")>();
  return {
    ...actual,
    notifyGroupGuestsWithoutAccountsOfCancellation: (...args: unknown[]) =>
      mockNotifyGuestsWithoutAccounts(...args),
  };
});

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireAuthInApi: (...args: unknown[]) => mockRequireAuthInApi(...args),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
}));

vi.mock("@/lib/bookings/cancellation-policy", () => ({
  getCancellationPolicy: (...args: unknown[]) => mockGetCancellationPolicy(...args),
  canCancelBooking: (...args: unknown[]) => mockCanCancelBooking(...args),
}));

vi.mock("@/lib/bookings/load-cancellation-outcome", () => ({
  loadCancellationOutcomeForBooking: vi.fn(async () => ({
    outcome: {
      allowed: true,
      isLate: false,
      platformCollected: 0,
      inPersonCollected: 0,
      feeRetained: 0,
      walletRefund: 0,
      inPersonRefundDue: 0,
      policy: {
        hours_before_cutoff: 24,
        grace_window_minutes: 15,
        refund_percentage: 100,
        late_cancellation_type: "full_refund",
      },
      noShowAvailableAt: new Date().toISOString(),
    },
    error: null,
  })),
}));

vi.mock("@/lib/bookings/group-booking-cancellation", () => ({
  cancelGroupBooking: (...args: unknown[]) => mockCancelGroupBooking(...args),
  cancelGroupBookingParticipant: (...args: unknown[]) =>
    mockCancelGroupBookingParticipant(...args),
  getGroupBookingParticipantsForCancellation: vi.fn(async () => []),
}));

vi.mock("@/lib/bookings/recalculate-group-total", () => ({
  tryRecalculateGroupBookingTotal: (...args: unknown[]) =>
    mockTryRecalculateGroupBookingTotal(...args),
}));

vi.mock("@/lib/bookings/group-booking", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bookings/group-booking")>();
  return {
    ...actual,
    syncGroupBookingStatusFromChildren: (...args: unknown[]) =>
      mockSyncGroupBookingStatusFromChildren(...args),
  };
});

vi.mock("@/lib/bookings/settle-booking-cancellation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bookings/settle-booking-cancellation")>();
  return {
    ...actual,
    computeReconciledCancellationAmounts: vi.fn(() => ({
      cancellationFeeApplied: 0,
      walletRefundAmount: 0,
    })),
    settleBookingCancellation: (...args: unknown[]) => mockSettleBookingCancellation(...args),
  };
});

vi.mock("@/lib/bookings/notifications", () => ({
  sendCancellationNotification: (...args: unknown[]) => mockSendCancellationNotification(...args),
}));

vi.mock("@/lib/regions/config", () => ({
  getTenantRegionConfig: vi.fn(async () => ({ defaultCurrency: "ZAR" })),
}));

vi.mock("@/lib/analytics/amplitude/server", () => ({
  trackServer: vi.fn(async () => undefined),
}));

function bookingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: BOOKING_ID,
    provider_id: PROVIDER_ID,
    tenant_id: null,
    location_type: "at_salon",
    scheduled_at: new Date(Date.now() + 86400000).toISOString(),
    created_at: new Date().toISOString(),
    status: "confirmed",
    customer_id: USER_ID,
    version: 1,
    booking_number: "1001",
    subtotal: 100,
    discount_amount: 0,
    tax_amount: 0,
    service_fee_amount: 0,
    travel_fee: 0,
    tip_amount: 0,
    total_amount: 100,
    total_paid: 100,
    total_refunded: 0,
    wallet_amount: 0,
    gift_card_amount: 0,
    currency: "ZAR",
    cancellation_fee: 0,
    customer_package_entitlement_id: null,
    loyalty_points_used: 0,
    loyalty_points_redeemed: 0,
    loyalty_points_earned: 0,
    group_booking_id: null,
    ...overrides,
  };
}

const PARTICIPANT_ID = "22222222-2222-4222-8222-222222222222";

function buildSupabaseMocks(options: {
  booking: ReturnType<typeof bookingRow>;
  primaryGroup?: { id: string } | null;
  groupParticipant?: { id: string } | null;
}) {
  const serverClient = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "bookings") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: options.booking, error: null }),
            }),
          }),
        };
      }
      if (table === "group_bookings") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: options.primaryGroup ?? null,
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "providers") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { tenant_id: null }, error: null }),
            }),
          }),
        };
      }
      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      };
    }),
  };

  const adminClient = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "bookings") {
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockResolvedValue({
                  data: [{ ...options.booking, status: "cancelled" }],
                  error: null,
                }),
              }),
              select: vi.fn().mockResolvedValue({
                data: [{ ...options.booking, status: "cancelled" }],
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "booking_participants") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: options.groupParticipant ?? null,
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
        from: vi.fn(),
      };
    }),
  };

  return { serverClient, adminClient };
}

describe("POST /api/me/bookings/[id]/cancel — group bookings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthInApi.mockResolvedValue({ user: { id: USER_ID } });
    mockGetCancellationPolicy.mockResolvedValue({ id: "pol-1", grace_window_minutes: 60 });
    mockCanCancelBooking.mockReturnValue({ allowed: true, isLateCancellation: false });
    mockSendCancellationNotification.mockResolvedValue(undefined);
    mockHasPendingRescheduleReplacement.mockResolvedValue(false);
    mockNotifyGuestsWithoutAccounts.mockResolvedValue({ notified: 0 });
    mockSettleBookingCancellation.mockResolvedValue({
      refundResult: { success: true, amount: 0 },
    });
  });

  it("returns GROUP_CANCEL_INCOMPLETE when primary cascade fails", async () => {
    const { serverClient, adminClient } = buildSupabaseMocks({
      booking: bookingRow(),
      primaryGroup: { id: GROUP_ID },
    });
    mockGetSupabaseServer.mockResolvedValue(serverClient);
    mockGetSupabaseAdmin.mockReturnValue(adminClient);
    mockCancelGroupBooking.mockRejectedValue(new Error("db unavailable"));

    const { POST } = await import("../route");
    const res = await POST(
      new NextRequest(`http://localhost/api/me/bookings/${BOOKING_ID}/cancel`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: BOOKING_ID }) }
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(JSON.stringify(body)).toMatch(/GROUP_CANCEL_INCOMPLETE/);
    expect(mockCancelGroupBooking).toHaveBeenCalledWith(
      adminClient,
      GROUP_ID,
      USER_ID,
      "Customer cancellation",
      expect.objectContaining({
        settleFinance: true,
        financeActor: "customer",
        settleAlreadyCancelledBookingIds: [BOOKING_ID],
      }),
    );
  }, ROUTE_TEST_TIMEOUT_MS);

  it("recalculates total and syncs group status after non-primary cancel", async () => {
    const { serverClient, adminClient } = buildSupabaseMocks({
      booking: bookingRow({ group_booking_id: GROUP_ID }),
      primaryGroup: null,
      groupParticipant: { id: PARTICIPANT_ID },
    });
    mockGetSupabaseServer.mockResolvedValue(serverClient);
    mockGetSupabaseAdmin.mockReturnValue(adminClient);
    mockTryRecalculateGroupBookingTotal.mockResolvedValue(undefined);
    mockSyncGroupBookingStatusFromChildren.mockResolvedValue("confirmed");
    mockCancelGroupBookingParticipant.mockResolvedValue(undefined);

    const { POST } = await import("../route");
    const res = await POST(
      new NextRequest(`http://localhost/api/me/bookings/${BOOKING_ID}/cancel`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: BOOKING_ID }) }
    );

    expect(res.status).toBe(200);
    expect(mockCancelGroupBookingParticipant).toHaveBeenCalledWith(
      adminClient,
      BOOKING_ID,
      PARTICIPANT_ID,
      USER_ID,
      "Customer cancellation",
      { bookingAlreadyCancelled: true },
    );
    expect(mockTryRecalculateGroupBookingTotal).toHaveBeenCalledWith(adminClient, GROUP_ID);
    expect(mockSyncGroupBookingStatusFromChildren).toHaveBeenCalledWith(adminClient, GROUP_ID);
    expect(mockCancelGroupBooking).not.toHaveBeenCalled();
  });

  it("blocks cancelling a booking whose reschedule checkout is still open", async () => {
    const { serverClient, adminClient } = buildSupabaseMocks({ booking: bookingRow() });
    mockGetSupabaseServer.mockResolvedValue(serverClient);
    mockGetSupabaseAdmin.mockReturnValue(adminClient);
    mockHasPendingRescheduleReplacement.mockResolvedValue(true);

    const { POST } = await import("../route");
    const res = await POST(
      new NextRequest(`http://localhost/api/me/bookings/${BOOKING_ID}/cancel`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: BOOKING_ID }) }
    );

    expect(res.status).toBe(409);
    expect(JSON.stringify(await res.json())).toMatch(/RESCHEDULE_IN_PROGRESS/);
    expect(mockSettleBookingCancellation).not.toHaveBeenCalled();
    expect(mockCancelGroupBooking).not.toHaveBeenCalled();
  }, ROUTE_TEST_TIMEOUT_MS);

  it("sends the guest cancellation notice for guests without accounts", async () => {
    const { serverClient, adminClient } = buildSupabaseMocks({
      booking: bookingRow(),
      primaryGroup: { id: GROUP_ID },
    });
    mockGetSupabaseServer.mockResolvedValue(serverClient);
    mockGetSupabaseAdmin.mockReturnValue(adminClient);
    mockCancelGroupBooking.mockResolvedValue([]);

    const { POST } = await import("../route");
    const res = await POST(
      new NextRequest(`http://localhost/api/me/bookings/${BOOKING_ID}/cancel`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: BOOKING_ID }) }
    );

    expect(res.status).toBe(200);
    expect(mockNotifyGuestsWithoutAccounts).toHaveBeenCalledWith(
      adminClient,
      expect.objectContaining({ providerId: PROVIDER_ID, bookingRef: "1001", cancelledBy: "customer" }),
    );
  }, ROUTE_TEST_TIMEOUT_MS);
});
