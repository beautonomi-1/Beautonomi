import React from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { twStyle } from "@/lib/twStyle";
import { PAYCLOUD_SETUP_LABEL } from "@/lib/paycloud-collect-cta";
import type { PayCloudReadinessBlocker } from "@/hooks/usePayCloud";

type Props = {
  blocker?: PayCloudReadinessBlocker | null;
  onPress?: () => void;
  compact?: boolean;
  loading?: boolean;
};

export function PaycloudCollectSetupAffordance({ blocker, onPress, compact, loading }: Props) {
  const router = useRouter();
  if (loading) return null;
  const title = blocker?.title ?? "Finish card machine setup";

  const handlePress = () => {
    if (onPress) {
      onPress();
      return;
    }
    const href = blocker?.href;
    if (href?.includes("card-machines") || href?.includes("subscription")) {
      if (href.includes("subscription")) {
        router.push("/(app)/(tabs)/more/settings/subscription" as never);
        return;
      }
    }
    router.push("/(app)/(tabs)/more/card-machines" as never);
  };

  return (
    <Pressable
      onPress={handlePress}
      style={twStyle(
        `border border-dashed border-gray-300 rounded-xl px-4 ${compact ? "py-2" : "py-3"} flex-row items-center gap-3 bg-gray-50`,
      )}
      accessibilityRole="button"
      accessibilityLabel={`${PAYCLOUD_SETUP_LABEL}: ${title}`}
    >
      <View style={twStyle("w-9 h-9 rounded-full bg-white items-center justify-center border border-gray-200")}>
        <Ionicons name="card-outline" size={18} color="#6B7280" />
      </View>
      <View style={twStyle("flex-1")}>
        <Text style={twStyle("text-sm font-semibold text-gray-900")}>{PAYCLOUD_SETUP_LABEL}</Text>
        <Text style={twStyle("text-xs text-gray-600 mt-0.5")} numberOfLines={2}>
          {title}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
    </Pressable>
  );
}
