import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { TFunction } from "@beautonomi/i18n";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Colors } from "@/constants/colors";
import { formatTimeInZone } from "@/lib/format";
import type { CalendarBooking } from "@/components/calendar/calendar-booking-types";

export interface CalendarBookingQuickSheetProps {
  visible: boolean;
  booking: CalendarBooking | null;
  providerTimezone: string | null;
  onClose: () => void;
  /** Root booking id for API / detail screen (parent id for multi-service rows). */
  onViewFullDetails: (bookingId: string) => void;
  translateBookingStatusLabel: (t: TFunction, status: string) => string;
  t: TFunction;
}

function rootBookingId(b: CalendarBooking): string {
  return b.calendar_parent_booking_id?.trim() ? b.calendar_parent_booking_id : b.id;
}

export function CalendarBookingQuickSheet({
  visible,
  booking,
  providerTimezone,
  onClose,
  onViewFullDetails,
  translateBookingStatusLabel,
  t,
}: CalendarBookingQuickSheetProps) {
  if (!booking) return null;

  const name = booking.customers?.full_name?.trim() || t("provider.calendarScreen.bookingLabelFallback");
  const timeStr = formatTimeInZone(booking.scheduled_at, providerTimezone) ?? "";
  const serviceName = booking.calendar_service_name || booking.services?.[0]?.name || "";
  const statusLabel = translateBookingStatusLabel(t, booking.status);
  const id = rootBookingId(booking);

  return (
    <BottomSheet
      visible={visible && !!booking}
      onClose={onClose}
      title={name}
      subtitle={[timeStr, serviceName].filter(Boolean).join(" · ")}
      snapHeight="half"
    >
      <View style={{ paddingHorizontal: 20, paddingBottom: 24 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            alignSelf: "flex-start",
            backgroundColor: Colors.gray[100],
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 999,
            marginBottom: 16,
          }}
        >
          <Ionicons name="ellipse" size={8} color={Colors.primary} style={{ marginRight: 6 }} />
          <Text style={{ fontSize: 13, fontWeight: "600", color: Colors.gray[800] }}>{statusLabel}</Text>
        </View>
        <Text style={{ fontSize: 14, color: Colors.gray[600], marginBottom: 20 }}>
          {t("provider.calendarScreen.quickSheetLongPressHint")}
        </Text>
        <TouchableOpacity
          onPress={() => {
            onViewFullDetails(id);
            onClose();
          }}
          style={{
            backgroundColor: Colors.primary,
            paddingVertical: 14,
            borderRadius: 12,
            alignItems: "center",
            marginBottom: 10,
          }}
          activeOpacity={0.85}
        >
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>
            {t("provider.calendarScreen.viewFullDetails")}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onClose} style={{ paddingVertical: 12, alignItems: "center" }} activeOpacity={0.7}>
          <Text style={{ color: Colors.gray[600], fontWeight: "600", fontSize: 15 }}>
            {t("provider.calendarScreen.cancel")}
          </Text>
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}
