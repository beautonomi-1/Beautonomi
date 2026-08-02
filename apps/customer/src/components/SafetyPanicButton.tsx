import React, { useState, useCallback } from "react";
import { Text, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "@beautonomi/i18n";
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
  const { t } = useTranslation();
  const router = useRouter();
  const { bundle } = useConfigBundle();
  const safetyConfig = useModuleConfig("safety") as { enabled?: boolean } | undefined;
  const panicEnabled = useFeatureFlag("safety.panic.enabled");
  const [loading, setLoading] = useState(false);

  const sp = useCallback(
    (key: string, options?: Record<string, string | number>) => {
      const fullKey = `customer.mobile.screens.safetyPanic.${key}`;
      return (options != null ? t(fullKey, options as never) : t(fullKey)) as string;
    },
    [t],
  );
  const errTitle = t("customer.mobile.screens.authLogin.errorTitle");

  const enabled = Boolean(safetyConfig?.enabled) && panicEnabled;
  if (!enabled) return null;

  const handlePress = () => {
    Alert.alert(sp("requestHelpTitle"), sp("requestHelpBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: sp("requestHelpCta"),
        style: "destructive",
        onPress: async () => {
          setLoading(true);
          try {
            const res = await api.post<{ id?: string; event_id?: string }>("/api/me/safety/panic", {
              booking_id: bookingId ?? undefined,
              metadata: { source: "customer_app" },
              ...(bundle?.meta?.env && { environment: bundle.meta.env }),
            });
            if (res.error) {
              Alert.alert(errTitle, sp("errorSendFailed"));
            } else {
              const eventId = res.data?.event_id ?? res.data?.id;
              Alert.alert(sp("doneTitle"), sp("doneBodyWithEvent", { eventId: eventId?.slice(0, 8) ?? "—" }), [
                { text: sp("openSafetyHub"), onPress: () => router.push("/(app)/safety") },
                { text: t("common.ok") },
              ]);
            }
          } catch {
            Alert.alert(errTitle, sp("errorSendFailed"));
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={loading}
      style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: "#FECACA", backgroundColor: "#FEF2F2", marginBottom: 12 }}
      accessibilityRole="button"
      accessibilityLabel={sp("a11y")}
    >
      {loading ? (
        <ActivityIndicator size="small" color="#dc2626" />
      ) : (
        <>
          <Ionicons name="shield-checkmark-outline" size={20} color="#dc2626" />
          <Text style={{ marginLeft: 8, fontWeight: "500", color: "#B91C1C" }}>{sp("buttonLabel")}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}
