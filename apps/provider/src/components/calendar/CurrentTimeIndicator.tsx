import { useEffect, useState } from "react";
import { View } from "react-native";
import {
  CALENDAR_GRID_TOP_PADDING,
  getHourMinuteForInstantInZone,
} from "@/components/calendar/calendar-layout";

export function CurrentTimeIndicator({
  startHour,
  slotHeight,
  endHour,
  totalGridHeight,
  timeZone,
  accessibilityLabelPrefix = "Current time",
}: {
  startHour: number;
  slotHeight: number;
  endHour: number;
  totalGridHeight: number;
  timeZone?: string | null;
  /** Shown as `${prefix} HH:MM` for screen readers. */
  accessibilityLabelPrefix?: string;
}) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const { h, m } = getHourMinuteForInstantInZone(now, timeZone);
  const rawTop = (h - startHour) * slotHeight + (m / 60) * slotHeight;
  const top =
    CALENDAR_GRID_TOP_PADDING + Math.max(0, Math.min(rawTop, totalGridHeight - 4));

  const a11yHour = String(h).padStart(2, "0");
  const a11yMinute = String(m).padStart(2, "0");

  return (
    <View
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top,
        flexDirection: "row",
        alignItems: "center",
        zIndex: 100,
        pointerEvents: "none",
      }}
      accessibilityLabel={`${accessibilityLabelPrefix} ${a11yHour}:${a11yMinute}`}
    >
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: "#dc2626",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.3,
          shadowRadius: 1,
          elevation: 2,
        }}
      />
      <View style={{ height: 3, flex: 1, backgroundColor: "#dc2626" }} />
    </View>
  );
}
