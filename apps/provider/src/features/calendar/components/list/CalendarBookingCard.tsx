import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { Colors, Shadows } from "@/constants/colors";
import { CalendarTypography } from "@/features/calendar/theme/typography";
import { StatusPill } from "@/features/calendar/components/pills/StatusPill";
import { ModePillFromBooking as ModePill } from "@/features/calendar/components/pills/ModePill";
import { DepositPill } from "@/features/calendar/components/pills/DepositPill";
import { SourcePillFromBooking as SourcePill } from "@/features/calendar/components/pills/SourcePill";
import { RecurringPill } from "@/features/calendar/components/pills/RecurringPill";
import { PackagePill } from "@/features/calendar/components/pills/PackagePill";
import { getBookingPillConfig } from "@/features/calendar/policies/bookingPills.policy";
import { getBlockColors } from "@/features/calendar/utils/display";
import { formatTimeInZone } from "@/lib/format";
import type { CalendarBooking } from "@/components/calendar/calendar-booking-types";
import type { ColorByMode } from "@/hooks/useCalendarPreferences";
import type { TFunction } from "@beautonomi/i18n";

interface Props {
  booking: CalendarBooking;
  colorBy: ColorByMode;
  staffList: { id: string; name: string }[];
  providerTimezone: string | null;
  isPending?: boolean;
  isHighlighted?: boolean;
  offersMobileServices?: boolean;
  onPress: () => void;
  t: TFunction;
}

export function CalendarBookingCard({
  booking,
  colorBy,
  staffList,
  providerTimezone,
  isPending,
  isHighlighted,
  offersMobileServices,
  onPress,
  t,
}: Props) {
  const colors = getBlockColors(booking, colorBy, staffList);
  const timeLabel = formatTimeInZone(booking.scheduled_at, providerTimezone);
  const customerName = booking.customers?.full_name?.trim() || "Walk-in";
  const serviceLabel = booking.services?.map((s) => s.name).filter(Boolean).join(", ") || booking.calendar_service_name;
  const durationMin = booking.services?.reduce((sum, s) => sum + (s.duration_minutes ?? 0), 0) ?? 0;
  const durationLabel = durationMin > 0
    ? durationMin < 60
      ? `${durationMin}m`
      : `${Math.floor(durationMin / 60)}h${durationMin % 60 > 0 ? ` ${durationMin % 60}m` : ""}`
    : null;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[
        {
          flexDirection: "row",
          backgroundColor: Colors.white,
          borderRadius: 12,
          marginHorizontal: 12,
          marginBottom: 8,
          overflow: "hidden",
          minHeight: 64,
        },
        Shadows.cardSmall,
        isHighlighted ? { borderWidth: 2, borderColor: Colors.primary } : {},
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${customerName} ${timeLabel}`}
    >
      <View
        style={{
          width: 4,
          backgroundColor: colors.border,
          borderTopLeftRadius: 12,
          borderBottomLeftRadius: 12,
        }}
      />
      <View style={{ flex: 1, paddingHorizontal: 12, paddingVertical: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={CalendarTypography.cardTime}>{timeLabel}</Text>
          {isPending && <ActivityIndicator size="small" color={Colors.primary} />}
        </View>
        <Text style={[CalendarTypography.cardName, { marginTop: 2 }]} numberOfLines={1}>
          {customerName}
        </Text>
        <Text style={[CalendarTypography.cardService, { marginTop: 1 }]} numberOfLines={1}>
          {serviceLabel}
          {durationLabel ? ` · ${durationLabel}` : ""}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
          <StatusPill booking={booking} compact />
          <ModePill booking={booking} compact offersMobileServices={offersMobileServices} />
          <DepositPill booking={booking} compact t={t} />
          <SourcePill booking={booking} />
          {getBookingPillConfig(booking, t).recurring && <RecurringPill />}
          {getBookingPillConfig(booking, t).package && <PackagePill />}
        </View>
      </View>
    </TouchableOpacity>
  );
}
