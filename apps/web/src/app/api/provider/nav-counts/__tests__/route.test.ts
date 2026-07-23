import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockGetProviderIdForUser = vi.fn();
const mockGetSupabaseAdmin = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
    getProviderIdForUser: (...args: unknown[]) => mockGetProviderIdForUser(...args),
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: (...args: unknown[]) => mockGetSupabaseAdmin(...args),
}));

interface ChainState {
  filters: Record<string, unknown[]>;
  orFilters: string[];
}

/** Chainable count/select-query stub; resolves lazily via `.then` once awaited. */
function makeChain(resolveQuery: (state: ChainState) => { count?: number; data?: unknown; error: unknown }) {
  const state: ChainState = { filters: {}, orFilters: [] };
  const chain: any = {
    select: () => chain,
    eq: (col: string, value: unknown) => {
      (state.filters[col] ??= []).push(value);
      return chain;
    },
    in: (col: string, values: unknown[]) => {
      state.filters[`in:${col}`] = values;
      return chain;
    },
    gt: (col: string, value: unknown) => {
      state.filters[`gt:${col}`] = [value];
      return chain;
    },
    lt: (col: string, value: unknown) => {
      state.filters[`lt:${col}`] = [value];
      return chain;
    },
    not: (col: string, ...args: unknown[]) => {
      state.filters[`not:${col}`] = args;
      return chain;
    },
    or: (filter: string) => {
      state.orFilters.push(filter);
      return chain;
    },
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

interface Counts {
  pendingBookings: number;
  staleBookings: number;
  pendingGroupBookings: number;
  staleGroupBookings: number;
  waitingRoom: number;
  activeProductOrders: number;
  openReturnRequests: number;
  pendingCustomRequests: number;
  unreadConversations: Array<{ unread_count_provider: number }>;
}

function resolveTable(table: string, state: ChainState, counts: Counts) {
  if (table === "bookings") {
    if (state.filters["not:checked_in_time"]) return { count: counts.waitingRoom, error: null };
    if (state.filters["lt:scheduled_at"]) return { count: counts.staleBookings, error: null };
    return { count: counts.pendingBookings, error: null };
  }
  if (table === "group_bookings") {
    if (state.filters["lt:scheduled_at"]) return { count: counts.staleGroupBookings, error: null };
    return { count: counts.pendingGroupBookings, error: null };
  }
  if (table === "product_orders") return { count: counts.activeProductOrders, error: null };
  if (table === "conversations") return { data: counts.unreadConversations, error: null };
  if (table === "product_return_requests") return { count: counts.openReturnRequests, error: null };
  if (table === "custom_requests") return { count: counts.pendingCustomRequests, error: null };
  return { count: 0, error: null };
}

function makeAdmin(counts: Counts) {
  return {
    from(table: string) {
      return makeChain((state) => resolveTable(table, state, counts));
    },
  };
}

const DEFAULT_COUNTS: Counts = {
  pendingBookings: 0,
  staleBookings: 0,
  pendingGroupBookings: 0,
  staleGroupBookings: 0,
  waitingRoom: 0,
  activeProductOrders: 0,
  openReturnRequests: 0,
  pendingCustomRequests: 0,
  unreadConversations: [],
};

describe("GET /api/provider/nav-counts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "provider-user-1" } });
    mockGetProviderIdForUser.mockResolvedValue("provider-1");
  });

  it("returns 404 when the caller has no linked provider", async () => {
    mockGetProviderIdForUser.mockResolvedValue(null);
    mockGetSupabaseAdmin.mockReturnValue(makeAdmin(DEFAULT_COUNTS));

    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/provider/nav-counts"));
    expect(res.status).toBe(404);
  });

  it("reports stale_pending_bookings as a subset of pending_bookings without double-counting critical_total", async () => {
    mockGetSupabaseAdmin.mockReturnValue(
      makeAdmin({
        ...DEFAULT_COUNTS,
        pendingBookings: 5,
        staleBookings: 2,
        pendingGroupBookings: 1,
        staleGroupBookings: 1,
      }),
    );

    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/provider/nav-counts"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.pending_bookings).toBe(6);
    expect(body.data.stale_pending_bookings).toBe(3);
    // critical_total must not double-count stale_pending_bookings — it's already
    // included via pending_bookings.
    expect(body.data.critical_total).toBe(
      body.data.pending_bookings +
        body.data.active_product_orders +
        body.data.unread_messages +
        body.data.waiting_room +
        body.data.open_return_requests +
        body.data.pending_custom_requests,
    );
  });

  it("returns zero stale_pending_bookings when nothing is overdue", async () => {
    mockGetSupabaseAdmin.mockReturnValue(
      makeAdmin({ ...DEFAULT_COUNTS, pendingBookings: 3, pendingGroupBookings: 0 }),
    );

    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/provider/nav-counts"));
    const body = await res.json();

    expect(body.data.pending_bookings).toBe(3);
    expect(body.data.stale_pending_bookings).toBe(0);
  });

  it("scopes pending and stale counts by location_id when provided", async () => {
    const bookingOrCalls: string[] = [];
    const groupOrCalls: string[] = [];
    mockGetSupabaseAdmin.mockReturnValue({
      from(table: string) {
        return makeChain((state) => {
          if (table === "bookings") bookingOrCalls.push(...state.orFilters);
          if (table === "group_bookings") groupOrCalls.push(...state.orFilters);
          return resolveTable(table, state, {
            ...DEFAULT_COUNTS,
            pendingBookings: 2,
            staleBookings: 1,
            pendingGroupBookings: 1,
            staleGroupBookings: 0,
          });
        });
      },
    });

    const { GET } = await import("../route");
    const res = await GET(
      new NextRequest("http://localhost/api/provider/nav-counts?location_id=loc-branch-1"),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.pending_bookings).toBe(3);
    expect(body.data.stale_pending_bookings).toBe(1);
    expect(bookingOrCalls.length).toBe(2);
    expect(groupOrCalls.length).toBe(2);
    expect(bookingOrCalls.every((f) => f.includes("loc-branch-1") && f.includes("booking_source"))).toBe(
      true,
    );
    expect(groupOrCalls.every((f) => f.includes("loc-branch-1") && !f.includes("booking_source"))).toBe(
      true,
    );
  });
});
