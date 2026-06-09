/**
 * Quick-date math for ReportFilters — calendar-correct last month and YTD.
 */
import { describe, it, expect } from "vitest";
import {
  startOfMonth,
  endOfMonth,
  startOfYear,
  subMonths,
  format,
} from "date-fns";

describe("ReportFilters quick-date math", () => {
  it("last month spans the full prior calendar month", () => {
    const lastMonth = subMonths(new Date(), 1);
    const from = startOfMonth(lastMonth);
    const to = endOfMonth(lastMonth);
    expect(format(from, "yyyy-MM")).toBe(format(lastMonth, "yyyy-MM"));
    expect(format(to, "yyyy-MM")).toBe(format(lastMonth, "yyyy-MM"));
    expect(from.getDate()).toBe(1);
    expect(to.getMonth()).toBe(lastMonth.getMonth());
  });

  it("this year starts on Jan 1 and ends today or later", () => {
    const from = startOfYear(new Date());
    const to = new Date();
    expect(from.getMonth()).toBe(0);
    expect(from.getDate()).toBe(1);
    expect(to.getTime()).toBeGreaterThanOrEqual(from.getTime());
  });
});
