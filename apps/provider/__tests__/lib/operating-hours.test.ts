import {
  mapWorkingHoursToSchedule,
  scheduleToWorkingHours,
  OPERATING_HOURS_DAYS,
} from "@/lib/operating-hours";

describe("mapWorkingHoursToSchedule", () => {
  it("returns sensible defaults when working_hours is empty or null", () => {
    const schedule = mapWorkingHoursToSchedule(null);
    expect(schedule).toHaveLength(7);
    expect(schedule[0]).toEqual({
      day: "Monday",
      is_open: true,
      open_time: "08:00",
      close_time: "18:00",
      breaks: [],
    });
    expect(schedule.every((d) => d.is_open === true)).toBe(true);
  });

  it("reads canonical Format A (is_open / open_time / close_time)", () => {
    const wh = {
      monday: { is_open: true, open_time: "07:30", close_time: "16:00" },
      tuesday: { is_open: false, open_time: "00:00", close_time: "00:00" },
    };
    const schedule = mapWorkingHoursToSchedule(wh);
    const monday = schedule.find((d) => d.day === "Monday");
    const tuesday = schedule.find((d) => d.day === "Tuesday");
    expect(monday?.is_open).toBe(true);
    expect(monday?.open_time).toBe("07:30");
    expect(monday?.close_time).toBe("16:00");
    expect(tuesday?.is_open).toBe(false);
  });

  it("reads onboarding Format B (open / close / closed)", () => {
    const wh = {
      monday: { open: "09:00", close: "20:00", closed: false },
      sunday: { open: "10:00", close: "16:00", closed: true },
    };
    const schedule = mapWorkingHoursToSchedule(wh);
    const monday = schedule.find((d) => d.day === "Monday");
    const sunday = schedule.find((d) => d.day === "Sunday");
    expect(monday).toMatchObject({
      is_open: true,
      open_time: "09:00",
      close_time: "20:00",
    });
    expect(sunday?.is_open).toBe(false);
    expect(sunday?.open_time).toBe("10:00");
    expect(sunday?.close_time).toBe("16:00");
  });

  it("prefers Format A keys when both are present (mixed save)", () => {
    const wh = {
      monday: {
        is_open: true,
        open_time: "06:00",
        close_time: "14:00",
        open: "09:00",
        close: "17:00",
        closed: false,
      },
    };
    const schedule = mapWorkingHoursToSchedule(wh);
    const monday = schedule.find((d) => d.day === "Monday");
    expect(monday?.open_time).toBe("06:00");
    expect(monday?.close_time).toBe("14:00");
  });

  it("treats `closed: true` as closed even with is_open absent", () => {
    const wh = {
      saturday: { open: "09:00", close: "13:00", closed: true },
    };
    const schedule = mapWorkingHoursToSchedule(wh);
    const saturday = schedule.find((d) => d.day === "Saturday");
    expect(saturday?.is_open).toBe(false);
  });

  it("preserves breaks array when present", () => {
    const wh = {
      monday: {
        is_open: true,
        open_time: "08:00",
        close_time: "18:00",
        breaks: [{ start: "12:00", end: "13:00" }],
      },
    };
    const schedule = mapWorkingHoursToSchedule(wh);
    const monday = schedule.find((d) => d.day === "Monday");
    expect(monday?.breaks).toEqual([{ start: "12:00", end: "13:00" }]);
  });
});

describe("scheduleToWorkingHours", () => {
  it("emits canonical Format A keyed by lower-case day names", () => {
    const schedule = mapWorkingHoursToSchedule(null);
    const wh = scheduleToWorkingHours(schedule);
    expect(Object.keys(wh).sort()).toEqual(
      [...OPERATING_HOURS_DAYS].map((d) => d.toLowerCase()).sort(),
    );
    expect(wh.monday).toEqual({
      is_open: true,
      open_time: "08:00",
      close_time: "18:00",
      breaks: [],
    });
  });
});
