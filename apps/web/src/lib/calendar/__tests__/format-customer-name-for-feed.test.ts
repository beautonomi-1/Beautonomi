import { describe, expect, it } from "vitest";
import {
  formatCalendarEventSummary,
  formatCustomerNameForCalendarFeed,
} from "../format-customer-name-for-feed";

describe("formatCustomerNameForCalendarFeed", () => {
  it("returns first name and last initial", () => {
    expect(formatCustomerNameForCalendarFeed("Thandi Mokoena")).toBe("Thandi M.");
  });

  it("returns single name unchanged", () => {
    expect(formatCustomerNameForCalendarFeed("Thandi")).toBe("Thandi");
  });
});

describe("formatCalendarEventSummary", () => {
  it("combines masked name and booking number", () => {
    expect(
      formatCalendarEventSummary({
        customerFullName: "Thandi Mokoena",
        bookingNumber: "BK-1234",
      }),
    ).toBe("Thandi M. - BK-1234");
  });
});
