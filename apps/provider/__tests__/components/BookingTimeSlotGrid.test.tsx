import React from "react";
import { render } from "@testing-library/react-native";

jest.mock("@expo/vector-icons", () => ({
  Ionicons: ({ name }: { name: string }) => {
    const { Text } = require("react-native");
    return <Text>{name}</Text>;
  },
}));

import { BookingTimeSlotGrid } from "@/components/bookings/BookingDateTimePicker";

function slotRowsFromRange(startHour: number, startMinute: number, count: number, available = true) {
  return Array.from({ length: count }, (_, index) => {
    const totalMinutes = startHour * 60 + startMinute + index * 15;
    const hour = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    return {
      time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
      available,
    };
  });
}

describe("BookingTimeSlotGrid", () => {
  it("renders all morning slots without clipping when maxHeight is omitted", () => {
    const rows = [
      ...slotRowsFromRange(8, 0, 16),
      ...slotRowsFromRange(12, 0, 8),
      ...slotRowsFromRange(17, 0, 8),
    ];

    const screen = render(
      <BookingTimeSlotGrid rows={rows} selectedTime="" onSelectTime={jest.fn()} showNextAvailable={false} />,
    );

    expect(screen.getByText("08:00")).toBeTruthy();
    expect(screen.getByText("11:45")).toBeTruthy();
    expect(screen.getByText("12:00")).toBeTruthy();
    expect(screen.getByText("17:00")).toBeTruthy();
    expect(screen.getByText("18:45")).toBeTruthy();

    for (const row of rows) {
      expect(screen.getByText(row.time)).toBeTruthy();
    }
  });

  it("shows open counts per period", () => {
    const rows = [
      ...slotRowsFromRange(9, 0, 4, true),
      { time: "10:00", available: false, reason: "Booked" },
      ...slotRowsFromRange(14, 0, 2, true),
      ...slotRowsFromRange(18, 0, 1, true),
    ];

    const screen = render(
      <BookingTimeSlotGrid rows={rows} selectedTime="" onSelectTime={jest.fn()} showLegend={false} showNextAvailable={false} />,
    );

    expect(screen.getByText("Morning")).toBeTruthy();
    expect(screen.getByText("4 open")).toBeTruthy();
    expect(screen.getByText("2 open")).toBeTruthy();
    expect(screen.getByText("1 open")).toBeTruthy();
  });

  it("renders all slots inside a bounded scroll region when maxHeight is set", () => {
    const rows = slotRowsFromRange(8, 0, 20);

    const screen = render(
      <BookingTimeSlotGrid
        rows={rows}
        selectedTime=""
        onSelectTime={jest.fn()}
        maxHeight={420}
        showLegend={false}
        showNextAvailable={false}
      />,
    );

    expect(screen.getByText("08:00")).toBeTruthy();
    expect(screen.getByText("12:45")).toBeTruthy();
    for (const row of rows) {
      expect(screen.getByText(row.time)).toBeTruthy();
    }
  });
});
