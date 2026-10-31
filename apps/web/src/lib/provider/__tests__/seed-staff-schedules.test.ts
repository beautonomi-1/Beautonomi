import { describe, expect, it } from "vitest";
import { staffScheduleRowsFromLocationWorkingHours } from "../seed-staff-schedules";

describe("staffScheduleRowsFromLocationWorkingHours", () => {
  it("skips days with no key", () => {
    const rows = staffScheduleRowsFromLocationWorkingHours({
      monday: { open: "09:00", close: "17:00" },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].day_of_week).toBe(1);
    expect(rows[0].is_working).toBe(true);
  });

  it("writes closed row for explicit closed day", () => {
    const rows = staffScheduleRowsFromLocationWorkingHours({
      sunday: { closed: true },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].day_of_week).toBe(0);
    expect(rows[0].is_working).toBe(false);
  });

  it("does not insert is_working false for missing days", () => {
    const rows = staffScheduleRowsFromLocationWorkingHours({});
    expect(rows).toHaveLength(0);
  });
});
