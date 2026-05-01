import {
  addDaysToYmd,
  calendarDaysBetweenYmd,
  expandTimeBlocksForCalendarRange,
  timeBlockAppliesOnDate,
  utcWeekdayFromYmd,
  type ExpandableTimeBlock,
} from "@/lib/expand-time-blocks";

describe("expand-time-blocks", () => {
  it("calendarDaysBetweenYmd is deterministic for civil dates", () => {
    expect(calendarDaysBetweenYmd("2026-04-01", "2026-04-01")).toBe(0);
    expect(calendarDaysBetweenYmd("2026-04-01", "2026-04-03")).toBe(2);
    expect(calendarDaysBetweenYmd("2026-04-03", "2026-04-01")).toBe(-2);
  });

  it("utcWeekdayFromYmd matches Sunday=0..Saturday=6", () => {
    expect(utcWeekdayFromYmd("2026-05-01")).toBe(5); // Friday
  });

  it("addDaysToYmd rolls month boundaries", () => {
    expect(addDaysToYmd("2026-04-30", 1)).toBe("2026-05-01");
  });

  it("non-recurring block applies only on exact date", () => {
    const b: ExpandableTimeBlock = {
      id: "t1",
      date: "2026-05-10",
      is_recurring: false,
      is_active: true,
    };
    expect(timeBlockAppliesOnDate(b, "2026-05-10")).toBe(true);
    expect(timeBlockAppliesOnDate(b, "2026-05-11")).toBe(false);
  });

  it("daily recurring respects interval", () => {
    const b: ExpandableTimeBlock = {
      id: "t2",
      date: "2026-05-01",
      is_recurring: true,
      is_active: true,
      recurring_pattern: { frequency: "daily", interval: 2 },
    };
    expect(timeBlockAppliesOnDate(b, "2026-05-01")).toBe(true);
    expect(timeBlockAppliesOnDate(b, "2026-05-02")).toBe(false);
    expect(timeBlockAppliesOnDate(b, "2026-05-03")).toBe(true);
  });

  it("weekly recurring matches anchor weekday", () => {
    const b: ExpandableTimeBlock = {
      id: "t3",
      date: "2026-05-01",
      is_recurring: true,
      is_active: true,
      recurring_pattern: { frequency: "weekly" },
    };
    expect(timeBlockAppliesOnDate(b, "2026-05-01")).toBe(true);
    expect(timeBlockAppliesOnDate(b, "2026-05-08")).toBe(true);
    expect(timeBlockAppliesOnDate(b, "2026-05-02")).toBe(false);
  });

  it("biweekly recurs every two weeks from anchor", () => {
    const b: ExpandableTimeBlock = {
      id: "t4",
      date: "2026-05-01",
      is_recurring: true,
      is_active: true,
      recurring_pattern: { frequency: "biweekly" },
    };
    expect(timeBlockAppliesOnDate(b, "2026-05-01")).toBe(true);
    expect(timeBlockAppliesOnDate(b, "2026-05-08")).toBe(false);
    expect(timeBlockAppliesOnDate(b, "2026-05-15")).toBe(true);
  });

  it("expandTimeBlocksForCalendarRange expands recurring rows per day", () => {
    const blocks: ExpandableTimeBlock[] = [
      {
        id: "rec-1",
        date: "2026-05-01",
        is_recurring: true,
        is_active: true,
        recurring_pattern: { frequency: "daily", interval: 1 },
      },
    ];
    const out = expandTimeBlocksForCalendarRange(blocks, "2026-05-01", "2026-05-03");
    expect(out).toHaveLength(3);
    expect(out.map((x) => x.date)).toEqual(["2026-05-01", "2026-05-02", "2026-05-03"]);
    expect(out[0]?.id).toMatch(/^rec-1__2026-05-01$/);
  });
});
