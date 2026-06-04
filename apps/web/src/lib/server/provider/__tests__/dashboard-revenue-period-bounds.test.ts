import { describe, expect, it } from "vitest";
import { dateRangeBoundsUtc, formatDateYmd } from "@/lib/dates/provider-tz";
import { recognizedRevenueInRange } from "@/lib/reports/provider-revenue-semantics";
import { getDashboardRecognizedRevenueBounds } from "../dashboard-revenue-period-bounds";

describe("getDashboardRecognizedRevenueBounds", () => {
  it("caps today revenue at end of civil day in provider timezone", () => {
    const tz = "Africa/Johannesburg";
    const businessNow = new Date("2026-06-04T14:00:00.000Z");
    const startOfWeekLocal = new Date("2026-06-01T00:00:00");

    const { endOfToday } = getDashboardRecognizedRevenueBounds({
      timezone: tz,
      businessNow,
      startOfWeekLocal,
    });

    const todayYmd = formatDateYmd(businessNow, tz);
    const { fromIso } = dateRangeBoundsUtc(todayYmd, todayYmd, tz);
    const startOfToday = new Date(fromIso);

    const rows = [
      {
        transaction_type: "provider_earnings",
        amount: 100,
        net: 100,
        created_at: fromIso,
      },
      {
        transaction_type: "provider_earnings",
        amount: 50,
        net: 50,
        created_at: "2026-06-05T10:00:00.000Z",
      },
    ];

    const todayTotal = recognizedRevenueInRange(rows, {
      start: startOfToday,
      end: endOfToday,
    });

    expect(todayTotal).toBe(100);
    expect(endOfToday.getTime()).toBeGreaterThan(startOfToday.getTime());
  });
});
