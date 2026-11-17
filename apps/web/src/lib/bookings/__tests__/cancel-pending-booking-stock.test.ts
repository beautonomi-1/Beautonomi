import { beforeEach, describe, expect, it, vi } from "vitest";

const restore = vi.fn(async () => undefined);
const settle = vi.fn(async () => ({ walletRefundAmount: 0 }));

vi.mock("@/lib/bookings/deduct-booking-retail-stock", () => ({
  restoreBookingRetailStock: (...args: unknown[]) => restore(...args),
}));
vi.mock("@/lib/bookings/settle-booking-cancellation", () => ({
  settleBookingFinanceById: (...args: unknown[]) => settle(...args),
}));
vi.mock("@/lib/bookings/notifications", () => ({
  sendCancellationNotification: vi.fn(async () => undefined),
}));
vi.mock("@/lib/waitlist/matching", () => ({
  matchWaitlistOnCancellation: vi.fn(async () => undefined),
}));
vi.mock("@/lib/analytics/amplitude/server", () => ({
  trackServer: vi.fn(async () => undefined),
}));

import {
  cancelPendingBookingRequest,
  retryPendingCancelProductStock,
} from "../cancel-pending-booking-request";
import { JANITOR_EXPIRY_REASON } from "../lifecycle-deadlines";

function adminForCancel() {
  const updates: Record<string, unknown>[] = [];
  const admin = {
    updates,
    from() {
      const payload: { current?: Record<string, unknown> } = {};
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = self;
      chain.eq = self;
      chain.limit = self;
      chain.update = (next: Record<string, unknown>) => {
        payload.current = next;
        updates.push(next);
        return chain;
      };
      chain.then = (resolve: (value: unknown) => unknown) =>
        resolve({
          data: payload.current?.status === "cancelled"
            ? [{ id: "booking-1", currency: "ZAR", customer_id: "cust-1", payment_status: "pending" }]
            : [{ id: "booking-1" }],
          error: null,
        });
      return chain;
    },
    rpc: async () => ({ data: null, error: null }),
  };
  return admin;
}

describe("pending booking expiry stock", () => {
  beforeEach(() => {
    restore.mockReset();
    settle.mockClear();
    restore.mockResolvedValue(undefined);
  });

  it("puts products back when a pending request expires", async () => {
    const admin = adminForCancel();

    const outcome = await cancelPendingBookingRequest(admin as never, "booking-1", {
      reason: "janitor",
      paymentStatus: "pending",
    });

    expect(outcome.ok).toBe(true);
    expect(restore).toHaveBeenCalledWith(admin, "booking-1");
    expect(settle).toHaveBeenCalledOnce();
    expect(admin.updates[0]).toMatchObject({
      status: "cancelled",
      cancellation_reason: JANITOR_EXPIRY_REASON,
    });
  });

  it("keeps the refund and marks the products still out when the return fails", async () => {
    restore.mockRejectedValueOnce(new Error("stock down"));
    const admin = adminForCancel();

    const outcome = await cancelPendingBookingRequest(admin as never, "booking-1", {
      reason: "janitor",
      paymentStatus: "paid",
    });

    expect(outcome.ok).toBe(true);
    expect(settle).toHaveBeenCalledOnce();
    expect(admin.updates[1]).toMatchObject({
      cancellation_reason: `${JANITOR_EXPIRY_REASON} — products still out`,
    });
  });

  it("puts the products back on a later sweep without refunding again", async () => {
    const updates: Record<string, unknown>[] = [];
    const admin = {
      from() {
        let payload: Record<string, unknown> | undefined;
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        chain.select = self;
        chain.eq = self;
        chain.like = self;
        chain.limit = self;
        chain.update = (next: Record<string, unknown>) => {
          payload = next;
          updates.push(next);
          return chain;
        };
        chain.then = (resolve: (value: unknown) => unknown) =>
          resolve({
            data: payload
              ? [{ id: "booking-1" }]
              : [
                  {
                    id: "booking-1",
                    cancellation_reason: `${JANITOR_EXPIRY_REASON} — products still out`,
                  },
                ],
            error: null,
          });
        return chain;
      },
    };

    const finished = await retryPendingCancelProductStock(admin as never);

    expect(finished).toBe(1);
    expect(restore).toHaveBeenCalledWith(admin, "booking-1");
    expect(settle).not.toHaveBeenCalled();
    expect(updates[0]).toMatchObject({ cancellation_reason: JANITOR_EXPIRY_REASON });
  });
});
