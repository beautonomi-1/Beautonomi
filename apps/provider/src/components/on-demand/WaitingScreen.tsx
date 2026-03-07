import React from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { useModuleConfig } from "@/providers/ConfigBundleProvider";
import { twStyle } from "@/lib/twStyle";

/**
 * Simple waiting screen that reads on_demand module config.
 * Use behind feature flag; no full matching logic yet.
 */
export function OnDemandWaitingScreen() {
  const config = useModuleConfig("on_demand");
  const timeoutSec = config.waiting_screen_timeout_seconds ?? 45;
  const uiCopy = (config?.ui_copy ?? {}) as Record<string, string>;
  const title = uiCopy.waiting_title ?? uiCopy.title ?? "Request sent";
  const message = uiCopy.waiting_headline ?? uiCopy.message ?? "Connecting you with beauty.";

  return (
    <View style={twStyle("flex-1 items-center justify-center p-6")}>
      <ActivityIndicator size="large" />
      <Text style={[twStyle("text-lg font-medium"), { marginTop: 16 }]}>{title}</Text>
      <Text style={[twStyle("text-sm text-gray-500"), { marginTop: 16 }]}>{message}</Text>
      <Text style={[twStyle("text-xs text-gray-400"), { marginTop: 16 }]}>Timeout: {timeoutSec}s</Text>
    </View>
  );
}
