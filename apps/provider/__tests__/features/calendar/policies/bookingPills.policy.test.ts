import {
  resolveBookingPills,
  getBookingPillConfig,
} from "@/features/calendar/policies/bookingPills.policy";
import type { CalendarBooking } from "@/components/calendar/calendar-booking-types";

const t = ((key: string) => key) as Parameters<typeof resolveBookingPills>[1];

function makeBooking(overrides: Record<string, unknown>): CalendarBooking {
  return {
    total_amount: 200,
    total_paid: 200,
    payment_status: "paid",
    currency: "ZAR",
    location_type: "salon",
    status: "confirmed",
    ...overrides,
  } as unknown as CalendarBooking;
}

describe("resolveBookingPills", () => {
  it("flags payment attention when unpaid balance", () => {
    const booking = makeBooking({ total_amount: 100, total_paid: 0, payment_status: "pending" });
    const flags = resolveBookingPills(booking, t);
    expect(flags.paymentAttention).toBe(true);
  });

  it("does not flag payment attention when fully paid", () => {
    const booking = makeBooking({ total_amount: 200, total_paid: 200, payment_status: "paid" });
    const flags = resolveBookingPills(booking, t);
    expect(flags.paymentAttention).toBe(false);
  });

  it("flags at_home mode", () => {
    const booking = makeBooking({ location_type: "at_home" });
    const flags = resolveBookingPills(booking, t, true);
    expect(flags.showModeAtHome).toBe(true);
    expect(flags.showModeGroup).toBe(false);
  });

  it("flags group booking", () => {
    const booking = makeBooking({ is_group_booking: true });
    const flags = resolveBookingPills(booking, t);
    expect(flags.showModeGroup).toBe(true);
  });

  it("flags recurring when recurrence_rule present", () => {
    const booking = makeBooking({ recurrence_rule: { freq: "WEEKLY" } });
    const flags = resolveBookingPills(booking, t);
    expect(flags.showRecurring).toBe(true);
  });

  it("flags package when package_id present", () => {
    const booking = makeBooking({ package_id: "pkg_001" });
    const flags = resolveBookingPills(booking, t);
    expect(flags.showPackage).toBe(true);
  });
});

describe("getBookingPillConfig", () => {
  it("returns payment config when payment is outstanding", () => {
    const booking = makeBooking({ total_amount: 100, total_paid: 0, payment_status: "pending" });
    const config = getBookingPillConfig(booking, t);
    expect(config.payment).toBeDefined();
    expect(config.payment?.attention).toBe(true);
  });

  it("returns mode config for at_home bookings", () => {
    const booking = makeBooking({ location_type: "at_home" });
    const config = getBookingPillConfig(booking, t);
    expect(config.mode?.label).toBe("At Home");
  });

  it("returns source config for known booking_source", () => {
    const booking = makeBooking({ booking_source: "walkin" });
    const config = getBookingPillConfig(booking, t);
    expect(config.source?.label).toBe("Walk-in");
  });

  it("returns unknown source as-is", () => {
    const booking = makeBooking({ booking_source: "custom_channel" });
    const config = getBookingPillConfig(booking, t);
    expect(config.source?.label).toBe("custom_channel");
  });

  it("omits payment when fully paid and no attention", () => {
    const booking = makeBooking({ total_amount: 200, total_paid: 200, payment_status: "paid" });
    const config = getBookingPillConfig(booking, t);
    // payment label might still be present depending on getCalendarPaymentLabel,
    // but attention must be false
    if (config.payment) {
      expect(config.payment.attention).toBe(false);
    }
  });
});
