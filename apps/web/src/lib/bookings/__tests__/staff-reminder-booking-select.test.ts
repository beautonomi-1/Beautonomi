import { describe, expect, it } from "vitest";
import { STAFF_REMINDER_BOOKING_SELECT } from "../staff-reminder-booking-select";

describe("staff reminder booking select", () => {
  it("does not select bookings.staff_id at the top level", () => {
    const [bookingFields, serviceFields] = STAFF_REMINDER_BOOKING_SELECT.split(
      "booking_services (",
    );
    expect(bookingFields).not.toContain("staff_id");
    expect(serviceFields).toContain("staff_id");
    expect(STAFF_REMINDER_BOOKING_SELECT).toContain(
      "offering:offerings!inner ( title )",
    );
  });
});
