import { describe, expect, it } from "vitest";
import {
  computeNoShowAvailableAt,
  resolveCancellationOutcome,
} from "../resolve-cancellation-outcome";
import type { BookingPaymentForRefundCap } from "../booking-refund-limits";

const baseBooking = {
  id: "b1",
  status: "confirmed",
  created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  scheduled_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
  location_type: "at_salon" as const,
  total_amount: 120,
  tip_amount: 20,
  total_paid: 100,
  total_refunded: 0,
};

const policy = {
  id: "p1",
  provider_id: "prov",
  location_type: null,
  hours_before_cutoff: 24,
  grace_window_minutes: 15,
  policy_text: "Standard",
  late_cancellation_type: "partial_refund" as const,
  is_active: true,
  refund_percentage: 50,
  fee_amount: 0,
  fee_type: "fixed" as const,
};

const platformPayment: BookingPaymentForRefundCap[] = [
  {
    id: "pay1",
    amount: 100,
    status: "completed",
    payment_provider: "paystack",
    payment_method: "card",
  },
];

describe("resolveCancellationOutcome matrix", () => {
  it("customer self-cancel excludes tip from fee basis", () => {
    const outcome = resolveCancellationOutcome({
      booking: baseBooking,
      payments: platformPayment,
      currentPolicy: policy,
      actor: "customer",
    });
    expect(outcome.allowed).toBe(true);
    expect(outcome.feeRetained + outcome.walletRefund).toBeLessThanOrEqual(100);
  });

  it("late self-cancel returns a paid tip in full and charges the fee on the service only", () => {
    const outcome = resolveCancellationOutcome({
      booking: {
        ...baseBooking,
        created_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
        scheduled_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        total_paid: 120,
      },
      payments: [{ ...platformPayment[0], amount: 120 }],
      currentPolicy: policy,
      actor: "customer",
    });
    expect(outcome.isLate).toBe(true);
    expect(outcome.feeRetained).toBe(50);
    expect(outcome.walletRefund).toBe(70);
  });

  it("in-person payment carries no fee and is returned by the provider", () => {
    const outcome = resolveCancellationOutcome({
      booking: {
        ...baseBooking,
        created_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
        scheduled_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      },
      payments: [{ ...platformPayment[0], payment_provider: "cash", payment_method: "cash" }],
      currentPolicy: policy,
      actor: "customer",
    });
    expect(outcome.feeRetained).toBe(0);
    expect(outcome.walletRefund).toBe(0);
    expect(outcome.inPersonRefundDue).toBe(100);
  });

  it("provider cancel waives penalty and refunds platform collected", () => {
    const outcome = resolveCancellationOutcome({
      booking: baseBooking,
      payments: platformPayment,
      currentPolicy: policy,
      actor: "provider",
    });
    expect(outcome.penaltyWaivedReason).toBe("provider_cancelled");
    expect(outcome.feeRetained).toBe(0);
    expect(outcome.walletRefund).toBe(100);
  });

  it("provider_rescheduled_at waives late fee for customer", () => {
    const lateNow = new Date(baseBooking.scheduled_at);
    lateNow.setHours(lateNow.getHours() - 1);
    const outcome = resolveCancellationOutcome({
      booking: {
        ...baseBooking,
        provider_rescheduled_at: new Date().toISOString(),
      },
      payments: platformPayment,
      currentPolicy: policy,
      actor: "customer",
      now: lateNow,
    });
    expect(outcome.penaltyWaivedReason).toBe("provider_rescheduled");
    expect(outcome.isLate).toBe(false);
  });

  it("no_show blocked before 10 minutes after start", () => {
    const scheduled = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const outcome = resolveCancellationOutcome({
      booking: { ...baseBooking, scheduled_at: scheduled, status: "confirmed" },
      payments: platformPayment,
      currentPolicy: policy,
      providerNoShow: { enabled: true, amount: 50 },
      actor: "no_show",
      now: new Date(),
    });
    expect(outcome.allowed).toBe(false);
    expect(outcome.blockCode).toBe("NO_SHOW_TOO_EARLY");
  });

  it("no_show allowed after window with fee capped to collected", () => {
    const scheduled = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const at = computeNoShowAvailableAt(scheduled);
    const outcome = resolveCancellationOutcome({
      booking: {
        ...baseBooking,
        scheduled_at: scheduled,
        status: "confirmed",
        cancellation_policy_snapshot: {
          no_show_fee_enabled: true,
          no_show_fee_amount: 200,
        },
      },
      payments: platformPayment,
      currentPolicy: policy,
      providerNoShow: { enabled: true, amount: 200 },
      actor: "no_show",
      now: new Date(at.getTime() + 1000),
    });
    expect(outcome.allowed).toBe(true);
    expect(outcome.feeRetained).toBe(100);
    expect(outcome.walletRefund).toBe(0);
  });

  it("portal actor mirrors customer blocking after appointment time", () => {
    const outcome = resolveCancellationOutcome({
      booking: baseBooking,
      payments: platformPayment,
      currentPolicy: policy,
      actor: "portal",
      now: new Date(baseBooking.scheduled_at),
    });
    expect(outcome.allowed).toBe(false);
  });

  it("admin cancel allows full platform refund", () => {
    const outcome = resolveCancellationOutcome({
      booking: { ...baseBooking, status: "in_progress" },
      payments: platformPayment,
      currentPolicy: policy,
      actor: "admin",
    });
    expect(outcome.allowed).toBe(true);
    expect(outcome.walletRefund).toBe(100);
  });
});
