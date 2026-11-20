import { buildOverviewDateRangeLabel, buildStatsReconciliationLine } from "@/lib/bookings-list-query";

describe("bookings list query i18n helpers", () => {
  const bl = (key: string, opts?: Record<string, unknown>) =>
    `${key}${opts ? JSON.stringify(opts) : ""}`;

  it("buildStatsReconciliationLine uses bl when provided", () => {
    const line = buildStatsReconciliationLine(
      {
        pending_count: 2,
        confirmed_count: 3,
        in_progress_count: 1,
        completed_count: 4,
        cancelled_count: 1,
        no_show_count: 0,
      },
      bl,
    );
    expect(line).toContain("statsLinePending");
    expect(line).toContain("statsLineExcludes");
  });

  it("buildOverviewDateRangeLabel uses bl for week and all", () => {
    expect(buildOverviewDateRangeLabel("all", "Africa/Johannesburg", { bl })).toContain("rangeAllTime");
    expect(buildOverviewDateRangeLabel("upcoming", "Africa/Johannesburg", { bl })).toContain("rangeUpcoming");
  });
});