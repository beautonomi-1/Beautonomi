import { beforeEach, describe, expect, it, vi } from "vitest";

const GROUP_ID = "group-1";

const mockGetGroupBooking = vi.fn();
const mockLoadOutcome = vi.fn();
const mockSettleBookingCancellation = vi.fn();
const mockSettleBookingFinanceById = vi.fn();
const mockMatchWaitlist = vi.fn();

let claimableIds = new Set<string>();
const statusUpdates: string[] = [];

vi.mock("../group-booking", () => ({
  getGroupBooking: (...args: unknown[]) => mockGetGroupBooking(...args),
}));

vi.mock("../load-cancellation-outcome", () => ({
  loadCancellationOutcomeForBooking: (...args: unknown[]) => mockLoadOutcome(...args),
}));

vi.mock("../cancellation-outcome-bridge", () => ({
  settleParamsFromCancellationOutcome: (outcome: unknown, actor: unknown, base: unknown) => ({
    outcome,
    actor,
    base,
  }),
}));

vi.mock("../settle-booking-cancellation", () => ({
  settleBookingCancellation: (...args: unknown[]) => mockSettleBookingCancellation(...args),
  settleBookingFinanceById: (...args: unknown[]) => mockSettleBookingFinanceById(...args),
}));

vi.mock("@/lib/waitlist/matching", () => ({
  matchWaitlistOnCancellation: (...args: unknown[]) => mockMatchWaitlist(...args),
}));

vi.mock("@/lib/bookings/bookings-admin-write", () => ({
  getBookingsAdminClient: () => ({
    from: () => ({
      update: () => {
        let id = "";
        const chain = {
          eq: (_col: string, value: string) => {
            id = value;
            return chain;
          },
          not: () => chain,
          select: async () => {
            if (!claimableIds.has(id)) return { data: [], error: null };
            claimableIds.delete(id);
            statusUpdates.push(id);
            return { data: [{ id }], error: null };
          },
        };
        return chain;
      },
      select: () => {
        let id = "";
        const chain = {
          eq: (_col: string, value: string) => {
            id = value;
            return chain;
          },
          maybeSingle: async () => ({
            data: { id, total_amount: 200, currency: "ZAR" },
            error: null,
          }),
        };
        return chain;
      },
    }),
  }),
}));

function outcome(platformCollected: number, inPersonCollected: number) {
  return {
    allowed: true,
    isLate: false,
    platformCollected,
    inPersonCollected,
    feeRetained: 0,
    walletRefund: platformCollected,
    inPersonRefundDue: inPersonCollected,
    policy: null,
  };
}

function supabaseFor(linkedByGroup: Array<{ id: string; status: string }>) {
  return {
    from: (table: string) => {
      if (table === "bookings") {
        return {
          select: () => ({ eq: async () => ({ data: linkedByGroup, error: null }) }),
        };
      }
      if (table === "group_bookings") {
        return { update: () => ({ eq: async () => ({ error: null }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

describe("cancelGroupBooking settlement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    statusUpdates.length = 0;
    mockMatchWaitlist.mockResolvedValue(undefined);
  });

  it("cash-only group: no wallet credit, in-person amount returned for the provider to refund", async () => {
    claimableIds = new Set(["b-cash"]);
    mockGetGroupBooking.mockResolvedValue({ bookings: [{ id: "b-cash", status: "confirmed" }] });
    mockLoadOutcome.mockResolvedValue({ outcome: outcome(0, 200) });
    mockSettleBookingCancellation.mockResolvedValue({ walletRefundAmount: 0 });

    const { cancelGroupBooking } = await import("../group-booking-cancellation");
    const result = await cancelGroupBooking(supabaseFor([]) as never, GROUP_ID, "user-1", "r", {
      settleFinance: true,
      financeActor: "provider",
    });

    expect(result).toEqual([{ bookingId: "b-cash", walletRefund: 0, inPersonRefundDue: 200 }]);
  });

  it("online host payment: refunded to the wallet", async () => {
    claimableIds = new Set(["b-online"]);
    mockGetGroupBooking.mockResolvedValue({ bookings: [{ id: "b-online", status: "confirmed" }] });
    mockLoadOutcome.mockResolvedValue({ outcome: outcome(200, 0) });
    mockSettleBookingCancellation.mockResolvedValue({ walletRefundAmount: 200 });

    const { cancelGroupBooking } = await import("../group-booking-cancellation");
    const result = await cancelGroupBooking(supabaseFor([]) as never, GROUP_ID, "user-1", "r", {
      settleFinance: true,
      financeActor: "provider",
    });

    expect(result).toEqual([{ bookingId: "b-online", walletRefund: 200, inPersonRefundDue: 0 }]);
    expect(mockSettleBookingCancellation).toHaveBeenCalledTimes(1);
  });

  it("skips completed children and includes children linked only by group_booking_id", async () => {
    claimableIds = new Set(["b-linked"]);
    mockGetGroupBooking.mockResolvedValue({ bookings: [{ id: "b-done", status: "completed" }] });
    mockLoadOutcome.mockResolvedValue({ outcome: outcome(0, 50) });
    mockSettleBookingCancellation.mockResolvedValue({ walletRefundAmount: 0 });

    const { cancelGroupBooking } = await import("../group-booking-cancellation");
    const result = await cancelGroupBooking(
      supabaseFor([
        { id: "b-done", status: "completed" },
        { id: "b-linked", status: "confirmed" },
      ]) as never,
      GROUP_ID,
      "user-1",
      "r",
      { settleFinance: true, financeActor: "provider" },
    );

    expect(result.map((r) => r.bookingId)).toEqual(["b-linked"]);
    expect(statusUpdates).toEqual(["b-linked"]);
    expect(mockLoadOutcome).toHaveBeenCalledTimes(1);
  });

  it("retry: a child already claimed by an earlier cancel is not settled again", async () => {
    claimableIds = new Set();
    mockGetGroupBooking.mockResolvedValue({ bookings: [{ id: "b-raced", status: "confirmed" }] });
    mockLoadOutcome.mockResolvedValue({ outcome: outcome(200, 0) });

    const { cancelGroupBooking } = await import("../group-booking-cancellation");
    const result = await cancelGroupBooking(supabaseFor([]) as never, GROUP_ID, "user-1", "r", {
      settleFinance: true,
      financeActor: "provider",
    });

    expect(result).toEqual([]);
    expect(mockSettleBookingCancellation).not.toHaveBeenCalled();
  });

  it("settles a primary the caller already cancelled when listed in settleAlreadyCancelledBookingIds", async () => {
    claimableIds = new Set(["b-guest"]);
    mockGetGroupBooking.mockResolvedValue({
      bookings: [
        { id: "b-primary", status: "cancelled" },
        { id: "b-guest", status: "confirmed" },
      ],
    });
    mockLoadOutcome.mockResolvedValue({ outcome: outcome(100, 0) });
    mockSettleBookingCancellation.mockResolvedValue({ walletRefundAmount: 100 });

    const { cancelGroupBooking } = await import("../group-booking-cancellation");
    const result = await cancelGroupBooking(supabaseFor([]) as never, GROUP_ID, "user-1", "r", {
      settleFinance: true,
      financeActor: "customer",
      settleAlreadyCancelledBookingIds: ["b-primary"],
    });

    expect(result.map((r) => r.bookingId).sort()).toEqual(["b-guest", "b-primary"]);
    expect(statusUpdates).toEqual(["b-guest"]);
    expect(mockSettleBookingCancellation).toHaveBeenCalledTimes(2);
  });
});
