import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PATCH } from "../route";
import { mockUser } from "@/lib/test-utils/setup";

const bookingId = "a330b218-bf2b-414d-86dc-e669fa03f776";
const bookingUpdates: Record<string, unknown>[] = [];
let bookingUpdateError: { code?: string; message?: string } | null = null;

const currentBooking = {
  id: bookingId,
  provider_id: "prov-test-1",
  customer_id: "cust-1",
  status: "confirmed",
  version: 2,
  location_type: "at_salon",
  scheduled_at: "2026-10-23T10:00:00.000Z",
  subtotal: 200,
  tax_amount: 30,
  total_amount: 250,
  cancellation_fee: 0,
  currency: "ZAR",
  tenant_id: "test-tenant-id",
};

vi.mock("@/lib/supabase/server", () => ({ getSupabaseServer: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: vi.fn() }));

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return { ...actual, getProviderIdForUser: vi.fn().mockResolvedValue("prov-test-1") };
});

vi.mock("@/lib/auth/requirePermission", () => ({
  requirePermission: vi.fn(async () => ({ authorized: true, user: mockUser })),
  requireAnyPermission: vi.fn(async () => ({ authorized: true, user: mockUser })),
}));

vi.mock("@/lib/auth/calendar-scope", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/calendar-scope")>();
  return { ...actual, assertCalendarScopeAllowsBooking: vi.fn(async () => ({ allowed: true })) };
});

vi.mock("@/lib/tenant/resolve-tenant-from-db", () => ({
  resolveTenantIdWithZaFallback: vi.fn().mockResolvedValue("test-tenant-id"),
}));

vi.mock("@/lib/regions/config", () => ({
  getTenantRegionConfig: vi.fn().mockResolvedValue({ defaultCurrency: "ZAR" }),
}));

vi.mock("@/lib/provider-booking/booking-branch-access", () => ({
  assertProviderUserCanAccessBookingBranch: vi.fn().mockResolvedValue({ allowed: true }),
}));

vi.mock("@/lib/bookings/load-cancellation-outcome", () => ({
  loadCancellationOutcomeForBooking: vi.fn(async () => ({
    outcome: {
      allowed: true,
      isLate: false,
      feeRetained: 0,
      platformCollected: 0,
      inPersonCollected: 0,
      walletRefund: 0,
      inPersonRefundDue: 0,
      policy: null,
    },
  })),
}));

vi.mock("@/lib/bookings/settle-booking-cancellation", () => ({
  settleBookingCancellation: vi.fn(async () => ({
    walletRefundAmount: 0,
    cancellationFeeApplied: 0,
    terminalRefundDue: 0,
  })),
  settleBookingFinanceById: vi.fn(),
}));

vi.mock("@/lib/notifications/notification-service", () => new Proxy({}, {
  get: (_t, prop) => (prop === "then" ? undefined : vi.fn(async () => undefined)),
}));

vi.mock("@/lib/waitlist/matching", () => ({
  matchWaitlistOnCancellation: vi.fn(async () => undefined),
}));

/** Chainable PostgREST stand-in: every method returns the chain; awaiting resolves per table. */
function chainFor(table: string) {
  let isBookingUpdate = false;
  const resolveResult = () => {
    if (table === "bookings" && isBookingUpdate) {
      return bookingUpdateError
        ? { data: null, error: bookingUpdateError }
        : { data: [{ id: bookingId }], error: null };
    }
    if (table === "bookings") {
      return { data: { ...currentBooking, booking_services: [], booking_products: [] }, error: null };
    }
    return { data: null, error: null };
  };
  const chain: Record<string | symbol, unknown> = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") {
          return (resolve: (v: unknown) => void) => resolve(resolveResult());
        }
        return (...args: unknown[]) => {
          if (prop === "update" && table === "bookings") {
            isBookingUpdate = true;
            bookingUpdates.push(args[0] as Record<string, unknown>);
          }
          return chain;
        };
      },
    },
  );
  return chain;
}

function fakeClient() {
  return {
    from: vi.fn((table: string) => chainFor(table)),
    rpc: vi.fn(() => chainFor("rpc")),
  };
}

function cancelRequest() {
  return new NextRequest(`https://example.test/api/provider/bookings/${bookingId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "cancelled", cancellation_reason: "Client asked", version: 2 }),
  });
}

describe("PATCH /api/provider/bookings/[id] provider cancel", () => {
  beforeEach(async () => {
    bookingUpdates.length = 0;
    bookingUpdateError = null;
    const { getSupabaseServer } = await import("@/lib/supabase/server");
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    vi.mocked(getSupabaseServer).mockResolvedValue(fakeClient() as never);
    vi.mocked(getSupabaseAdmin).mockReturnValue(fakeClient() as never);
  });

  it("writes status + cancelled_by and leaves money columns out when the fee stays 0", async () => {
    const res = await PATCH(cancelRequest(), { params: Promise.resolve({ id: bookingId }) });

    const statusUpdate = bookingUpdates.find((u) => u.status === "cancelled");
    expect(statusUpdate).toBeDefined();
    expect(statusUpdate).toMatchObject({ status: "cancelled", cancelled_by: mockUser.id });
    expect(statusUpdate).not.toHaveProperty("total_amount");
    expect(statusUpdate).not.toHaveProperty("cancellation_fee");
    expect(res.status).toBe(200);
  });

  it("returns 409 BOOKING_DATA_INVALID when the update hits a check violation", async () => {
    bookingUpdateError = { code: "23514", message: "Service fee calculation validation failed" };

    const res = await PATCH(cancelRequest(), { params: Promise.resolve({ id: bookingId }) });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error.code).toBe("BOOKING_DATA_INVALID");
  });
});
