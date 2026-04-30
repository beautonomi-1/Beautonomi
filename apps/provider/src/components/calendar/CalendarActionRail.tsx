import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import type { TFunction } from "@beautonomi/i18n";

export interface CalendarActionRailProps {
  isTablet: boolean;
  screenPadding: number;
  waitingCount: number;
  onNewAppointment: () => void;
  onWalkIn: () => void;
  onGroup: () => void;
  onSale: () => void;
  onRecurring: () => void;
  onBlock: () => void;
  onWaiting: () => void;
  t: TFunction;
}

/**
 * Primary operational shortcuts for the calendar tab (single dominant action surface).
 */
export function CalendarActionRail({
  isTablet,
  screenPadding,
  waitingCount,
  onNewAppointment,
  onWalkIn,
  onGroup,
  onSale,
  onRecurring,
  onBlock,
  onWaiting,
  t,
}: CalendarActionRailProps) {
  const items: {
    label: string;
    sub: string;
    icon: keyof typeof Ionicons.glyphMap;
    color: string;
    bg: string;
    onPress: () => void;
  }[] = [
    {
      label: t("provider.calendarScreen.actionRail.newLabel"),
      sub: t("provider.calendarScreen.actionRail.newSub"),
      icon: "calendar-outline",
      color: "#4f46e5",
      bg: "#eef2ff",
      onPress: onNewAppointment,
    },
    {
      label: t("provider.calendarScreen.actionRail.walkInLabel"),
      sub: t("provider.calendarScreen.actionRail.walkInSub"),
      icon: "walk-outline",
      color: "#16a34a",
      bg: "#f0fdf4",
      onPress: onWalkIn,
    },
    {
      label: t("provider.calendarScreen.actionRail.groupLabel"),
      sub: t("provider.calendarScreen.actionRail.groupSub"),
      icon: "people-outline",
      color: "#db2777",
      bg: "#fdf2f8",
      onPress: onGroup,
    },
    {
      label: t("provider.calendarScreen.actionRail.saleLabel"),
      sub: t("provider.calendarScreen.actionRail.saleSub"),
      icon: "bag-handle-outline",
      color: "#0891b2",
      bg: "#ecfeff",
      onPress: onSale,
    },
    {
      label: t("provider.calendarScreen.actionRail.recurringLabel"),
      sub: t("provider.calendarScreen.actionRail.recurringSub"),
      icon: "repeat-outline",
      color: "#7c3aed",
      bg: "#f5f3ff",
      onPress: onRecurring,
    },
    {
      label: t("provider.calendarScreen.actionRail.blockLabel"),
      sub: t("provider.calendarScreen.actionRail.blockSub"),
      icon: "ban-outline",
      color: "#d97706",
      bg: "#fffbeb",
      onPress: onBlock,
    },
    {
      label: t("provider.calendarScreen.actionRail.waitingLabel"),
      sub:
        waitingCount > 0
          ? t("provider.calendarScreen.actionRail.waitingCountSub", { count: waitingCount })
          : t("provider.calendarScreen.actionRail.waitingRoomSub"),
      icon: "hourglass-outline",
      color: "#dc2626",
      bg: "#fef2f2",
      onPress: onWaiting,
    },
  ];

  return (
    <View style={{ backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.gray[100], paddingVertical: 10 }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: isTablet ? screenPadding : 12,
          gap: 8,
        }}
      >
        {items.map((item) => (
          <TouchableOpacity
            key={item.label}
            onPress={item.onPress}
            activeOpacity={0.78}
            style={{
              minWidth: 104,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: Colors.gray[100],
              backgroundColor: item.bg,
              paddingHorizontal: 12,
              paddingVertical: 10,
              flexDirection: "row",
              alignItems: "center",
            }}
            accessibilityRole="button"
            accessibilityLabel={`${item.label} ${item.sub}`}
          >
            <View
              style={{
                height: 30,
                width: 30,
                borderRadius: 15,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: Colors.white,
                marginRight: 8,
              }}
            >
              <Ionicons name={item.icon} size={16} color={item.color} />
            </View>
            <View>
              <Text style={{ fontSize: 12, fontWeight: "800", color: Colors.gray[900] }}>{item.label}</Text>
              <Text style={{ marginTop: 1, fontSize: 10, color: Colors.gray[500] }}>{item.sub}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}
