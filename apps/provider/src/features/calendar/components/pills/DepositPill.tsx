import { View, Text } from "react-native";
import { Colors } from "@/constants/colors";
import { getCalendarPaymentLabel, paymentNeedsAttention } from "@/lib/calendar-payment-label";
import type { Booking, CalendarBooking } from "@/components/calendar/calendar-booking-types";
import type { TFunction } from "@beautonomi/i18n";

/** Booking-aware DepositPill — derives label from booking fields. */
export function DepositPill({
  booking,
  compact,
  t,
}: {
  booking: Booking | CalendarBooking;
  compact?: boolean;
  t: TFunction;
}) {
  const label = getCalendarPaymentLabel(booking, t);
  const attention = paymentNeedsAttention(booking);
  if (!label) return null;
  return <DepositPillRaw label={label} attention={attention} compact={compact} />;
}

export function DepositPillRaw({
  label,
  attention,
  compact,
}: {
  label: string;
  attention: boolean;
  compact?: boolean;
}) {
  return (
    <View
      style={{
        alignSelf: "flex-start",
        borderRadius: 999,
        paddingHorizontal: compact ? 6 : 8,
        paddingVertical: compact ? 3 : 4,
        backgroundColor: attention ? "rgba(234,179,8,0.15)" : Colors.gray[100],
        borderWidth: attention ? 1 : 0,
        borderColor: attention ? Colors.warning : "transparent",
      }}
    >
      <Text
        style={{
          fontSize: compact ? 11 : 12,
          fontWeight: "600",
          color: attention ? Colors.gray[900] : Colors.gray[600],
        }}
      >
        {label}
      </Text>
    </View>
  );
}
