import { describe, expect, it } from "vitest";
import {
  addBusinessMinutes,
  computeBookingEndAt,
  computeCloseOutAt,
  computeInLateWindow,
  computeNeedsCloseOut,
  computePendingExpireAt,
  getSuggestedCloseOutAction,
  isCustomerInitiatedOnlinePending,
  isExpiringSoonPending,
  isPendingExpireDue,
  resolveCustomerLifecycleHint,
  resolvePendingExpireDecision,
  resolveWorkingHoursDay,
} from "../lifecycle-deadlines";

const WEEKDAY_HOURS = {
  monday: { open: "09:00", close: "18:00", closed: false },
  tuesday: { open: "09:00", close: "18:00", closed: false },
  wednesday: { open: "09:00", close: "18:00", closed: false },
  thursday: { open: "09:00", close: "18:00", closed: false },
  friday: { open: "09:00", close: "18:00", closed: false },
  saturday: { open: "09:00", close: "14:00", closed: false },
  sunday: { closed: true },
};

describe("lifecycle-deadlines", () => {
  it("identifies customer-initiated online pending bookings", () => {
    expect(
      isCustomerInitiatedOnlinePending({
        status: "pending",
        bookingSource: "online",
        recurringSeriesId: null,
      }),
    ).toBe(true);
    expect(
      isCustomerInitiatedOnlinePending({
        status: "pending",
        bookingSource: "provider",
      }),
    ).toBe(false);
    expect(
      isCustomerInitiatedOnlinePending({
        status: "pending",
        bookingSource: "online",
        recurringSeriesId: "rec-1",
      }),
    ).toBe(false);
  });

  it("uses scheduled_end_at for endAt when present", () => {
    const endAt = computeBookingEndAt({
      scheduledAt: "2026-06-10T09:00:00.000Z",
      scheduledEndAt: "2026-06-10T10:30:00.000Z",
      durationMinutes: 60,
    });
    expect(endAt.toISOString()).toBe("2026-06-10T10:30:00.000Z");
  });

  it("falls back to duration when scheduled_end_at missing", () => {
    const endAt = computeBookingEndAt({
      scheduledAt: "2026-06-10T09:00:00.000Z",
      durationMinutes: 90,
    });
    expect(endAt.toISOString()).toBe("2026-06-10T10:30:00.000Z");
  });

  it("computes pre-slot expire-at with wall-clock when no working hours", () => {
    const createdAt = new Date("2026-06-10T08:00:00.000Z");
    const scheduledAt = new Date("2026-06-10T12:00:00.000Z");
    const expireAt = computePendingExpireAt({ createdAt, scheduledAt });
    expect(expireAt.toISOString()).toBe("2026-06-10T10:00:00.000Z");
  });

  it("clamps last-minute bookings to scheduled_at minus 15 minutes", () => {
    const createdAt = new Date("2026-06-10T11:50:00.000Z");
    const scheduledAt = new Date("2026-06-10T12:00:00.000Z");
    const expireAt = computePendingExpireAt({ createdAt, scheduledAt });
    expect(expireAt.toISOString()).toBe("2026-06-10T11:45:00.000Z");
  });

  it("counts SLA in business hours for overnight requests", () => {
    // Wednesday 23:00 SAST request for Thursday 09:00 slot.
    // SLA would be Thursday 11:00 SAST, but pre-slot cutoff (07:00 SAST) wins.
    const createdAt = new Date("2026-06-10T21:00:00.000Z");
    const scheduledAt = new Date("2026-06-11T07:00:00.000Z");
    const expireAt = computePendingExpireAt({
      createdAt,
      scheduledAt,
      workingHours: WEEKDAY_HOURS,
      timezone: "Africa/Johannesburg",
    });
    expect(expireAt.toISOString()).toBe("2026-06-11T05:00:00.000Z");
  });

  it("labels overnight SLA expiry as sla when the business-hours bound wins", () => {
    const createdAt = new Date("2026-06-10T21:00:00.000Z");
    const scheduledAt = new Date("2026-06-11T12:00:00.000Z");
    const decision = resolvePendingExpireDecision({
      createdAt,
      scheduledAt,
      workingHours: WEEKDAY_HOURS,
      timezone: "Africa/Johannesburg",
    });
    expect(decision.reason).toBe("sla");
    expect(decision.overnightOpenAt).not.toBeNull();
  });

  it("detects pending expiry due before slot plus one hour", () => {
    const expireAt = new Date("2026-06-10T10:00:00.000Z");
    const scheduledAt = new Date("2026-06-10T12:00:00.000Z");
    expect(
      isPendingExpireDue({
        now: new Date("2026-06-10T10:30:00.000Z"),
        expireAt,
        scheduledAt,
      }),
    ).toBe(true);
    expect(
      isPendingExpireDue({
        now: new Date("2026-06-10T13:30:00.000Z"),
        expireAt,
        scheduledAt,
      }),
    ).toBe(false);
  });

  it("flags expiring-soon pending within two hours", () => {
    const expireAt = new Date("2026-06-10T11:00:00.000Z");
    expect(
      isExpiringSoonPending({
        now: new Date("2026-06-10T09:30:00.000Z"),
        expireAt,
      }),
    ).toBe(true);
  });

  it("computes close-out grace by location type", () => {
    const endAt = new Date("2026-06-10T10:00:00.000Z");
    const salonCloseOut = computeCloseOutAt({ endAt, locationType: "at_salon" });
    const homeCloseOut = computeCloseOutAt({ endAt, locationType: "at_home" });
    expect(salonCloseOut.toISOString()).toBe("2026-06-10T10:20:00.000Z");
    expect(homeCloseOut.toISOString()).toBe("2026-06-10T10:30:00.000Z");
  });

  it("derives late window and close-out state", () => {
    const scheduledAt = new Date("2026-06-10T09:00:00.000Z");
    const endAt = new Date("2026-06-10T10:00:00.000Z");
    const graceMinutes = 20;

    expect(
      computeInLateWindow({
        now: new Date("2026-06-10T09:15:00.000Z"),
        scheduledAt,
        endAt,
        graceMinutes,
        status: "confirmed",
      }),
    ).toBe(true);

    expect(
      computeNeedsCloseOut({
        now: new Date("2026-06-10T10:25:00.000Z"),
        scheduledAt,
        endAt,
        graceMinutes,
        status: "confirmed",
      }),
    ).toBe(true);
  });

  it("maps customer lifecycle hints", () => {
    const scheduledAt = new Date("2026-06-10T09:00:00.000Z");
    const endAt = new Date("2026-06-10T10:00:00.000Z");
    const graceMinutes = 20;

    expect(
      resolveCustomerLifecycleHint({
        now: new Date("2026-06-10T08:30:00.000Z"),
        status: "confirmed",
        scheduledAt,
        endAt,
        graceMinutes,
      }),
    ).toBe("upcoming");

    expect(
      resolveCustomerLifecycleHint({
        now: new Date("2026-06-10T09:30:00.000Z"),
        status: "confirmed",
        scheduledAt,
        endAt,
        graceMinutes,
      }),
    ).toBe("late_window");

    expect(
      resolveCustomerLifecycleHint({
        now: new Date("2026-06-10T10:30:00.000Z"),
        status: "confirmed",
        scheduledAt,
        endAt,
        graceMinutes,
      }),
    ).toBe("awaiting_close_out");
  });

  it("suggests close-out actions by booking state", () => {
    expect(getSuggestedCloseOutAction({ status: "in_progress" })).toBe("complete");
    expect(
      getSuggestedCloseOutAction({
        status: "confirmed",
        locationType: "at_home",
        currentStage: "confirmed",
      }),
    ).toBe("provider_cancel");
    expect(getSuggestedCloseOutAction({ status: "confirmed" })).toBe("review");
  });

  it("resolves working hours day in format B", () => {
    const day = resolveWorkingHoursDay(WEEKDAY_HOURS, "monday");
    expect(day).toEqual({ open: true, openTime: "09:00", closeTime: "18:00" });
    expect(resolveWorkingHoursDay(WEEKDAY_HOURS, "sunday")).toBeNull();
  });

  it("adds business minutes across closed overnight gap", () => {
    const start = new Date("2026-06-10T21:00:00.000Z");
    const result = addBusinessMinutes(start, 120, WEEKDAY_HOURS, "Africa/Johannesburg");
    expect(result.toISOString()).toBe("2026-06-11T09:00:00.000Z");
  });
});
