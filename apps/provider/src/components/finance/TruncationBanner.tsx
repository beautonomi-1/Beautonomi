import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";

type TruncationBannerProps = {
  message?: string;
};

export function TruncationBanner({
  message = "Totals may be incomplete — only the first batch of ledger rows was scanned. Narrow the date range or export for the full period.",
}: TruncationBannerProps) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        marginBottom: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#fde68a",
        backgroundColor: "#fffbeb",
        padding: 12,
      }}
    >
      <Ionicons name="information-circle-outline" size={18} color="#b45309" style={{ marginTop: 1 }} />
      <Text style={{ marginLeft: 8, flex: 1, fontSize: 13, lineHeight: 18, color: Colors.gray[700] }}>
        {message}
      </Text>
    </View>
  );
}
