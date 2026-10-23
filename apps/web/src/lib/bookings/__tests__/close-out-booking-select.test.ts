import { describe, expect, it } from "vitest";
import {
  CLOSE_OUT_BOOKING_SELECT,
  mirrorOfferingAliasOnCloseOutRows,
} from "../close-out-booking-select";
import { filterBookingsByCalendarScope } from "@/lib/auth/calendar-scope";

describe("close-out booking select", () => {
  it("does not select bookings.staff_id at the top level", () => {
    const [bookingFields] = CLOSE_OUT_BOOKING_SELECT.split("booking_services(");
    expect(bookingFields).not.toContain("staff_id");
    expect(CLOSE_OUT_BOOKING_SELECT).toContain("booking_services(");
    expect(CLOSE_OUT_BOOKING_SELECT).toContain("staff_id");
  });

  it("mirrors offering onto offerings", () => {
    const rows = mirrorOfferingAliasOnCloseOutRows([
      {
        id: "b1",
        booking_services: [
          {
            staff_id: "s1",
            offering: { title: "Cut", duration_minutes: 30 },
          },
        ],
      },
    ]);
    expect(rows[0].booking_services?.[0].offerings?.title).toBe("Cut");
    expect(rows[0].booking_services?.[0].offering?.title).toBe("Cut");
  });

  it("scopes staff from booking_services when row has no top-level staff_id", () => {
    const rows = [
      {
        id: "mine",
        booking_services: [{ staff_id: "s1" }],
      },
      {
        id: "theirs",
        booking_services: [{ staff_id: "s2" }],
      },
    ];
    expect(filterBookingsByCalendarScope(rows, "own", "s1").map((r) => r.id)).toEqual([
      "mine",
    ]);
  });
});
