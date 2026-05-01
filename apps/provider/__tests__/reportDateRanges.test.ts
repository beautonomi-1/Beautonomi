import { getReportDateRange, resolveReportTimezone } from "../src/lib/reportDateRanges";

describe("reportDateRanges", () => {
  it("resolveReportTimezone matches web resolveTz spirit (invalid → regional default)", () => {
    expect(resolveReportTimezone("")).toBe("Africa/Johannesburg");
    expect(resolveReportTimezone(undefined)).toBe("Africa/Johannesburg");
    expect(resolveReportTimezone("Africa/Johannesburg")).toBe("Africa/Johannesburg");
  });

  it("today preset uses a single inclusive calendar day in business TZ", () => {
    const now = new Date("2025-03-10T12:00:00.000Z");
    const { from, to } = getReportDateRange("today", { now, timezone: "Africa/Johannesburg" });
    expect(from).toBe(to);
    expect(from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
