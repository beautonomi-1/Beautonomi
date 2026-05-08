import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { CALENDAR_DARK_HEADER } from "@/features/calendar/theme/tokens";

interface Props {
  businessName: string;
  pendingAttentionCount: number;
  onOpenUtilityMenu: () => void;
  onOpenPreferences: () => void;
  dateLabel: string;
}

export function CalendarHeader({
  businessName,
  pendingAttentionCount,
  onOpenUtilityMenu,
  onOpenPreferences,
  dateLabel,
}: Props) {
  return (
    <View
      style={{
        backgroundColor: CALENDAR_DARK_HEADER,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingVertical: 10,
        paddingTop: 6,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 12, fontWeight: "500", color: "rgba(255,255,255,0.5)" }}>
          {businessName}
        </Text>
        <Text style={{ fontSize: 17, fontWeight: "700", color: Colors.white }} numberOfLines={1}>
          {dateLabel}
        </Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        {pendingAttentionCount > 0 && (
          <View
            style={{
              marginRight: 12,
              minWidth: 22,
              height: 22,
              paddingHorizontal: 6,
              borderRadius: 11,
              backgroundColor: Colors.error,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: "700", color: Colors.white }}>
              {pendingAttentionCount > 99 ? "99+" : String(pendingAttentionCount)}
            </Text>
          </View>
        )}
        <TouchableOpacity
          onPress={onOpenUtilityMenu}
          style={{ minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" }}
          accessibilityLabel="Calendar actions"
        >
          <Ionicons name="ellipsis-horizontal" size={22} color="rgba(255,255,255,0.85)" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onOpenPreferences}
          style={{ minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" }}
          accessibilityLabel="Calendar preferences"
        >
          <Ionicons name="settings-outline" size={20} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
      </View>
    </View>
  );
}
