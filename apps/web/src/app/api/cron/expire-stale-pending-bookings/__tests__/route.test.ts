import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetSupabaseAdmin = vi.fn();
const mockVerifyCronRequest = vi.fn();
const mockSettleBookingFinanceById = vi.fn();
const mockSendCancellationNotification = vi.fn();
const mockMatchWaitlistOnCancellation = vi.fn();
const mockRpc = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: (...args: unknown[]) => mockGetSupabaseAdmin(...args),
}));

vi.mock("@/lib/cron-auth", () => ({
  verifyCronRequest: (...args: unknown[]) => mockVerifyCronRequest(...args),
}));

vi.mock("@/lib/bookings/settle-booking-cancellation", () => ({
  settleBookingFinanceById: (...args: unknown[]) => mockSettleBookingFinanceById(...args),
}));

vi.mock("@/lib/bookings/notifications", () => ({
  sendCancellationNotification: (...args: unknown[]) => mockSendCancellationNotification(...args),
}));

vi.mock("@/lib/waitlist/matching", () => ({
  matchWaitlistOnCancellation: (...args: unknown[]) => mockMatchWaitlistOnCancellation(...args),
}));

interface UpdatedBookingRow {
  id: string;
  currency?: string | null;
  customer_id?: string | null;
  customer_package_entitlement_id?: string | null;
}

interface TestConfig {
  staleBookings: Array<{ id: string }>;
  staleGroups: Array<{ id: string }>;
  groupParticipants: Record<string, Array<{ id: string }>>;
  /** Keyed by booking id. `null` simulates a lost race (already resolved elsewhere). */
  bookingUpdateResult: Record<string, UpdatedBookingRow | null>;
}

let config: TestConfig;

function resetConfig() {
  config = {
    staleBookings: [],
    staleGroups: [],
    groupParticipants: {},
    bookingUpdateResult: {},
  };
}

/** Chainable query-builder stub: any filter/order/limit method just records state; the
 * final resolution happens lazily when the chain is awaited (via `.then`). */
function makeChain(resolveQuery: (state: ChainState) => { data: unknown; error: unknown }) {
  const state: ChainState = { filters: {}, updatePayload: undefined };
  const chain: any = {
    select: (cols?: string) => {
      state.selected = cols;
      return chain;
    },
    update: (payload: unknown) => {
      state.updatePayload = payload;
      return chain;
    },
    eq: (col: string, value: unknown) => {
      (state.filters[col] ??= []).push(value);
      return chain;
    },
    is: (col: string, value: unknown) => {
      state.filters[`is:${col}`] = [value];
      return chain;
    },
    lt: (col: string, value: unknown) => {
      state.filters[`lt:${col}`] = [value];
      return chain;
    },
    order: () => chain,
    limit: () => chain,
    maybeSingle: () => Promise.resolve(resolveQuery(state)),
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
      try {
        resolve(resolveQuery(state));
      } catch (e) {
        reject?.(e);
      }
    },
  };
  return chain;
}

interface ChainState {
  filters: Record<string, unknown[]>;
  updatePayload: unknown;
  selected?: string;
}

function resolveQuery(table: string, state: ChainState): { data: unknown; error: unknown } {
  if (table === "bookings") {
    if (state.updatePayload) {
      const id = state.filters.id?.[0] as string | undefined;
      const row = id ? config.bookingUpdateResult[id] : undefined;
      return { data: row ? [row] : [], error: null };
    }
    if (state.filters.group_booking_id) {
      const gid = state.filters.group_booking_id[0] as string;
      return { data: config.groupParticipants[gid] ?? [], error: null };
    }
    return { data: config.staleBookings, error: null };
  }
  if (table === "group_bookings") {
    if (state.updatePayload) {
      return { data: null, error: null };
    }
    return { data: config.staleGroups, error: null };
  }
  return { data: [], error: null };
}

function makeAdmin() {
  return {
    from(table: string) {
      return makeChain((state) => resolveQuery(table, state));
    },
    rpc: (...args: unknown[]) => {
      mockRpc(...args);
      return Promise.resolve({ data: null, error: null });
    },
  };
}

describe("GET /api/cron/expire-stale-pending-bookings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    resetConfig();
    mockGetSupabaseAdmin.mockReturnValue(makeAdmin());
    mockSettleBookingFinanceById.mockResolvedValue({ walletRefundAmount: 0 });
    mockSendCancellationNotification.mockResolvedValue(undefined);
    mockMatchWaitlistOnCancellation.mockResolvedValue(undefined);
  });

  it("rejects when verifyCronRequest returns invalid", async () => {
    mockVerifyCronRequest.mockReturnValue({ valid: false, error: "Unauthorized" });
    const { GET } = await import("../route");
    const res = await GET(
      new NextRequest("https://app.example.com/api/cron/expire-stale-pending-bookings"),
    );
    expect(res.status).toBe(401);
  });

  it("expires a standalone stale pending booking with full refund and notifies customer+provider", async () => {
    mockVerifyCronRequest.mockReturnValue({ valid: true });
    config.staleBookings = [{ id: "b1" }];
    config.bookingUpdateResult = {
      b1: { id: "b1", currency: "ZAR", customer_id: "cust1", customer_package_entitlement_id: null },
    };
    mockSettleBookingFinanceById.mockResolvedValue({ walletRefundAmount: 150 });

    const { GET } = await import("../route");
    const res = await GET(
      new NextRequest("https://app.example.com/api/cron/expire-stale-pending-bookings"),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.bookings.expired).toBe(1);
    expect(body.bookings.skipped).toBe(0);

    expect(mockSettleBookingFinanceById).toHaveBeenCalledWith(expect.anything(), "b1", "admin");
    expect(mockSendCancellationNotification).toHaveBeenCalledWith(
      "b1",
      expect.objectContaining({
        cancelledBy: "system",
        feeRetained: 0,
        walletRefund: 150,
        currency: "ZAR",
      }),
    );
    expect(mockMatchWaitlistOnCancellation).toHaveBeenCalledWith(expect.anything(), "b1");
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("skips a booking that was resolved concurrently (update affects zero rows)", async () => {
    mockVerifyCronRequest.mockReturnValue({ valid: true });
    config.staleBookings = [{ id: "b2" }];
    config.bookingUpdateResult = { b2: null };

    const { GET } = await import("../route");
    const res = await GET(
      new NextRequest("https://app.example.com/api/cron/expire-stale-pending-bookings"),
    );
    const body = await res.json();

    expect(body.bookings.expired).toBe(0);
    expect(body.bookings.skipped).toBe(1);
    expect(mockSettleBookingFinanceById).not.toHaveBeenCalled();
    expect(mockSendCancellationNotification).not.toHaveBeenCalled();
  });

  it("restores a package entitlement when the cancelled booking used one", async () => {
    mockVerifyCronRequest.mockReturnValue({ valid: true });
    config.staleBookings = [{ id: "b1" }];
    config.bookingUpdateResult = {
      b1: {
        id: "b1",
        currency: "ZAR",
        customer_id: "cust1",
        customer_package_entitlement_id: "ent1",
      },
    };

    const { GET } = await import("../route");
    await GET(new NextRequest("https://app.example.com/api/cron/expire-stale-pending-bookings"));

    expect(mockRpc).toHaveBeenCalledWith("restore_customer_package_entitlement", {
      p_entitlement_id: "ent1",
      p_customer_id: "cust1",
    });
  });

  it("expires stale group bookings by cancelling every pending participant booking then the group", async () => {
    mockVerifyCronRequest.mockReturnValue({ valid: true });
    config.staleGroups = [{ id: "g1" }];
    config.groupParticipants = { g1: [{ id: "b3" }] };
    config.bookingUpdateResult = {
      b3: { id: "b3", currency: "ZAR", customer_id: "cust3", customer_package_entitlement_id: null },
    };

    const { GET } = await import("../route");
    const res = await GET(
      new NextRequest("https://app.example.com/api/cron/expire-stale-pending-bookings"),
    );
    const body = await res.json();

    expect(body.group_bookings.expired).toBe(1);
    expect(body.group_bookings.participant_bookings_expired).toBe(1);
    expect(mockSettleBookingFinanceById).toHaveBeenCalledWith(expect.anything(), "b3", "admin");
    expect(mockSendCancellationNotification).toHaveBeenCalledWith(
      "b3",
      expect.objectContaining({ cancelledBy: "system" }),
    );
  });

  it("defaults the TTL to 24h and derives the cutoff from it", async () => {
    mockVerifyCronRequest.mockReturnValue({ valid: true });
    delete process.env.STALE_PENDING_TTL_HOURS;

    const { GET } = await import("../route");
    const res = await GET(
      new NextRequest("https://app.example.com/api/cron/expire-stale-pending-bookings"),
    );
    const body = await res.json();
    expect(body.ttl_hours).toBe(24);
  });
});
