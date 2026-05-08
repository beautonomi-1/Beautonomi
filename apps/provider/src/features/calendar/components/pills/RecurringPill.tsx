import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";

export function RecurringPill() {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", borderRadius: 999, backgroundColor: Colors.gray[100], paddingHorizontal: 8, paddingVertical: 4 }}>
      <Ionicons name="repeat-outline" size={12} color={Colors.gray[600]} />
      <Text style={{ fontSize: 11, fontWeight: "600", color: Colors.gray[700] }}>Recurring</Text>
    </View>
  );
}
