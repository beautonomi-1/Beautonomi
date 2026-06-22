import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

jest.mock("@expo/vector-icons", () => ({
  Ionicons: ({ name }: { name: string }) => {
    const { Text } = require("react-native");
    return <Text>{name}</Text>;
  },
}));

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "light" },
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

    // Period labels appear in both quick-jump tabs and section headers
    expect(screen.getAllByText("Morning").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Afternoon").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Evening").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("4 open")).toBeTruthy();
    expect(screen.getByText("2 open")).toBeTruthy();
    expect(screen.getByText("1 open")).toBeTruthy();
  });

  it("renders all slots inside a bounded scroll region when maxHeight is set (maxHeight is now a no-op, all slots always render)", () => {
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

  it("renders all 40+ slots without truncation (validates removal of slice(0,30) pattern)", () => {
    // 44 slots across all three periods — previously would have been cut at 30
    const rows = [
      ...slotRowsFromRange(7, 0, 20),   // 20 morning (07:00–11:45)
      ...slotRowsFromRange(12, 0, 12),  // 12 afternoon (12:00–14:45)
      ...slotRowsFromRange(17, 0, 12),  // 12 evening (17:00–19:45)
    ];
    expect(rows).toHaveLength(44);

    const screen = render(
      <BookingTimeSlotGrid rows={rows} selectedTime="" onSelectTime={jest.fn()} showLegend={false} showNextAvailable={false} />,
    );

    for (const row of rows) {
      expect(screen.getByText(row.time)).toBeTruthy();
    }
    // Specifically verify the 31st slot (07:30 + 30 * 15min = 15:00 range) also renders
    expect(screen.getByText("14:45")).toBeTruthy();
    expect(screen.getByText("19:45")).toBeTruthy();
  });

  it("shows period filter tabs when more than one period has slots", () => {
    const rows = [
      ...slotRowsFromRange(9, 0, 3),
      ...slotRowsFromRange(14, 0, 2),
      ...slotRowsFromRange(18, 0, 2),
    ];

    const screen = render(
      <BookingTimeSlotGrid rows={rows} selectedTime="" onSelectTime={jest.fn()} showLegend={false} showNextAvailable={false} />,
    );

    // Period labels appear in both the filter tabs and the section headers
    expect(screen.getAllByText("Morning").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Afternoon").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Evening").length).toBeGreaterThanOrEqual(2);
  });

  it("does not show period filter tabs when only one period has slots", () => {
    const rows = slotRowsFromRange(9, 0, 4);

    const screen = render(
      <BookingTimeSlotGrid rows={rows} selectedTime="" onSelectTime={jest.fn()} showLegend={false} showNextAvailable={false} />,
    );

    // With only one period, the tab row is hidden; "Morning" appears only once (section header)
    expect(screen.queryAllByText("Morning")).toHaveLength(1);
  });

  it("filters to a single period when a filter tab is pressed, and shows 'Show all times' to clear", () => {
    const rows = [
      ...slotRowsFromRange(9, 0, 3),
      ...slotRowsFromRange(14, 0, 2),
      ...slotRowsFromRange(18, 0, 2),
    ];

    const screen = render(
      <BookingTimeSlotGrid rows={rows} selectedTime="" onSelectTime={jest.fn()} showLegend={false} showNextAvailable={false} />,
    );

    // Tap the "Morning" filter tab
    const morningTabs = screen.getAllByText("Morning");
    fireEvent.press(morningTabs[0]!); // First one is the filter tab

    // Only morning slots should be visible
    expect(screen.getByText("09:00")).toBeTruthy();
    expect(screen.queryByText("14:00")).toBeNull();
    expect(screen.queryByText("18:00")).toBeNull();

    // "Show all times" clear button should appear
    expect(screen.getByText("Show all times")).toBeTruthy();
  });

  it("fires onSelectTime with haptics when an available slot is tapped", () => {
    const onSelectTime = jest.fn();
    const rows = slotRowsFromRange(9, 0, 4);

    const screen = render(
      <BookingTimeSlotGrid rows={rows} selectedTime="" onSelectTime={onSelectTime} showLegend={false} showNextAvailable={false} />,
    );

    fireEvent.press(screen.getByText("09:00"));
    expect(onSelectTime).toHaveBeenCalledWith("09:00");
  });

  it("does not fire onSelectTime when an unavailable slot is pressed", () => {
    const onSelectTime = jest.fn();
    const rows = [{ time: "09:00", available: false, reason: "Booked" }];

    const screen = render(
      <BookingTimeSlotGrid rows={rows} selectedTime="" onSelectTime={onSelectTime} showLegend={false} showNextAvailable={false} />,
    );

    fireEvent.press(screen.getByText("09:00"));
    expect(onSelectTime).not.toHaveBeenCalled();
  });

  it("shows empty state when there are no rows", () => {
    const screen = render(
      <BookingTimeSlotGrid rows={[]} selectedTime="" onSelectTime={jest.fn()} loading={false} />,
    );

    expect(screen.getByText("No times available for this date")).toBeTruthy();
  });

  it("shows loading skeleton when loading and no rows exist", () => {
    const screen = render(
      <BookingTimeSlotGrid rows={[]} selectedTime="" onSelectTime={jest.fn()} loading={true} />,
    );

    expect(screen.getByText("Loading times…")).toBeTruthy();
  });
});
