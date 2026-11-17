import { describe, expect, it } from "vitest";
import { evaluateCustomerReschedule } from "@/lib/bookings/reschedule-core";
import type { CancellationPolicy } from "@/lib/bookings/cancellation-policy";

const live24: CancellationPolicy = {
  id: "p1",
  provider_id: "prov",
  location_type: "at_salon",
  hours_before_cutoff: 24,
  grace_window_minutes: 15,
  policy_text: "",
  late_cancellation_type: "partial_refund",
  is_active: true,
  refund_percentage: 50,
  fee_amount: 0,
  fee_type: "fixed",
};

function baseBooking(overrides: Partial<Parameters<typeof evaluateCustomerReschedule>[0]> = {}) {
  return {
    id: "b1",
    status: "confirmed",
    payment_status: "paid",
    current_stage: null,
    created_at: "2026-01-01T10:00:00.000Z",
    scheduled_at: "2026-06-01T14:00:00.000Z",
    location_type: "at_salon" as const,
    cancellation_policy_snapshot: null,
    ...overrides,
  };
}

describe("evaluateCustomerReschedule", () => {
  it("allows reschedule inside grace within the cutoff window", () => {
    const now = new Date("2026-01-01T10:05:00.000Z");
    const result = evaluateCustomerReschedule(
      baseBooking({
        created_at: "2026-01-01T10:00:00.000Z",
        scheduled_at: "2026-01-01T12:00:00.000Z",
      }),
      live24,
      now,
    );
    expect(result.allowed).toBe(true);
  });

  it("blocks inside cutoff after grace", () => {
    const now = new Date("2026-05-31T20:00:00.000Z");
    const result = evaluateCustomerReschedule(baseBooking(), live24, now);
    expect(result.allowed).toBe(false);
    expect(result.code).toBe("CUSTOMER_RESCHEDULE_CUTOFF");
  });

  it("does not allow grace after scheduled_at", () => {
    const now = new Date("2026-06-01T14:05:00.000Z");
    const result = evaluateCustomerReschedule(
      baseBooking({
        created_at: "2026-06-01T13:55:00.000Z",
        scheduled_at: "2026-06-01T14:00:00.000Z",
      }),
      live24,
      now,
    );
    expect(result.allowed).toBe(false);
    expect(result.code).toBe("CUSTOMER_RESCHEDULE_STARTED");
  });

  it("allows until start when hours_before_cutoff is 0", () => {
    const policy = { ...live24, hours_before_cutoff: 0 };
    const now = new Date("2026-06-01T13:30:00.000Z");
    const result = evaluateCustomerReschedule(baseBooking(), policy, now);
    expect(result.allowed).toBe(true);
  });

  it("uses merged snapshot hours (24) when live is 48", () => {
    const now = new Date("2026-05-31T12:00:00.000Z");
    const live48 = { ...live24, hours_before_cutoff: 48 };
    const result = evaluateCustomerReschedule(
      baseBooking({
        cancellation_policy_snapshot: { hours_before_cutoff: 24 },
      }),
      live48,
      now,
    );
    expect(result.allowed).toBe(true);
  });

  it("allows before start when no live policy and no snapshot", () => {
    const now = new Date("2026-05-01T12:00:00.000Z");
    expect(evaluateCustomerReschedule(baseBooking(), null, now).allowed).toBe(true);
  });

  it("blocks after start when no policy sources", () => {
    const now = new Date("2026-06-02T12:00:00.000Z");
    const result = evaluateCustomerReschedule(baseBooking(), null, now);
    expect(result.allowed).toBe(false);
    expect(result.code).toBe("CUSTOMER_RESCHEDULE_STARTED");
  });

  it.each(["checked_in", "waiting", "in_progress"])("blocks lifecycle status %s", (status) => {
    const result = evaluateCustomerReschedule(
      baseBooking({ status, current_stage: null }),
      live24,
      new Date("2026-05-01T12:00:00.000Z"),
    );
    expect(result.allowed).toBe(false);
  });

  it.each(["provider_on_way", "client_arrived"])("blocks journey stage %s", (stage) => {
    const result = evaluateCustomerReschedule(
      baseBooking({ status: "confirmed", current_stage: stage }),
      live24,
      new Date("2026-05-01T12:00:00.000Z"),
    );
    expect(result.allowed).toBe(false);
  });

  it("blocks unpaid pending_payment", () => {
    const result = evaluateCustomerReschedule(
      baseBooking({ status: "pending_payment", payment_status: "pending" }),
      live24,
      new Date("2026-05-01T12:00:00.000Z"),
    );
    expect(result.allowed).toBe(false);
    expect(result.code).toBe("CUSTOMER_RESCHEDULE_UNPAID");
  });

  it("allows paid pending_payment", () => {
    const result = evaluateCustomerReschedule(
      baseBooking({ status: "pending_payment", payment_status: "paid" }),
      live24,
      new Date("2026-05-01T12:00:00.000Z"),
    );
    expect(result.allowed).toBe(true);
  });
});