import React from "react";
import { render, act } from "@testing-library/react-native";
import { Text } from "react-native";

type ChangeRegistration = {
  table?: string;
  callback: () => void;
};

const mockRegistrations: ChangeRegistration[] = [];
const mockRemoveChannel = jest.fn();

jest.mock("@/lib/supabase/client", () => {
  const channel = {
    on: jest.fn((_event, config, callback) => {
      mockRegistrations.push({ table: config?.table, callback });
      return channel;
    }),
    subscribe: jest.fn(() => channel),
  };
  return {
    supabase: {
      channel: jest.fn(() => channel),
      removeChannel: mockRemoveChannel,
    },
  };
});

const { useCalendarBookingsRealtime } = require("@/hooks/useCalendarBookingsRealtime") as typeof import("@/hooks/useCalendarBookingsRealtime");

function Harness({
  focused = true,
  onBookings,
  onOverlays,
}: {
  focused?: boolean;
  onBookings: () => void;
  onOverlays?: () => void;
}) {
  useCalendarBookingsRealtime("provider-1", focused, onBookings, onOverlays);
  return <Text>calendar realtime</Text>;
}

describe("useCalendarBookingsRealtime", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockRegistrations.splice(0, mockRegistrations.length);
    mockRemoveChannel.mockClear();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("debounces booking and overlay refreshes separately", () => {
    const onBookings = jest.fn();
    const onOverlays = jest.fn();
    render(<Harness onBookings={onBookings} onOverlays={onOverlays} />);

    const booking = mockRegistrations.find((r) => r.table === "bookings");
    const timeBlock = mockRegistrations.find((r) => r.table === "time_blocks");
    expect(booking).toBeTruthy();
    expect(timeBlock).toBeTruthy();

    act(() => {
      booking?.callback();
      booking?.callback();
      timeBlock?.callback();
      timeBlock?.callback();
      jest.advanceTimersByTime(400);
    });
    expect(onBookings).toHaveBeenCalledTimes(1);
    expect(onOverlays).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(onOverlays).toHaveBeenCalledTimes(1);
  });

  it("subscribes to the overlay tables that feed calendar blocks", () => {
    render(<Harness onBookings={jest.fn()} onOverlays={jest.fn()} />);

    expect(mockRegistrations.map((r) => r.table)).toEqual(
      expect.arrayContaining([
        "time_blocks",
        "availability_blocks",
        "booking_holds",
        "staff_time_off",
        "staff_days_off",
        "staff_shifts",
        "staff_schedules",
      ]),
    );
  });
});
