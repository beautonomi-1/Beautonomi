import React from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { useModuleConfig } from "@/providers/ConfigBundleProvider";
import { Colors } from "@/constants/colors";

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
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
      <ActivityIndicator size="large" />
      <Text style={{ fontSize: 18, fontWeight: "500", color: Colors.gray[900], marginTop: 16 }}>{title}</Text>
      <Text style={{ fontSize: 14, color: Colors.gray[500], marginTop: 16 }}>{message}</Text>
      <Text style={{ fontSize: 12, color: Colors.gray[400], marginTop: 16 }}>Timeout: {timeoutSec}s</Text>
    </View>
  );
}
