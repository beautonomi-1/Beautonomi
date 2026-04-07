import { describe, it, expect } from "vitest";
import { mergeUnionAnyStaffSlots } from "../merge-any-staff-slots";

describe("mergeUnionAnyStaffSlots", () => {
  it("returns empty when given no staff slot arrays", () => {
    expect(mergeUnionAnyStaffSlots([])).toEqual([]);
  });

  it("ORs availability for the same time key", () => {
    const a = [
      { time: "09:00", available: false, reason: "Busy" },
      { time: "10:00", available: true },
    ];
    const b = [
      { time: "09:00", available: true },
      { time: "10:00", available: false, reason: "Busy" },
    ];
    const merged = mergeUnionAnyStaffSlots([a, b]);
    const byTime = Object.fromEntries(merged.map((s) => [s.time, s]));
    expect(byTime["09:00"].available).toBe(true);
    expect(byTime["10:00"].available).toBe(true);
  });

  it("sorts times lexically (HH:MM)", () => {
    const merged = mergeUnionAnyStaffSlots([
      [
        { time: "11:00", available: true },
        { time: "09:00", available: true },
      ],
    ]);
    expect(merged.map((s) => s.time)).toEqual(["09:00", "11:00"]);
  });
});
