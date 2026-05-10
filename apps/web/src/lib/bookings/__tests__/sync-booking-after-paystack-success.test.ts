import { describe, expect, it, vi } from "vitest";
import { syncBookingAfterPaystackSuccess } from "../sync-booking-after-paystack-success";
import { getAppointmentSettingsFromDB } from "@/lib/provider-portal/appointment-settings";

vi.mock("@/lib/provider-portal/appointment-settings", () => ({
  getAppointmentSettingsFromDB: vi.fn(),
}));

type BookingRow = {
  id: string;
  status: string;
  provider_id: string;
  total_amount: number;
  total_paid: number;
  wallet_amount?: number;
  gift_card_amount?: number;
  payment_status: string;
  payment_date?: string | null;
  paid_at?: string | null;
  confirmed_at?: string | null;
  cancelled_at?: string | null;
};

function createAdminMock(row: BookingRow) {
  const update = vi.fn((patch: Record<string, unknown>) => ({
    eq: vi.fn(async () => ({ data: null, error: null, patch })),
  }));
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
});
