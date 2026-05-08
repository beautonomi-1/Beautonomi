import { snapToIncrement, clampToGrid } from "@/features/calendar/utils/snapping";

describe("snapToIncrement", () => {
  it("snaps 62 minutes to 60 with 15-min increment", () => {
    expect(snapToIncrement(62, 15)).toBe(60);
  });

  it("snaps 0 to 0", () => {
    expect(snapToIncrement(0, 15)).toBe(0);
  });

  it("snaps 74 to 75", () => {
    expect(snapToIncrement(74, 15)).toBe(75);
  });
});

describe("clampToGrid", () => {
  it("clamps below startHour", () => {
    expect(clampToGrid(7 * 60, 8, 20)).toBe(8 * 60);
  });

  it("clamps above endHour", () => {
    expect(clampToGrid(21 * 60, 8, 20)).toBe(20 * 60);
  });

  it("returns value within range unchanged", () => {
    expect(clampToGrid(12 * 60, 8, 20)).toBe(12 * 60);
  });
});
