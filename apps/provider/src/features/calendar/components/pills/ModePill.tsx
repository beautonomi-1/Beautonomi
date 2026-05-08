import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import type { Booking, CalendarBooking } from "@/components/calendar/calendar-booking-types";

export function ModePill({
  label,
  icon,
  compact,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  compact?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        alignSelf: "flex-start",
        gap: 4,
        borderRadius: 999,
        backgroundColor: Colors.gray[100],
        paddingHorizontal: compact ? 6 : 8,
        paddingVertical: compact ? 3 : 4,
      }}
    >
      <Ionicons name={icon} size={compact ? 11 : 12} color={Colors.gray[600]} />
      <Text style={{ fontSize: compact ? 11 : 12, fontWeight: "600", color: Colors.gray[700] }}>{label}</Text>
    </View>
  );
}

/** Booking-aware ModePill — auto-derives label and icon from booking fields. */
export function ModePillFromBooking({
  booking,
  compact,
  offersMobileServices,
}: {
  booking: Booking | CalendarBooking;
  compact?: boolean;
  offersMobileServices?: boolean;
}) {
  const atHome =
    booking.location_type === "at_home" ||
    (booking.location_type == null &&
      !booking.location_id &&
      !!(booking as { address?: { line1?: string } }).address?.line1?.trim());
  const isGroup = !!(booking as { is_group_booking?: boolean }).is_group_booking;

  if (atHome && offersMobileServices !== false) {
    return <ModePill label="At Home" icon="car-outline" compact={compact} />;
  }
  if (isGroup) {
    return <ModePill label="Group" icon="people-outline" compact={compact} />;
  }
  return null;
}


