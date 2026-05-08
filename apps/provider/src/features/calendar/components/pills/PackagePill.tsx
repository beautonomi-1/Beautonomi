import { View, Text } from "react-native";
import { Colors } from "@/constants/colors";

export function PackagePill() {
  return (
    <View style={{ alignSelf: "flex-start", borderRadius: 999, backgroundColor: "#f5f3ff", paddingHorizontal: 8, paddingVertical: 4 }}>
      <Text style={{ fontSize: 11, fontWeight: "600", color: "#5b21b6" }}>Package</Text>
    </View>
  );
}
