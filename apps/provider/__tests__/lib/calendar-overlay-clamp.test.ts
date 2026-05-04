import { clampOverlayBlockToGrid } from "@/components/calendar/CalendarOverlayTimeBlock";

describe("clampOverlayBlockToGrid", () => {
  const base = {
    startHour: 8,
    endHour: 20,
    slotHeight: 60,
    gridTopPadding: 8,
    quarterHeight: 15,
  };

  it("clamps full-day staff block (00:00–23:59) to visible grid", () => {
    const out = clampOverlayBlockToGrid({
      startMin: 0,
      endMin: 23 * 60 + 59,
      ...base,
    });
    expect(out).not.toBeNull();
    expect(out!.top).toBe(8);
    expect(out!.height).toBe((21 - 8) * 60);
  });

  it("returns null when block ends before grid starts", () => {
    expect(
      clampOverlayBlockToGrid({
        startMin: 0,
        endMin: 7 * 60,
        ...base,
      }),
    ).toBeNull();
  });

  it("does not shift a noon block when it lies inside the grid", () => {
    const out = clampOverlayBlockToGrid({
      startMin: 12 * 60 + 30,
      endMin: 13 * 60,
      ...base,
    });
    expect(out).toEqual({
      top: 8 + (12.5 - 8) * 60,
      height: 0.5 * 60,
    });
  });
});
