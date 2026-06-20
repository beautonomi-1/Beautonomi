import { beforeEach, describe, expect, it, vi } from "vitest";
import { syncBookingAfterPaystackSuccess } from "../sync-booking-after-paystack-success";
import { getAppointmentSettingsFromDB } from "@/lib/provider-portal/appointment-settings";
import {
  notifyProviderNewBooking,
  notifyBookingConfirmed,
} from "@/lib/notifications/notification-service";

vi.mock("@/lib/provider-portal/appointment-settings", () => ({
  getAppointmentSettingsFromDB: vi.fn(),
}));

vi.mock("@/lib/notifications/notification-service", () => ({
  notifyProviderNewBooking: vi.fn(async () => ({ success: true })),
  notifyBookingConfirmed: vi.fn(async () => ({ success: true })),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

type BookingRow = {
  id: string;
  status: string;
  provider_id: string;
  total_amount: number;
  total_paid: number;
  total_refunded?: number;
  wallet_amount?: number;
  gift_card_amount?: number;
  payment_status: string;
  payment_date?: string | null;
  paid_at?: string | null;
  confirmed_at?: string | null;
  cancelled_at?: string | null;
};

function createAdminMock(row: BookingRow) {
  // The update chain must support BOTH shapes the implementation uses:
  //   - unconditional: update(patch).eq("id", id)                      (awaitable)
  //   - atomic claim:  update(patch).eq("id", id).eq("status", …).select("id")
  // So `.eq()` returns a chain that is itself awaitable, chainable, and selectable.
  const update = vi.fn(() => {
    const result = { data: [{ id: row.id }], error: null };
    const chain: Record<string, unknown> = {};
    chain.eq = vi.fn(() => chain);
    chain.select = vi.fn(async () => result);
    chain.then = (
      resolve: (v: typeof result) => unknown,
      reject?: (e: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject);
    return chain;
  });
  const from = vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({ data: row, error: null })),
      })),
    })),
    update,
  }));

  return {
    admin: { from },
    update,
  };
}

describe("syncBookingAfterPaystackSuccess", () => {
  it("moves paid pending_payment bookings back to pending when provider confirmation is required", async () => {
    vi.mocked(getAppointmentSettingsFromDB).mockResolvedValueOnce({
      defaultAppointmentStatus: "pending",
      autoConfirmAppointments: false,
      requireConfirmationForBookings: true,
      updatedAt: null,
    });
    const { admin, update } = createAdminMock({
      id: "booking-1",
      status: "pending_payment",
      provider_id: "provider-1",
      total_amount: 100,
      total_paid: 100,
      payment_status: "paid",
      payment_date: null,
      paid_at: null,
      confirmed_at: null,
      cancelled_at: null,
    });

    const result = await syncBookingAfterPaystackSuccess(admin as never, "booking-1", {
      paymentReference: "ref_123",
      paymentProvider: "paystack",
    });

    expect(result).toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "pending",
        payment_reference: "ref_123",
        payment_provider: "paystack",
        payment_date: expect.any(String),
        paid_at: expect.any(String),
      }),
    );
  });

  it("auto-confirms paid pending_payment bookings when provider confirmation is not required", async () => {
    vi.mocked(getAppointmentSettingsFromDB).mockResolvedValueOnce({
      defaultAppointmentStatus: "confirmed",
      autoConfirmAppointments: true,
      requireConfirmationForBookings: false,
      updatedAt: null,
    });
    const { admin, update } = createAdminMock({
      id: "booking-2",
      status: "pending_payment",
      provider_id: "provider-1",
      total_amount: 100,
      total_paid: 100,
      payment_status: "paid",
      payment_date: null,
      paid_at: null,
      confirmed_at: null,
      cancelled_at: null,
    });

    const result = await syncBookingAfterPaystackSuccess(admin as never, "booking-2");

    expect(result).toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "confirmed",
        confirmed_at: expect.any(String),
      }),
    );
  });

  it("repairs stale paid status when recorded coverage is only partial", async () => {
    vi.mocked(getAppointmentSettingsFromDB).mockResolvedValueOnce({
      defaultAppointmentStatus: "pending",
      autoConfirmAppointments: false,
      requireConfirmationForBookings: true,
      updatedAt: null,
    });
    const { admin, update } = createAdminMock({
      id: "booking-3",
      status: "pending_payment",
      provider_id: "provider-1",
      total_amount: 200,
      total_paid: 150,
      wallet_amount: 0,
      gift_card_amount: 0,
      payment_status: "paid",
      payment_date: null,
      paid_at: null,
      confirmed_at: null,
      cancelled_at: null,
    });

    const result = await syncBookingAfterPaystackSuccess(admin as never, "booking-3", {
      paymentReference: "ref_partial",
      paymentProvider: "paystack",
    });

    expect(result).toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_status: "partially_paid",
        status: "pending",
        payment_reference: "ref_partial",
        payment_provider: "paystack",
      }),
    );
  });

  it("fires deferred provider + confirmation notifications exactly once on the pending_payment transition", async () => {
    vi.mocked(getAppointmentSettingsFromDB).mockResolvedValueOnce({
      defaultAppointmentStatus: "confirmed",
      autoConfirmAppointments: true,
      requireConfirmationForBookings: false,
      updatedAt: null,
    });
    const { admin } = createAdminMock({
      id: "booking-notify",
      status: "pending_payment",
      provider_id: "provider-1",
      total_amount: 100,
      total_paid: 100,
      payment_status: "paid",
      payment_date: null,
      paid_at: null,
      confirmed_at: null,
      cancelled_at: null,
    });

    await syncBookingAfterPaystackSuccess(admin as never, "booking-notify");

    expect(notifyProviderNewBooking).toHaveBeenCalledTimes(1);
    expect(notifyBookingConfirmed).toHaveBeenCalledTimes(1);
    expect(notifyProviderNewBooking).toHaveBeenCalledWith("booking-notify", ["push"]);
  });

  it("does not fire deferred notifications when the booking was not pending_payment", async () => {
    vi.mocked(getAppointmentSettingsFromDB).mockResolvedValueOnce({
      defaultAppointmentStatus: "confirmed",
      autoConfirmAppointments: true,
      requireConfirmationForBookings: false,
      updatedAt: null,
    });
    const { admin } = createAdminMock({
      id: "booking-already-confirmed",
      status: "confirmed",
      provider_id: "provider-1",
      total_amount: 100,
      total_paid: 100,
      payment_status: "paid",
      payment_date: "2026-05-10T00:00:00.000Z",
      paid_at: "2026-05-10T00:00:00.000Z",
      confirmed_at: "2026-05-10T00:00:00.000Z",
      cancelled_at: null,
    });

    await syncBookingAfterPaystackSuccess(admin as never, "booking-already-confirmed", {
      paymentReference: "ref_x",
      paymentProvider: "paystack",
    });

    expect(notifyProviderNewBooking).not.toHaveBeenCalled();
    expect(notifyBookingConfirmed).not.toHaveBeenCalled();
  });

  it("does not flatten partially_refunded bookings back to paid", async () => {
    vi.mocked(getAppointmentSettingsFromDB).mockResolvedValueOnce({
      defaultAppointmentStatus: "confirmed",
      autoConfirmAppointments: true,
      requireConfirmationForBookings: false,
      updatedAt: null,
    });
    const { admin, update } = createAdminMock({
      id: "booking-4",
      status: "confirmed",
      provider_id: "provider-1",
      total_amount: 200,
      total_paid: 200,
      total_refunded: 50,
      wallet_amount: 0,
      gift_card_amount: 0,
      payment_status: "partially_refunded",
      payment_date: "2026-05-10T00:00:00.000Z",
      paid_at: "2026-05-10T00:00:00.000Z",
      confirmed_at: "2026-05-10T00:00:00.000Z",
      cancelled_at: null,
    } as BookingRow);

    const result = await syncBookingAfterPaystackSuccess(admin as never, "booking-4", {
      paymentReference: "ref_refunded",
      paymentProvider: "paystack",
    });

    expect(result).toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith(
      expect.not.objectContaining({
        payment_status: "paid",
      }),
    );
  });
});
