import { minuteToY, yToHourMinute } from "@/features/calendar/utils/positioning";

describe("calendar positioning", () => {
  const ctx = {
    startHour: 8,
    endHour: 20,
    slotHeightPerHour: 60,
    timeIncrementMinutes: 15,
    gridTopPadding: 16,
    staffHeaderHeight: 48,
    providerTimezone: "Africa/Johannesburg",
  };

  it("minuteToY places noon below headers", () => {
    const y = minuteToY(12, 0, ctx);
    expect(y).toBeGreaterThan(ctx.staffHeaderHeight + ctx.gridTopPadding);
  });

  it("yToHourMinute reads hour from absolute content Y", () => {
    const y = minuteToY(12, 0, ctx);
    const hm = yToHourMinute(y, ctx);
    expect(hm.hour).toBe(12);
  });
});
