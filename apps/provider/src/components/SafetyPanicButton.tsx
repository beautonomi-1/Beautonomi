import React, { useState, useCallback } from "react";
import { TouchableOpacity, Text, ActivityIndicator, Alert } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "@beautonomi/i18n";
import { useModuleConfig, useFeatureFlag, useConfigBundle } from "@/providers/ConfigBundleProvider";
import { useApiPost } from "@/hooks/useApi";
import { twStyle } from "@/lib/twStyle";

interface SafetyPanicButtonProps {
  bookingId?: string | null;
}

/**
 * Safety / panic button. Gated by modules.safety.enabled and flags.safety.panic.enabled.
 */
export function SafetyPanicButton({ bookingId = null }: SafetyPanicButtonProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { bundle } = useConfigBundle();
  const safetyConfig = useModuleConfig("safety") as { enabled?: boolean } | undefined;
  const panicEnabled = useFeatureFlag("safety.panic.enabled");
  const { execute: postPanic, loading } = useApiPost<
    { booking_id?: string; metadata?: Record<string, string>; environment?: string },
    { id?: string; event_id?: string }
  >("/api/me/safety/panic");

  const sp = useCallback(
    (key: string, options?: Record<string, string | number>) => {
      const fullKey = `customer.mobile.screens.safetyPanic.${key}`;
      return (options != null ? t(fullKey, options as never) : t(fullKey)) as string;
    },
    [t],
  );

  const enabled = Boolean(safetyConfig?.enabled) && panicEnabled;
  if (!enabled) return null;

  const handlePress = () => {
    Alert.alert(sp("requestHelpTitle"), sp("requestHelpBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: sp("requestHelpCta"),
        style: "destructive",
        onPress: async () => {
          const res = await postPanic({
            booking_id: bookingId ?? undefined,
            metadata: { source: "provider_app" },
            ...(bundle?.meta?.env && { environment: bundle.meta.env }),
          });
          if (res?.error) {
            Alert.alert(t("customer.mobile.screens.authLogin.errorTitle"), sp("errorSendFailed"));
          } else {
            const eventId = res?.data?.event_id ?? res?.data?.id;
            Alert.alert(sp("doneTitle"), sp("doneBodyWithEvent", { eventId: eventId?.slice(0, 8) ?? "—" }), [
              {
                text: sp("openSafetyHub"),
                onPress: () => router.push("/(app)/(tabs)/more/safety" as never),
              },
              { text: t("common.ok") },
            ]);
          }
        },
      },
    ]);
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={loading}
      style={twStyle("flex-row items-center justify-center py-3.5 rounded-xl border border-red-200 bg-red-50 mb-3")}
      accessibilityRole="button"
      accessibilityLabel={sp("a11y")}
    >
      {loading ? (
        <ActivityIndicator size="small" color="#dc2626" />
      ) : (
        <>
          <Ionicons name="shield-checkmark-outline" size={20} color="#dc2626" />
          <Text style={twStyle("ml-2 font-medium text-red-700")}>{sp("buttonLabel")}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}
