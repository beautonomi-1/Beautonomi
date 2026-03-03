import React from "react";
import { TouchableOpacity, Text, ActivityIndicator, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useModuleConfig, useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { useApiPost } from "@/hooks/useApi";

interface SafetyPanicButtonProps {
  bookingId?: string | null;
}

/**
 * Safety / panic button. Gated by modules.safety.enabled and flags.safety.panic.enabled.
 * Renders nothing when disabled.
 */
export function SafetyPanicButton({ bookingId = null }: SafetyPanicButtonProps) {
  const safetyConfig = useModuleConfig("safety") as { enabled?: boolean } | undefined;
  const panicEnabled = useFeatureFlag("safety.panic.enabled");
  const { execute: postPanic, loading } = useApiPost<{ booking_id?: string; metadata?: Record<string, string> }, { data: { id: string } }>("/api/me/safety/panic");

  const enabled = Boolean(safetyConfig?.enabled) && panicEnabled;
  if (!enabled) return null;

  const handlePress = () => {
    Alert.alert(
      "Request help",
      "This will notify our safety team. If you are in immediate danger, please call emergency services (e.g. 112 or 911) first.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Request help",
          style: "destructive",
          onPress: async () => {
            const res = await postPanic({
              booking_id: bookingId ?? undefined,
              metadata: { source: "provider_app" },
            });
            if (res?.error) {
              Alert.alert("Error", "Unable to send request. Please call emergency services if in danger.");
            } else {
              Alert.alert("Done", "Help has been requested. Our team will reach out shortly.");
            }
          },
        },
      ]
    );
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={loading}
      className="flex-row items-center justify-center py-3.5 rounded-xl border border-red-200 bg-red-50 mb-3"
      accessibilityRole="button"
      accessibilityLabel="Safety - get help"
    >
      {loading ? (
        <ActivityIndicator size="small" color="#dc2626" />
      ) : (
        <>
          <Ionicons name="shield-checkmark-outline" size={20} color="#dc2626" />
          <Text className="ml-2 font-medium text-red-700">Safety / Get help</Text>
        </>
      )}
    </TouchableOpacity>
  );
}
