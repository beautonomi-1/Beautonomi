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

vi.mock("@/lib/analytics/amplitude/server", () => ({
  trackServer: vi.fn().mockResolvedValue(undefined),
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
  preSlotCandidates: Array<{
    id: string;
    created_at?: string;
    scheduled_at?: string;
    booking_source?: string;
    status?: string;
    provider_id?: string;
    group_booking_id?: string;
    recurring_series_id?: string | null;
  }>;
  janitorBookings: Array<{ id: string; recurring_series_id?: string | null }>;
  staleGroups: Array<{ id: string }>;
  groupParticipants: Record<string, Array<{ id: string; recurring_series_id?: string | null }>>;
  groupPrimaryContact: Record<string, string | null>;
  confirmedGroupCounts: Record<string, number>;
  /** Keyed by booking id. `null` simulates a lost race (already resolved elsewhere). */
  bookingUpdateResult: Record<string, UpdatedBookingRow | null>;
}

let config: TestConfig;

function resetConfig() {
  config = {
    preSlotCandidates: [],
    janitorBookings: [],
    staleGroups: [],
    groupParticipants: {},
    groupPrimaryContact: {},
    confirmedGroupCounts: {},
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
    not: () => chain,
    is: (col: string, value: unknown) => {
      state.filters[`is:${col}`] = [value];
      return chain;
    },
    lt: (col: string, value: unknown) => {
      state.filters[`lt:${col}`] = [value];
      return chain;
    },
    gt: (col: string, value: unknown) => {
      state.filters[`gt:${col}`] = [value];
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

function resolveQuery(table: string, state: ChainState): { data: unknown; error: unknown; count?: number } {
  if (table === "bookings") {
    if (state.updatePayload) {
      const id = state.filters.id?.[0] as string | undefined;
      const row = id ? config.bookingUpdateResult[id] : undefined;
      return { data: row ? [row] : [], error: null };
    }
    if (state.filters.group_booking_id) {
      const gid = state.filters.group_booking_id[0] as string;
      if (state.filters.status?.[0] === "confirmed") {
        const n = config.confirmedGroupCounts[gid] ?? 0;
        return { data: null, error: null, count: n };
      }
      return { data: config.groupParticipants[gid] ?? [], error: null };
    }
    if (state.filters["lt:scheduled_at"]) {
      return { data: config.janitorBookings, error: null };
    }
    if (state.filters["gt:scheduled_at"]) {
      return { data: config.preSlotCandidates, error: null };
    }
    return { data: [], error: null };
  }
  if (table === "group_bookings") {
    if (state.updatePayload) {
      return { data: null, error: null };
    }
    if (state.filters.id) {
      const groupId = state.filters.id[0] as string;
      return {
        data: { primary_contact_booking_id: config.groupPrimaryContact[groupId] ?? null },
        error: null,
      };
    }
    return { data: config.staleGroups, error: null };
  }
  if (table === "providers") {
    return {
      data: [{ id: "provider-1", timezone: "Africa/Johannesburg", confirmation_sla_hours: 2, unconfirmed_expire_hours_before_slot: 2 }],
      error: null,
    };
  }
  if (table === "provider_locations") {
    return { data: [{ working_hours: null }], error: null };
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
      const fn = args[0];
      if (fn === "claim_cron_run") {
        return Promise.resolve({ data: 1, error: null });
      }
      if (fn === "finish_cron_run") {
        return Promise.resolve({ data: null, error: null });
      }
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

  it("expires janitor stale pending bookings with full refund and notifies customer+provider", async () => {
    mockVerifyCronRequest.mockReturnValue({ valid: true });
    config.janitorBookings = [{ id: "b1" }];
    config.bookingUpdateResult = {
      b1: { id: "b1", currency: "ZAR", customer_id: "cust1", customer_package_entitlement_id: null },
    };
    mockSettleBookingFinanceById.mockResolvedValue({ walletRefundAmount: 150 });

    const { GET } = await import("../route");
    const res = await GET(
      new Request("https://app.example.com/api/cron/expire-stale-pending-bookings"),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.janitor.bookings_expired).toBe(1);
    expect(body.janitor.bookings_skipped).toBe(0);

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
    expect(mockRpc).not.toHaveBeenCalledWith(
      "restore_customer_package_entitlement",
      expect.anything(),
    );
  });

  it("skips a booking that was resolved concurrently (update affects zero rows)", async () => {
    mockVerifyCronRequest.mockReturnValue({ valid: true });
    config.janitorBookings = [{ id: "b2" }];
    config.bookingUpdateResult = { b2: null };

    const { GET } = await import("../route");
    const res = await GET(
      new Request("https://app.example.com/api/cron/expire-stale-pending-bookings"),
    );
    const body = await res.json();

    expect(body.janitor.bookings_expired).toBe(0);
    expect(body.janitor.bookings_skipped).toBe(1);
    expect(mockSettleBookingFinanceById).not.toHaveBeenCalled();
    expect(mockSendCancellationNotification).not.toHaveBeenCalled();
  });

  it("restores a package entitlement when the cancelled booking used one", async () => {
    mockVerifyCronRequest.mockReturnValue({ valid: true });
    config.janitorBookings = [{ id: "b1" }];
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
    config.groupParticipants = { g1: [{ id: "b3" }, { id: "b4" }] };
    config.groupPrimaryContact = { g1: "b4" };
    config.bookingUpdateResult = {
      b3: { id: "b3", currency: "ZAR", customer_id: "cust3", customer_package_entitlement_id: null },
      b4: { id: "b4", currency: "ZAR", customer_id: "cust4", customer_package_entitlement_id: null },
    };

    const { GET } = await import("../route");
    const res = await GET(
      new NextRequest("https://app.example.com/api/cron/expire-stale-pending-bookings"),
    );
    const body = await res.json();

    expect(body.janitor.groups_expired).toBe(1);
    expect(body.janitor.participant_bookings_expired).toBe(2);
    expect(mockSettleBookingFinanceById).toHaveBeenCalledWith(expect.anything(), "b3", "admin");
    expect(mockSettleBookingFinanceById).toHaveBeenCalledWith(expect.anything(), "b4", "admin");
    expect(mockSendCancellationNotification).toHaveBeenCalledTimes(1);
    expect(mockSendCancellationNotification).toHaveBeenCalledWith(
      "b4",
      expect.objectContaining({ cancelledBy: "system", feeRetained: 0, currency: "ZAR" }),
    );
  });

  it("notifies the group organiser on pre-slot expiry, not the first sibling in query order", async () => {
    mockVerifyCronRequest.mockReturnValue({ valid: true });
    const now = Date.now();
    const createdAt = new Date(now - 3 * 60 * 60 * 1000).toISOString();
    const scheduledAt = new Date(now + 4 * 60 * 60 * 1000).toISOString();
    config.preSlotCandidates = [
      {
        id: "child-first",
        created_at: createdAt,
        scheduled_at: scheduledAt,
        booking_source: "online",
        status: "pending",
        provider_id: "provider-1",
        group_booking_id: "g-pre",
      },
      {
        id: "organiser-b",
        created_at: createdAt,
        scheduled_at: scheduledAt,
        booking_source: "online",
        status: "pending",
        provider_id: "provider-1",
        group_booking_id: "g-pre",
      },
    ];
    config.groupParticipants = {
      "g-pre": [{ id: "child-first" }, { id: "organiser-b" }],
    };
    config.groupPrimaryContact = { "g-pre": "organiser-b" };
    config.bookingUpdateResult = {
      "child-first": {
        id: "child-first",
        currency: "ZAR",
        customer_id: "guest-1",
        customer_package_entitlement_id: null,
      },
      "organiser-b": {
        id: "organiser-b",
        currency: "ZAR",
        customer_id: "organiser-1",
        customer_package_entitlement_id: null,
      },
    };

    const { GET } = await import("../route");
    const res = await GET(
      new NextRequest("https://app.example.com/api/cron/expire-stale-pending-bookings"),
    );
    const body = await res.json();

    expect(body.pre_slot.expired).toBe(2);
    expect(mockSendCancellationNotification).toHaveBeenCalledTimes(1);
    expect(mockSendCancellationNotification).toHaveBeenCalledWith(
      "organiser-b",
      expect.objectContaining({ cancelledBy: "system" }),
    );
    expect(mockSendCancellationNotification).not.toHaveBeenCalledWith(
      "child-first",
      expect.anything(),
    );
  });

  it("expires leftover pending siblings when another guest in the group is already confirmed", async () => {
    mockVerifyCronRequest.mockReturnValue({ valid: true });
    const now = Date.now();
    const createdAt = new Date(now - 3 * 60 * 60 * 1000).toISOString();
    const scheduledAt = new Date(now + 4 * 60 * 60 * 1000).toISOString();
    config.preSlotCandidates = [
      {
        id: "guest-pending",
        created_at: createdAt,
        scheduled_at: scheduledAt,
        booking_source: "online",
        status: "pending",
        provider_id: "provider-1",
        group_booking_id: "g-mix",
      },
    ];
    config.groupParticipants = { "g-mix": [{ id: "guest-pending" }] };
    config.confirmedGroupCounts = { "g-mix": 1 };
    config.groupPrimaryContact = { "g-mix": "organiser-confirmed" };
    config.bookingUpdateResult = {
      "guest-pending": {
        id: "guest-pending",
        currency: "ZAR",
        customer_id: "guest-1",
        customer_package_entitlement_id: null,
      },
    };

    const { GET } = await import("../route");
    const res = await GET(
      new NextRequest("https://app.example.com/api/cron/expire-stale-pending-bookings"),
    );
    const body = await res.json();

    expect(body.pre_slot.expired).toBe(1);
    expect(mockSettleBookingFinanceById).toHaveBeenCalledWith(expect.anything(), "guest-pending", "admin");
    expect(mockSendCancellationNotification).toHaveBeenCalledWith(
      "guest-pending",
      expect.objectContaining({ cancelledBy: "system" }),
    );
  });

  it("does not expire recurring series visits that sit in a pending group", async () => {
    mockVerifyCronRequest.mockReturnValue({ valid: true });
    const now = Date.now();
    const createdAt = new Date(now - 3 * 60 * 60 * 1000).toISOString();
    const scheduledAt = new Date(now + 4 * 60 * 60 * 1000).toISOString();
    config.preSlotCandidates = [
      {
        id: "one-off",
        created_at: createdAt,
        scheduled_at: scheduledAt,
        booking_source: "online",
        status: "pending",
        provider_id: "provider-1",
        group_booking_id: "g-series",
      },
    ];
    config.groupParticipants = {
      "g-series": [
        { id: "one-off" },
        { id: "series-child", recurring_series_id: "series-1" },
      ],
    };
    config.groupPrimaryContact = { "g-series": "one-off" };
    config.bookingUpdateResult = {
      "one-off": {
        id: "one-off",
        currency: "ZAR",
        customer_id: "cust-1",
        customer_package_entitlement_id: null,
      },
    };

    const { GET } = await import("../route");
    const res = await GET(
      new NextRequest("https://app.example.com/api/cron/expire-stale-pending-bookings"),
    );
    const body = await res.json();

    expect(body.pre_slot.expired).toBe(1);
    expect(mockSettleBookingFinanceById).toHaveBeenCalledWith(expect.anything(), "one-off", "admin");
    expect(mockSettleBookingFinanceById).not.toHaveBeenCalledWith(
      expect.anything(),
      "series-child",
      expect.anything(),
    );
  });

  it("defaults the TTL to 1h and derives the cutoff from it", async () => {
    mockVerifyCronRequest.mockReturnValue({ valid: true });
    delete process.env.STALE_PENDING_TTL_HOURS;

    const { GET } = await import("../route");
    const res = await GET(
      new Request("https://app.example.com/api/cron/expire-stale-pending-bookings"),
    );
    const body = await res.json();
    expect(body.ttl_hours).toBe(1);
  });

  it("expires a due online pending one-off on the pre-slot path", async () => {
    mockVerifyCronRequest.mockReturnValue({ valid: true });
    const now = Date.now();
    config.preSlotCandidates = [
      {
        id: "one-off",
        created_at: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
        scheduled_at: new Date(now + 4 * 60 * 60 * 1000).toISOString(),
        booking_source: "online",
        status: "pending",
        provider_id: "provider-1",
        recurring_series_id: null,
      },
    ];
    config.bookingUpdateResult = {
      "one-off": {
        id: "one-off",
        currency: "ZAR",
        customer_id: "cust1",
        customer_package_entitlement_id: null,
      },
    };

    const { GET } = await import("../route");
    const res = await GET(
      new NextRequest("https://app.example.com/api/cron/expire-stale-pending-bookings"),
    );
    const body = await res.json();

    expect(body.pre_slot.expired).toBe(1);
    expect(mockSendCancellationNotification).toHaveBeenCalledWith(
      "one-off",
      expect.objectContaining({ cancelledBy: "system" }),
    );
  });

  it("does not pre-slot expire a pending visit that belongs to a recurring series", async () => {
    mockVerifyCronRequest.mockReturnValue({ valid: true });
    const now = Date.now();
    config.preSlotCandidates = [
      {
        id: "series-child",
        created_at: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
        scheduled_at: new Date(now + 4 * 60 * 60 * 1000).toISOString(),
        booking_source: "online",
        status: "pending",
        provider_id: "provider-1",
        recurring_series_id: "series-1",
      },
    ];
    config.bookingUpdateResult = {
      "series-child": {
        id: "series-child",
        currency: "ZAR",
        customer_id: "cust1",
        customer_package_entitlement_id: null,
      },
    };

    const { GET } = await import("../route");
    const res = await GET(
      new NextRequest("https://app.example.com/api/cron/expire-stale-pending-bookings"),
    );
    const body = await res.json();

    expect(body.pre_slot.expired).toBe(0);
    expect(mockSettleBookingFinanceById).not.toHaveBeenCalled();
    expect(mockSendCancellationNotification).not.toHaveBeenCalled();
  });

  it("does not janitor-cancel a leftover pending series visit", async () => {
    mockVerifyCronRequest.mockReturnValue({ valid: true });
    config.janitorBookings = [{ id: "series-late", recurring_series_id: "series-1" }];
    config.bookingUpdateResult = {
      "series-late": {
        id: "series-late",
        currency: "ZAR",
        customer_id: "cust1",
        customer_package_entitlement_id: null,
      },
    };

    const { GET } = await import("../route");
    const res = await GET(
      new NextRequest("https://app.example.com/api/cron/expire-stale-pending-bookings"),
    );
    const body = await res.json();

    expect(body.janitor.bookings_expired).toBe(0);
    expect(body.janitor.bookings_skipped).toBe(1);
    expect(mockSettleBookingFinanceById).not.toHaveBeenCalled();
  });
});
