import { describe, expect, it } from "vitest";
import { addDaysToYmd } from "@/lib/dates/provider-tz";

describe("provider-retail-takings date keys", () => {
  it("addDaysToYmd extends windows for 7-day retail week totals", () => {
    expect(addDaysToYmd("2026-06-01", 6)).toBe("2026-06-07");
  });
});
