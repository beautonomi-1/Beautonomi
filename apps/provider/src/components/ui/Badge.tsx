import { View, Text } from "react-native";
import { getStatusColor, capitalizeFirst } from "@/lib/format";

interface BadgeProps {
  status: string;
  label?: string;
  size?: "sm" | "md";
}

export function Badge({ status, label, size = "sm" }: BadgeProps) {
  const colors = getStatusColor(status);
  const displayLabel = label || capitalizeFirst(status);

  const isSm = size === "sm";
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        borderRadius: 9999,
        backgroundColor: colors.bg,
        paddingHorizontal: isSm ? 8 : 12,
        paddingVertical: isSm ? 2 : 4,
      }}
    >
      <View
        style={{
          backgroundColor: colors.dot,
          marginRight: 6,
          height: 6,
          width: 6,
          borderRadius: 3,
        }}
      />
      <Text
        style={{
          color: colors.text,
          fontSize: isSm ? 12 : 14,
          fontWeight: "500",
        }}
      >
        {displayLabel}
      </Text>
    </View>
  );
}
