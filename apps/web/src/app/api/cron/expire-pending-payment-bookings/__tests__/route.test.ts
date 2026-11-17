import { beforeEach, describe, expect, it, vi } from "vitest";

const release = vi.fn(async () => undefined);
const returnBorrowed = vi.fn(async () => undefined);
const notify = vi.fn(async () => undefined);
const finishTender = vi.fn(async () => ({ walletDone: true, giftDone: true }));

vi.mock("@/app/api/payments/webhook/_handlers/charge-success", () => ({
  finishFailedBookingTender: (...args: unknown[]) => finishTender(...args),
  PAYMENT_FAILED_REFUND_STILL_DUE: "Payment failed — refund still due",
}));

vi.mock("@/lib/cron-auth", () => ({
  verifyCronRequest: () => ({ valid: true }),
}));
vi.mock("@/lib/cron/locked-cron-route", () => ({
  runLockedCronRoute: async (_name: string, fn: () => Promise<Response>) => fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(),
}));
vi.mock("@/app/api/public/bookings/_helpers/release-booking-slot-after-payment-failure", () => ({
  releaseBookingSlotAfterPaymentFailure: (...args: unknown[]) => release(...args),
  PAYMENT_FAILURE_REFUND_STILL_DUE: " — refund still due",
}));
vi.mock("@/lib/bookings/reschedule-carry-over", () => ({
  returnBorrowedPackageSession: (...args: unknown[]) => returnBorrowed(...args),
  returnBorrowedSessionIfReleased: async (
    admin: {
      from: (table: string) => {
        select: (cols: string) => {
          eq: (col: string, value: string) => {
            maybeSingle: () => Promise<{ data: { customer_package_entitlement_id?: string | null } | null }>;
          };
        };
      };
    },
    booking: {
      id: string;
      customer_id: string | null;
      customer_package_entitlement_id?: string | null;
      rescheduled_from_booking_id?: string | null;
    },
    borrowedEntitlementId?: string | null,
  ) => {
    const entitlementId = booking.customer_package_entitlement_id;
    if (!booking.customer_id || !entitlementId) return;
    const borrowedHere = Boolean(borrowedEntitlementId) && entitlementId === borrowedEntitlementId;
    if (!booking.rescheduled_from_booking_id && !borrowedHere) return;
    const { data } = await admin.from("bookings").select("customer_package_entitlement_id").eq("id", booking.id).maybeSingle();
    if (data?.customer_package_entitlement_id) return;
    await returnBorrowed(admin, entitlementId, booking.customer_id);
  },
}));
vi.mock("@/lib/notifications/notification-service", () => ({
  notifyCustomerCheckoutNotCompleted: (...args: unknown[]) => notify(...args),
}));

function adminFor(
  booking: Record<string, unknown> | null,
  entitlementAfter: string | null,
  refundRows: unknown[] = [],
  chargeRows: unknown[] = [],
  status = "cancelled",
) {
  let listed = false;
  return {
    from() {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      let cols = "";
      let clearingCharge = false;
      chain.select = (columns?: string) => {
        cols = String(columns ?? "");
        return chain;
      };
      chain.update = (payload: Record<string, unknown>) => {
        clearingCharge = payload.cancellation_reason === "Payment failed";
        return chain;
      };
      chain.eq = self;
      chain.not = self;
      chain.lt = self;
      chain.like = self;
      chain.order = self;
      chain.limit = self;
      chain.maybeSingle = async () => ({
        data: { customer_package_entitlement_id: entitlementAfter, status },
        error: null,
      });
      chain.then = (resolve: (value: unknown) => unknown) => {
        if (clearingCharge) {
          clearingCharge = false;
          return resolve({ data: [{ id: "booking-1" }], error: null });
        }
        if (cols.includes("wallet_amount")) {
          return resolve({ data: chargeRows, error: null });
        }
        if (cols.includes("cancellation_reason")) {
          return resolve({ data: refundRows, error: null });
        }
        if (!listed) {
          listed = true;
          return resolve({ data: booking ? [booking] : [], error: null });
        }
        return resolve({ data: [], error: null });
      };
      return chain;
    },
  };
}

describe("expire pending payment bookings", () => {
  beforeEach(() => {
    release.mockReset();
    returnBorrowed.mockReset();
    notify.mockReset();
    finishTender.mockReset();
    finishTender.mockResolvedValue({ walletDone: true, giftDone: true });
    release.mockResolvedValue(undefined);
  });

  it("puts a borrowed session back on the original visit when the replacement checkout expires", async () => {
    const admin = adminFor(
      {
        id: "booking-new",
        customer_id: "cust-1",
        customer_package_entitlement_id: "ent-1",
        rescheduled_from_booking_id: "booking-old",
      },
      null,
    );
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);
    const { GET } = await import("../route");

    const res = await GET(new Request("http://localhost/api/cron/expire-pending-payment-bookings") as never);
    const body = await res.json();

    expect(body.expired).toBe(1);
    expect(release).toHaveBeenCalledWith(admin, "booking-new", "cust-1");
    expect(returnBorrowed).toHaveBeenCalledWith(admin, "ent-1", "cust-1");
  });

  it("does not take a session back when the checkout was not a reschedule", async () => {
    const admin = adminFor(
      {
        id: "booking-1",
        customer_id: "cust-1",
        customer_package_entitlement_id: "ent-1",
        rescheduled_from_booking_id: null,
      },
      null,
    );
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);
    const { GET } = await import("../route");

    await GET(new Request("http://localhost/api/cron/expire-pending-payment-bookings") as never);

    expect(returnBorrowed).not.toHaveBeenCalled();
  });

  it("does not tell the customer the time is free when the visit stays open", async () => {
    release.mockResolvedValue(false);
    const admin = adminFor(
      {
        id: "booking-1",
        customer_id: "cust-1",
        customer_package_entitlement_id: null,
        rescheduled_from_booking_id: null,
      },
      null,
      [],
      [],
      "pending_payment",
    );
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);
    const { GET } = await import("../route");

    const res = await GET(new Request("http://localhost/api/cron/expire-pending-payment-bookings") as never);
    const body = await res.json();

    expect(body.expired).toBe(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it("tells the customer the time is free when the visit was cancelled and the refund is still due", async () => {
    release.mockResolvedValue(false);
    const admin = adminFor(
      {
        id: "booking-1",
        customer_id: "cust-1",
        customer_package_entitlement_id: null,
        rescheduled_from_booking_id: null,
      },
      null,
      [],
      [],
      "cancelled",
    );
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);
    const { GET } = await import("../route");

    const res = await GET(new Request("http://localhost/api/cron/expire-pending-payment-bookings") as never);
    const body = await res.json();

    expect(body.expired).toBe(1);
    expect(notify).toHaveBeenCalledWith("booking-1", ["push", "email"]);
  });

  it("puts the borrowed session back when the time could not be released", async () => {
    release.mockRejectedValueOnce(new Error("stock down"));
    const admin = adminFor(
      {
        id: "booking-new",
        customer_id: "cust-1",
        customer_package_entitlement_id: "ent-1",
        rescheduled_from_booking_id: "booking-old",
      },
      null,
    );
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);
    const { GET } = await import("../route");

    const res = await GET(new Request("http://localhost/api/cron/expire-pending-payment-bookings") as never);
    const body = await res.json();

    expect(body.expired).toBe(0);
    expect(returnBorrowed).toHaveBeenCalledOnce();
    expect(notify).not.toHaveBeenCalled();
  });

  it("finishes a wallet refund that was still due after the visit was released", async () => {
    release.mockResolvedValue(true);
    const admin = adminFor(null, null, [
      {
        id: "booking-1",
        customer_id: "cust-1",
        cancellation_reason:
          "Payment could not be started — slot released so you can try again — refund still due",
      },
    ]);
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);
    const { GET } = await import("../route");

    const res = await GET(new Request("http://localhost/api/cron/expire-pending-payment-bookings") as never);
    const body = await res.json();

    expect(body.expired).toBe(0);
    expect(body.refund_retried).toBe(1);
    expect(release).toHaveBeenCalledWith(
      admin,
      "booking-1",
      "cust-1",
      "Payment could not be started — slot released so you can try again",
    );
    expect(notify).not.toHaveBeenCalled();
    expect(returnBorrowed).not.toHaveBeenCalled();
  });

  it("finishes a failed card payment refund on a later sweep", async () => {
    finishTender.mockResolvedValue({ walletDone: true, giftDone: true });
    const admin = adminFor(null, null, [], [
      {
        id: "booking-1",
        customer_id: "cust-1",
        booking_number: "BN-1",
        tenant_id: "tenant-1",
        provider_id: "prov-1",
        wallet_amount: 40,
        currency: "ZAR",
        cancellation_reason: "Payment failed — refund still due",
      },
    ]);
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);
    const { GET } = await import("../route");

    const res = await GET(new Request("http://localhost/api/cron/expire-pending-payment-bookings") as never);
    const body = await res.json();

    expect(body.charge_retried).toBe(1);
    expect(finishTender).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ booking_id: "booking-1", wallet_amount_applied: 40 }),
      expect.objectContaining({ customer_id: "cust-1", booking_number: "BN-1" }),
    );
    expect(release).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });
});
