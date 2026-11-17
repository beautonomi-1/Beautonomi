import { describe, expect, it } from "vitest";
import { mapAppointmentStatusFromBooking } from "./transform-bookings-to-calendar-appointments";

describe("mapAppointmentStatusFromBooking", () => {
  it("preserves salon lifecycle db_status values on appointments", () => {
    for (const db_status of ["checked_in", "waiting", "pending_payment"] as const) {
      const mapped = mapAppointmentStatusFromBooking({ status: "booked", db_status });
      expect(mapped.db_status).toBe(db_status);
    }
  });
});