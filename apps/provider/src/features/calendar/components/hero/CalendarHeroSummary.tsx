import { View, Text, TouchableOpacity } from "react-native";
import { format } from "date-fns";
import { Ionicons } from "@expo/vector-icons";
import { Colors, shadow } from "@/constants/colors";
import { CALENDAR_BG } from "@/features/calendar/theme/tokens";
import { CalendarTypography } from "@/features/calendar/theme/typography";
import type { CalendarV2ChromeContext } from "@/features/calendar/types/calendar";

const cardShadow = shadow(2, 8, 0.08, 3);

export function CalendarHeroSummary({ ctx }: { ctx: CalendarV2ChromeContext }) {
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, backgroundColor: CALENDAR_BG }}>
      <View
        style={[
          {
            borderRadius: 16,
            backgroundColor: Colors.white,
            padding: 16,
            borderWidth: 1,
            borderColor: Colors.gray[100],
          },
          cardShadow,
        ]}
      >
        <Text style={CalendarTypography.heroDate}>{format(ctx.selectedDate, "EEEE, MMM d")}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 8, gap: 8 }}>
          <MetaChip icon="calendar-outline" text={`${ctx.todayBookingCount} appointments`} />
          <MetaChip icon="people-outline" text={`${ctx.waitingRoomCount} in queue`} />
          {ctx.pendingAttentionCount > 0 ? (
            <MetaChip icon="alert-circle-outline" text={`${ctx.pendingAttentionCount} pending`} warn />
          ) : null}
          {ctx.urgentPendingCount > 0 ? (
            <MetaChip icon="flash-outline" text={`${ctx.urgentPendingCount} urgent`} urgent />
          ) : null}
        </View>
        {ctx.scheduledValueLabel ? (
          <Text style={[CalendarTypography.heroValue, { marginTop: 12 }]}>
            Scheduled value: {ctx.scheduledValueLabel}
          </Text>
        ) : null}
        {ctx.nextUpcomingLabel ? (
          <Text style={[CalendarTypography.heroMeta, { marginTop: 8 }]}>Next: {ctx.nextUpcomingLabel}</Text>
        ) : null}
        {ctx.paymentAttentionCount > 0 ? (
          <Text style={{ marginTop: 6, fontSize: 13, fontWeight: "600", color: Colors.warning }}>
            {ctx.paymentAttentionCount} booking(s) need payment attention
          </Text>
        ) : null}
        <TouchableOpacity onPress={ctx.onRefresh} style={{ marginTop: 12, flexDirection: "row", alignItems: "center", alignSelf: "flex-start" }}>
          <Ionicons name="refresh-outline" size={16} color={Colors.primary} />
          <Text style={{ marginLeft: 6, fontSize: 14, fontWeight: "600", color: Colors.primary }}>Refresh</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function MetaChip({
  icon,
  text,
  warn,
  urgent,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
  warn?: boolean;
  urgent?: boolean;
}) {
  const bg = urgent ? "#FEF2F2" : warn ? "#FFFBEB" : Colors.gray[50];
  const fg = urgent ? "#991B1B" : warn ? "#92400E" : Colors.gray[700];
  return (
    <View style={{ flexDirection: "row", alignItems: "center", borderRadius: 999, backgroundColor: bg, paddingHorizontal: 10, paddingVertical: 6 }}>
      <Ionicons name={icon} size={14} color={fg} />
      <Text style={{ marginLeft: 6, fontSize: 12, fontWeight: "600", color: fg }}>{text}</Text>
    </View>
  );
}
