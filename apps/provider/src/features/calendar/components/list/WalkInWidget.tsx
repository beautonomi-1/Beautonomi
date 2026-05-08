import { Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";

interface Props {
  count: number;
  onPress: () => void;
}

export function WalkInWidget({ count, onPress }: Props) {
  if (count <= 0) return null;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#FEF2F2",
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginHorizontal: 12,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: "#FECACA",
      }}
      accessibilityRole="button"
      accessibilityLabel={`${count} client${count === 1 ? "" : "s"} in walk-in queue`}
    >
      <View
        style={{
          backgroundColor: Colors.error,
          borderRadius: 999,
          minWidth: 24,
          height: 24,
          paddingHorizontal: 7,
          alignItems: "center",
          justifyContent: "center",
          marginRight: 10,
        }}
      >
        <Text style={{ fontSize: 12, fontWeight: "700", color: Colors.white }}>
          {count > 99 ? "99+" : String(count)}
        </Text>
      </View>
      <Ionicons name="people-outline" size={16} color="#DC2626" style={{ marginRight: 8 }} />
      <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: "#991B1B" }}>
        {count === 1 ? "1 client waiting" : `${count} clients waiting`}
      </Text>
      <Ionicons name="chevron-forward" size={16} color="#DC2626" />
    </TouchableOpacity>
  );
}
