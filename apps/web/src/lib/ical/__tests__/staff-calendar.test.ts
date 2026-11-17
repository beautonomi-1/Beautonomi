import { describe, expect, it } from "vitest";
import { generateStaffCalendar } from "../generator";

describe("generateStaffCalendar", () => {
  it("keeps a short client name and does not include the customer email", () => {
    const ics = generateStaffCalendar(
      [
        {
          id: "apt-1",
          booking_number: "B-100",
          scheduled_at: "2026-11-12T09:00:00.000Z",
          duration_minutes: 60,
          customer_name: "Ada Lovelace",
          service_title: "Cut",
          status: "confirmed",
        },
      ],
      "Sam Staff",
      "sam@salon.example",
    );

    expect(ics).toContain("Client: Ada L.");
    expect(ics).not.toContain("Ada Lovelace");
    expect(ics).not.toContain("ATTENDEE");
    expect(ics).toContain("MAILTO:sam@salon.example");
  });
});
