import { View, Text } from "react-native";
import { getStatusColors, resolveCalendarColorKey } from "@/features/calendar/utils/display";
import type { Booking, CalendarBooking } from "@/components/calendar/calendar-booking-types";

export function StatusPill({ booking, compact }: { booking: Booking | CalendarBooking; compact?: boolean }) {
  const key = resolveCalendarColorKey(booking);
  const c = getStatusColors(key);
  return (
    <View
      style={{
        alignSelf: "flex-start",
        borderRadius: 999,
        borderWidth: 1,
        borderColor: c.border,
        backgroundColor: c.bg,
        paddingHorizontal: compact ? 8 : 10,
        paddingVertical: compact ? 4 : 5,
      }}
    >
      <Text style={{ fontSize: compact ? 11 : 12, fontWeight: "600", color: c.text }} numberOfLines={1}>
        {key.replace(/_/g, " ")}
      </Text>
    </View>
  );
}
