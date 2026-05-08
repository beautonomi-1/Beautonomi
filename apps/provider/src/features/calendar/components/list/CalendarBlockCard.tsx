import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import type { CalendarOverlayTimeBlockLike } from "@/features/calendar/utils/overlays";

const BLOCK_ICONS: Record<string, string> = {
  break: "cafe-outline",
  lunch: "restaurant-outline",
  meeting: "people-outline",
  personal: "person-outline",
  unavailable: "ban-outline",
  maintenance: "construct-outline",
};

interface Props {
  block: CalendarOverlayTimeBlockLike;
  onPress?: () => void;
}

export function CalendarBlockCard({ block, onPress }: Props) {
  const iconName = (BLOCK_ICONS[block.block_type] ?? "ban-outline") as keyof typeof Ionicons.glyphMap;
  const content = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: Colors.gray[50],
        borderRadius: 10,
        marginHorizontal: 12,
        marginBottom: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderLeftWidth: 4,
        borderLeftColor: Colors.gray[300],
        minHeight: 48,
      }}
    >
      <Ionicons name={iconName} size={16} color={Colors.gray[500]} style={{ marginRight: 10 }} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[700] }}>
          {block.title || block.block_type}
        </Text>
        <Text style={{ fontSize: 12, color: Colors.gray[400], marginTop: 1 }}>
          {block.start_time} – {block.end_time}
        </Text>
      </View>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
        {content}
      </TouchableOpacity>
    );
  }
  return content;
}
