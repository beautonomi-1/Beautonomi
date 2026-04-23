import { describe, expect, it } from "vitest";
import { mergeOperatingHours, mergeStaffWorkingHours } from "../mergeOperatingHours";

describe("mergeOperatingHours", () => {
  it("returns null for no input / all invalid", () => {
    expect(mergeOperatingHours(null)).toBeNull();
    expect(mergeOperatingHours([])).toBeNull();
    expect(mergeOperatingHours([null, undefined, "nope" as unknown])).toBeNull();
  });

  it("takes the widest window across two locations", () => {
    const locA = { monday: { open: "09:00", close: "17:00" } };
    const locB = { monday: { open: "07:00", close: "15:00" } };
    const merged = mergeOperatingHours([locA, locB]);
    expect(merged?.monday).toEqual({ open: "07:00", close: "17:00", closed: false });
  });

  it("keeps a day open when at least one location opens", () => {
    const locA = { saturday: { closed: true, open: "00:00", close: "00:00" } };
    const locB = { saturday: { open: "10:00", close: "14:00" } };
    const merged = mergeOperatingHours([locA, locB]);
    expect(merged?.saturday).toEqual({ open: "10:00", close: "14:00", closed: false });
  });

  it("marks a day closed only when every location is closed", () => {
    const locA = { sunday: { closed: true } };
    const locB = { sunday: { is_open: false } };
    const merged = mergeOperatingHours([locA, locB]);
    expect(merged?.sunday).toEqual({ open: "00:00", close: "00:00", closed: true });
  });

  it("carries overnight ranges onto the following day", () => {
    const late = { friday: { open: "22:00", close: "03:00" } };
    const merged = mergeOperatingHours([late]);
    expect(merged?.friday).toEqual({ open: "22:00", close: "24:00", closed: false });
    expect(merged?.saturday).toEqual({ open: "00:00", close: "03:00", closed: false });
  });
});

describe("mergeStaffWorkingHours", () => {
  it("ignores members without working_hours", () => {
    expect(
      mergeStaffWorkingHours([
        { working_hours: undefined },
        { working_hours: null },
        { working_hours: {} },
      ]),
    ).toBeNull();
  });
  it("merges members that do have hours", () => {
    const merged = mergeStaffWorkingHours([
      { working_hours: { saturday: { open: "10:00", close: "14:00" } } },
      { working_hours: { saturday: { open: "12:00", close: "18:00" } } },
    ]);
    expect(merged?.saturday).toEqual({ open: "10:00", close: "18:00", closed: false });
  });
});
