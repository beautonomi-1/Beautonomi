import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface StatCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  iconBg?: string;
  trend?: { value: number; label?: string };
  compact?: boolean;
}

export function StatCard({
  title,
  value,
  subtitle,
  icon,
  iconColor = "#6366f1",
  iconBg = "bg-indigo-50",
  trend,
  compact = false,
}: StatCardProps) {
  return (
    <View className={`rounded-2xl border border-gray-100 bg-white ${compact ? "p-3" : "p-4"}`}>
      <View className="flex-row items-start justify-between">
        <View className="flex-1">
          <Text className="text-xs font-medium uppercase tracking-wide text-gray-500" numberOfLines={1}>
            {title}
          </Text>
          <Text className={`${compact ? "mt-1 text-xl" : "mt-2 text-2xl"} font-bold text-gray-900`}>
            {value}
          </Text>
          {subtitle && (
            <Text className="mt-0.5 text-xs text-gray-400">{subtitle}</Text>
          )}
          {trend && (
            <View className="mt-1 flex-row items-center">
              <Ionicons
                name={trend.value >= 0 ? "trending-up" : "trending-down"}
                size={14}
                color={trend.value >= 0 ? "#22c55e" : "#ef4444"}
              />
              <Text
                className={`ml-1 text-xs font-medium ${
                  trend.value >= 0 ? "text-green-600" : "text-red-500"
                }`}
              >
                {trend.value >= 0 ? "+" : ""}
                {trend.value.toFixed(1)}%
                {trend.label ? ` ${trend.label}` : ""}
              </Text>
            </View>
          )}
        </View>
        {icon && (
          <View className={`${iconBg} ml-2 h-10 w-10 items-center justify-center rounded-xl`}>
            <Ionicons name={icon} size={20} color={iconColor} />
          </View>
        )}
      </View>
    </View>
  );
}
