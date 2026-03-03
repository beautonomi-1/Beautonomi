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

  return (
    <View className={`flex-row items-center rounded-full ${colors.bg} ${size === "sm" ? "px-2 py-0.5" : "px-3 py-1"}`}>
      <View className={`${colors.dot} mr-1.5 h-1.5 w-1.5 rounded-full`} />
      <Text className={`${colors.text} ${size === "sm" ? "text-xs" : "text-sm"} font-medium`}>
        {displayLabel}
      </Text>
    </View>
  );
}
