import { parseCalendarDateParam } from "@/lib/calendar-parse";

describe("parseCalendarDateParam", () => {
  it("parses YYYY-MM-DD without TZ as local calendar date", () => {
    const d = parseCalendarDateParam("2026-05-08", null);
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(4);
    expect(d!.getDate()).toBe(8);
  });
});
