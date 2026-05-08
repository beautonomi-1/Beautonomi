import { View, Text } from "react-native";
import { Colors } from "@/constants/colors";
import type { Booking, CalendarBooking } from "@/components/calendar/calendar-booking-types";

const SOURCE_LABELS: Record<string, string> = {
  beautonomi: "Beautonomi",
  direct: "Direct",
  express: "Express Booking",
  walkin: "Walk-in",
  walk_in: "Walk-in",
};

interface Props {
  label: string;
}

export function SourcePill({ label }: Props) {
  return (
    <View
      style={{
        alignSelf: "flex-start",
        borderRadius: 999,
        backgroundColor: Colors.gray[100],
        paddingHorizontal: 8,
        paddingVertical: 4,
      }}
    >
      <Text style={{ fontSize: 11, fontWeight: "500", color: Colors.gray[600] }}>{label}</Text>
    </View>
  );
}

/**
 * Derives the source label from a booking's `booking_source` field.
 * Returns null when no source is present.
 */
export function SourcePillFromBooking({
  booking,
}: {
  booking: Booking | CalendarBooking;
}) {
  const source = (booking as { booking_source?: string }).booking_source;
  if (!source) return null;
  const label = SOURCE_LABELS[source] ?? source;
  return <SourcePill label={label} />;
}
