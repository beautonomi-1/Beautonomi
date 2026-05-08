import { datesInRange, weekStartsInRange, applyEffectiveShiftHours } from "@/features/calendar/utils/dateRange";
import type { StaffMemberWithHours, StaffShift } from "@/features/calendar/utils/dateRange";

describe("datesInRange", () => {
  it("returns correct count for a week", () => {
    const dates = datesInRange("2026-05-04", "2026-05-10");
    expect(dates).toHaveLength(7);
    expect(dates[0]).toBe("2026-05-04");
    expect(dates[6]).toBe("2026-05-10");
  });

  it("returns single day for same from and to", () => {
    expect(datesInRange("2026-05-08", "2026-05-08")).toHaveLength(1);
  });

  it("returns empty for invalid dates", () => {
    expect(datesInRange("bad", "2026-05-08")).toHaveLength(0);
  });
});

describe("weekStartsInRange", () => {
  it("returns one monday for a short range starting in the same week", () => {
    const starts = weekStartsInRange("2026-05-06", "2026-05-08");
    expect(starts.length).toBeGreaterThanOrEqual(1);
    starts.forEach((s) => {
      const d = new Date(s);
      expect(d.getDay()).toBe(1);
    });
  });

  it("returns 2 mondays for a 2-week span", () => {
    const starts = weekStartsInRange("2026-05-04", "2026-05-17");
    expect(starts.length).toBe(2);
  });
});

describe("applyEffectiveShiftHours", () => {
  const member: StaffMemberWithHours = {
    id: "s1",
    name: "Alice",
    working_hours: {
      thursday: { open: "09:00", close: "17:00", is_open: true },
    },
  };

  it("returns members unchanged when shifts is null", () => {
    const result = applyEffectiveShiftHours([member], null, "2026-05-07", "2026-05-07", "all");
    expect(result[0]?.working_hours?.thursday).toEqual(member.working_hours?.thursday);
  });

  it("extends close time when shift ends later than working_hours", () => {
    const shift: StaffShift = {
      date: "2026-05-07",
      team_member_id: "s1",
      start_time: "09:00",
      end_time: "19:00",
    };
    const result = applyEffectiveShiftHours([member], [shift], "2026-05-07", "2026-05-07", "all");
    expect(result[0]?.working_hours?.thursday?.close).toBe("19:00");
  });

  it("extends open time when shift starts earlier than working_hours", () => {
    const shift: StaffShift = {
      date: "2026-05-07",
      team_member_id: "s1",
      start_time: "07:00",
      end_time: "17:00",
    };
    const result = applyEffectiveShiftHours([member], [shift], "2026-05-07", "2026-05-07", "all");
    expect(result[0]?.working_hours?.thursday?.open).toBe("07:00");
  });

  it("ignores shifts for a different staff member when staffFilter is set", () => {
    const shift: StaffShift = {
      date: "2026-05-07",
      team_member_id: "s2",
      start_time: "07:00",
      end_time: "19:00",
    };
    const result = applyEffectiveShiftHours([member], [shift], "2026-05-07", "2026-05-07", "s1");
    expect(result[0]?.working_hours?.thursday?.open).toBe("09:00");
    expect(result[0]?.working_hours?.thursday?.close).toBe("17:00");
  });
});
