import React from "react";
import { render, waitFor, act } from "@testing-library/react-native";
import { Text, View, DeviceEventEmitter } from "react-native";
import { computeBusinessTodayAnchor, useBusinessToday } from "@/hooks/useBusinessToday";

jest.mock("expo-router", () => {
  const { useEffect } = require("react");
  return {
    useFocusEffect: (callback: () => void | (() => void)) => {
      useEffect(() => callback(), [callback]);
    },
  };
});

describe("computeBusinessTodayAnchor", () => {
  const SAST = "Africa/Johannesburg";

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns the provider business day when device clock differs from salon tz", () => {
    jest.setSystemTime(new Date("2026-06-10T23:30:00.000Z"));
    const { businessToday, businessTodayKey } = computeBusinessTodayAnchor(SAST);
    expect(businessTodayKey).toBe("2026-06-11");
    expect(businessToday.getFullYear()).toBe(2026);
    expect(businessToday.getMonth()).toBe(5);
    expect(businessToday.getDate()).toBe(11);
  });

  it("updates the key when the salon business day rolls over", () => {
    jest.setSystemTime(new Date("2026-06-10T12:00:00.000Z"));
    expect(computeBusinessTodayAnchor(SAST).businessTodayKey).toBe("2026-06-10");

    jest.setSystemTime(new Date("2026-06-10T23:30:00.000Z"));
    expect(computeBusinessTodayAnchor(SAST).businessTodayKey).toBe("2026-06-11");
  });
});

function Harness({ tz }: { tz?: string | null }) {
  const { businessTodayKey } = useBusinessToday(tz);
  return (
    <View>
      <Text testID="key">{businessTodayKey}</Text>
    </View>
  );
}

describe("useBusinessToday", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-06-10T12:00:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("refreshes when the app foreground event fires", async () => {
    const { getByTestId } = render(<Harness tz="Africa/Johannesburg" />);
    expect(getByTestId("key").props.children).toBe("2026-06-10");

    jest.setSystemTime(new Date("2026-06-10T23:30:00.000Z"));
    await act(async () => {
      DeviceEventEmitter.emit("beautonomi:app:focus");
    });

    await waitFor(() => {
      expect(getByTestId("key").props.children).toBe("2026-06-11");
    });
  });
});
