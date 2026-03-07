import { View, Text, type ViewStyle } from "react-native";
import { Colors } from "@/constants/colors";

interface DividerProps {
  label?: string;
  style?: ViewStyle;
}

export function Divider({ label, style: styleProp }: DividerProps) {
  if (label) {
    return (
      <View style={[{ flexDirection: "row", alignItems: "center" }, styleProp]}>
        <View style={{ height: 1, flex: 1, backgroundColor: Colors.gray[100] }} />
        <Text style={{ marginHorizontal: 12, fontSize: 12, fontWeight: "500", color: Colors.gray[400] }}>{label}</Text>
        <View style={{ height: 1, flex: 1, backgroundColor: Colors.gray[100] }} />
      </View>
    );
  }
  return <View style={[{ height: 1, backgroundColor: Colors.gray[100] }, styleProp]} />;
}
