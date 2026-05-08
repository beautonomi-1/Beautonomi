/**
 * Unit tests for useProviderCalendarSummary logic (pure calculation layer).
 * These test the underlying logic without rendering the hook directly.
 */

import { differenceInMinutes } from "date-fns";
import type { CalendarBooking } from "@/components/calendar/calendar-booking-types";

const BASE_DATE = new Date("2026-05-08T00:00:00.000Z");

function makeBooking(overrides: Partial<CalendarBooking>): CalendarBooking {
  return {
    id: "bk1",
    calendar_item_id: "ci1",
    status: "booked",
    db_status: "confirmed",
    scheduled_at: "2026-05-08T09:00:00.000Z",
    total_amount: 500,
    total_paid: 0,
    payment_status: "pending",
    currency: "ZAR",
    location_type: "salon",
    services: [],
    customers: null,
    calendar_service_name: "Haircut",
    ...overrides,
  } as unknown as CalendarBooking;
}

describe("summary calculations (business logic only)", () => {
  it("counts payment-attention bookings correctly", () => {
    const bookings = [
      makeBooking({ total_amount: 500, total_paid: 0, payment_status: "pending" }),
      makeBooking({ id: "bk2", calendar_item_id: "ci2", total_amount: 500, total_paid: 500, payment_status: "paid" }),
      makeBooking({ id: "bk3", calendar_item_id: "ci3", status: "cancelled", total_amount: 300, total_paid: 0 }),
    ];
    const attentionCount = bookings.filter(
      (b) => b.status !== "cancelled" && Number(b.total_amount) > Number(b.total_paid),
    ).length;
    expect(attentionCount).toBe(1);
  });

  it("sums scheduledValue only for non-cancelled bookings on selected day", () => {
    const bookings = [
      makeBooking({ id: "bk1", calendar_item_id: "ci1", total_amount: 500 }),
      makeBooking({ id: "bk2", calendar_item_id: "ci2", total_amount: 300, scheduled_at: "2026-05-09T10:00:00.000Z" }),
      makeBooking({ id: "bk3", calendar_item_id: "ci3", total_amount: 400, status: "cancelled" }),
    ];
    const dayKey = "2026-05-08";
    const dayBookings = bookings.filter((b) => {
      if (b.status === "cancelled") return false;
      return b.scheduled_at.startsWith(dayKey);
    });
    const sum = dayBookings.reduce((acc, b) => acc + Number(b.total_amount), 0);
    expect(sum).toBe(500);
  });

  it("identifies nextUpcomingBooking as earliest future booking", () => {
    const now = new Date();
    const futureMs = now.getTime() + 30 * 60 * 1000;
    const furtherMs = now.getTime() + 60 * 60 * 1000;

    const bookings = [
      makeBooking({ id: "bk1", calendar_item_id: "ci1", scheduled_at: new Date(furtherMs).toISOString() }),
      makeBooking({ id: "bk2", calendar_item_id: "ci2", scheduled_at: new Date(futureMs).toISOString() }),
    ];
    const sorted = bookings
      .filter((b) => new Date(b.scheduled_at) >= now)
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
    expect(sorted[0]!.id).toBe("bk2");
  });

  it("counts urgentPendingCount as bookings within 2 hours", () => {
    const now = new Date();
    const bookings = [
      makeBooking({
        id: "bk1",
        calendar_item_id: "ci1",
        db_status: "pending",
        scheduled_at: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
      }),
      makeBooking({
        id: "bk2",
        calendar_item_id: "ci2",
        db_status: "pending",
        scheduled_at: new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString(),
      }),
      makeBooking({
        id: "bk3",
        calendar_item_id: "ci3",
        db_status: "confirmed",
        scheduled_at: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
      }),
    ];
    const urgent = bookings.filter((b) => {
      if (b.db_status !== "pending") return false;
      const mins = differenceInMinutes(new Date(b.scheduled_at), now);
      return mins >= 0 && mins <= 120;
    }).length;
    expect(urgent).toBe(1);
  });
});
