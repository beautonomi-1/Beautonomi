import React from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { useModuleConfig } from "@/providers/ConfigBundleProvider";

/**
 * Simple waiting screen that reads on_demand module config.
 * Use behind feature flag; no full matching logic yet.
 */
export function OnDemandWaitingScreen() {
  const config = useModuleConfig("on_demand");
  const timeoutSec = config.waiting_screen_timeout_seconds ?? 45;
  const uiCopy = config.ui_copy as Record<string, string> | undefined;
  const title = uiCopy?.title ?? "Please wait";
  const message = uiCopy?.message ?? "We're connecting you...";

  return (
    <View className="flex-1 items-center justify-center gap-4 p-6">
      <ActivityIndicator size="large" />
      <Text className="text-lg font-medium">{title}</Text>
      <Text className="text-sm text-gray-500">{message}</Text>
      <Text className="text-xs text-gray-400">Timeout: {timeoutSec}s</Text>
    </View>
  );
}
