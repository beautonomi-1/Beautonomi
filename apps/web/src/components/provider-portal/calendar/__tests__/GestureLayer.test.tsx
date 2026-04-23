import { describe, expect, it, vi } from "vitest";
import React from "react";
import { render } from "@testing-library/react";

// §Calendar-hours: avoid pulling in @dnd-kit + its context by replacing the
// droppable wrapper with a plain <div> that forwards its className + children
// for shading assertions.
vi.mock("@/components/provider-portal/DragDropCalendar", () => ({
  DroppableTimeSlot: ({
    className,
    children,
    time,
  }: {
    className?: string;
    children?: React.ReactNode;
    time?: string;
  }) => (
    <div data-testid={`slot-${time}`} className={className}>
      {children}
    </div>
  ),
}));

import { GestureLayer } from "../GestureLayer";

const baseProps = {
  timeSlots: ["08:00", "09:00", "10:00", "11:00"],
  date: new Date("2026-04-20T12:00:00Z"),
  dateStr: "2026-04-20",
  staffId: "s1",
  useMangomintMode: false,
  highContrast: false,
  workStart: 8,
  workEnd: 20,
  onTimeSlotClick: () => {},
};

describe("GestureLayer shading", () => {
  it("keeps the 09:00 row clickable when the location opens at 09:30 (sub-hour open)", () => {
    const { getByTestId } = render(
      <GestureLayer
        {...baseProps}
        locationOperatingHours={{
          monday: { open: "09:30", close: "17:00", closed: false },
          sunday: { open: "00:00", close: "00:00", closed: true },
        } as any}
      />,
    );

    const nineRow = getByTestId("slot-09:00");
    expect(nineRow.className).toContain("cursor-pointer");
    expect(nineRow.className).not.toContain("cursor-not-allowed");

    const eightRow = getByTestId("slot-08:00");
    expect(eightRow.className).toContain("cursor-not-allowed");
  });

  it("renders overnight shifts as open on the wrap-around day", () => {
    const overnightWeekly = {
      sunday: { open: "22:00", close: "02:00", closed: false },
      monday: { open: "00:00", close: "00:00", closed: true },
    } as const;

    const mondayTwoAm = new Date("2026-04-20T12:00:00Z");
    const { getByTestId } = render(
      <GestureLayer
        {...baseProps}
        timeSlots={["00:00", "01:00", "02:00", "03:00"]}
        date={mondayTwoAm}
        dateStr="2026-04-20"
        locationOperatingHours={overnightWeekly as any}
      />,
    );

    const oneAm = getByTestId("slot-01:00");
    expect(oneAm.className).toContain("cursor-pointer");
    expect(oneAm.className).not.toContain("cursor-not-allowed");

    const threeAm = getByTestId("slot-03:00");
    expect(threeAm.className).toContain("cursor-not-allowed");
  });
});
