import React, { useState } from "react";
import { Text, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useModuleConfig, useFeatureFlag, useConfigBundle } from "@/providers/ConfigBundleProvider";
import { api } from "@/lib/api-client";

interface SafetyPanicButtonProps {
  bookingId?: string | null;
}

/**
 * Safety / panic button. Gated by modules.safety.enabled and flags.safety.panic.enabled.
 * Renders nothing when disabled.
 */
export function SafetyPanicButton({ bookingId = null }: SafetyPanicButtonProps) {
  const { bundle } = useConfigBundle();
  const safetyConfig = useModuleConfig("safety") as { enabled?: boolean } | undefined;
  const panicEnabled = useFeatureFlag("safety.panic.enabled");
  const [loading, setLoading] = useState(false);

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
            setLoading(true);
            try {
              const res = await api.post<{ data: { id: string } }>("/api/me/safety/panic", {
                booking_id: bookingId ?? undefined,
                metadata: { source: "customer_app" },
                ...(bundle?.meta?.env && { environment: bundle.meta.env }),
              });
              if (res.error) {
                Alert.alert("Error", "Unable to send request. Please call emergency services if in danger.");
              } else {
                Alert.alert("Done", "Help has been requested. Our team will reach out shortly.");
              }
            } catch {
              Alert.alert("Error", "Unable to send request. Please call emergency services if in danger.");
            } finally {
              setLoading(false);
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
      style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: "#FECACA", backgroundColor: "#FEF2F2", marginBottom: 12 }}
      accessibilityRole="button"
      accessibilityLabel="Safety - get help"
    >
      {loading ? (
        <ActivityIndicator size="small" color="#dc2626" />
      ) : (
        <>
          <Ionicons name="shield-checkmark-outline" size={20} color="#dc2626" />
          <Text style={{ marginLeft: 8, fontWeight: "500", color: "#B91C1C" }}>Safety / Get help</Text>
        </>
      )}
    </TouchableOpacity>
  );
}
