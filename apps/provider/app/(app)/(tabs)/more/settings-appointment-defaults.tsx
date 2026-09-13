import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useTranslation } from "@beautonomi/i18n";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import { twStyle } from "@/lib/twStyle";

const APPOINTMENT_STATUSES = [
  { value: "pending", labelKey: "statusPending" },
  { value: "booked", labelKey: "statusBooked" },
  { value: "started", labelKey: "statusStarted" },
  { value: "completed", labelKey: "statusCompleted" },
  { value: "cancelled", labelKey: "statusCancelled" },
  { value: "no_show", labelKey: "statusNoShow" },
];

interface AppointmentSettings {
  defaultAppointmentStatus: string;
  autoConfirmAppointments: boolean;
  requireConfirmationForBookings: boolean;
}

export default function SettingsAppointmentDefaultsScreen() {
  const { t } = useTranslation();
  const ad = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t("provider.mobile.screens.appointmentDefaults." + key, opts) as string,
    [t],
  );
  const router = useRouter();
  const { data, loading, error, refresh } = useApi<AppointmentSettings | { data?: AppointmentSettings }>(
    "/api/provider/settings/appointments"
  );
  const { execute: patchSettings, loading: saving } = useApiMutation("patch");

  const raw =
    data && typeof data === "object" && "defaultAppointmentStatus" in data
      ? (data as AppointmentSettings)
      : data && typeof data === "object" && "data" in data
        ? (data as { data?: AppointmentSettings }).data
        : undefined;
  const [settings, setSettings] = useState<AppointmentSettings>({
    defaultAppointmentStatus: "booked",
    autoConfirmAppointments: false,
    requireConfirmationForBookings: true,
  });
  const [statusSheetOpen, setStatusSheetOpen] = useState(false);

  useEffect(() => {
    if (raw) {
      setSettings({
        defaultAppointmentStatus: raw.defaultAppointmentStatus ?? "booked",
        autoConfirmAppointments: raw.autoConfirmAppointments ?? false,
        requireConfirmationForBookings: raw.requireConfirmationForBookings ?? true,
      });
    }
  }, [raw]);

  const handleSave = useCallback(async () => {
    const res = await patchSettings("/api/provider/settings/appointments", {
      defaultAppointmentStatus: settings.defaultAppointmentStatus,
      autoConfirmAppointments: settings.autoConfirmAppointments,
      requireConfirmationForBookings: settings.requireConfirmationForBookings,
    }) as { error?: string };
    if (res.error) {
      Alert.alert(ad("errorTitle"), res.error);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    }
  }, [settings, patchSettings, router, ad]);

  if (loading && !raw) {
    return (
      <ScreenContainer>
        <ScreenHeader title={ad("title")} onBack={() => router.back()} />
        <LoadingState message={t("common.loading") as string} />
      </ScreenContainer>
    );
  }

  const statusLabel = APPOINTMENT_STATUSES.find((s) => s.value === settings.defaultAppointmentStatus)
    ? ad(APPOINTMENT_STATUSES.find((s) => s.value === settings.defaultAppointmentStatus)!.labelKey)
    : settings.defaultAppointmentStatus;

  return (
    <ScreenContainer>
      <ScreenHeader
        title={ad("title")}
        subtitle={ad("subtitle")}
        onBack={() => router.back()}
        rightAction={
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving}
            style={twStyle("min-h-[40px] flex-row items-center justify-center rounded-full bg-indigo-600 px-4")}
            accessibilityLabel={ad("saveA11y")}
            accessibilityRole="button"
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={twStyle("font-medium text-white")}>{t("common.save") as string}</Text>
            )}
          </TouchableOpacity>
        }
      />

      <ScrollView
        style={twStyle("flex-1")}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={twStyle("px-2 pt-2")}>
          {error && (
            <View style={twStyle("mb-3 rounded-xl border border-red-200 bg-red-50 p-3")}>
              <Text style={twStyle("text-sm text-red-700")}>{error}</Text>
              <TouchableOpacity
                onPress={() => refresh()}
                style={twStyle("mt-2")}
                accessibilityLabel={ad("retryA11y")}
                accessibilityRole="button"
              >
                <Text style={twStyle("text-sm font-medium text-red-700")}>{t("common.retry") as string}</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={twStyle("mb-3")}>
            <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{ad("defaultStatus")}</Text>
            <Text style={twStyle("mb-2 text-xs text-gray-500")}>
              {ad("defaultStatusHint")}
            </Text>
            <TouchableOpacity
              style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}
              onPress={() => setStatusSheetOpen(true)}
              accessibilityLabel={ad("defaultStatusA11y", { status: statusLabel })}
              accessibilityRole="button"
            >
              <Text style={twStyle("text-base text-gray-900")}>{statusLabel}</Text>
            </TouchableOpacity>
          </View>

          <View style={twStyle("mb-3 flex-row items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}>
            <View style={twStyle("flex-1 pe-3")}>
              <Text style={twStyle("text-sm font-medium text-gray-700")}>{ad("autoConfirm")}</Text>
              <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
                {ad("autoConfirmHint")}
              </Text>
            </View>
            <Switch
              value={settings.autoConfirmAppointments}
              onValueChange={(v) => setSettings((s) => ({ ...s, autoConfirmAppointments: v }))}
            />
          </View>

          <View style={twStyle("mb-3 flex-row items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}>
            <View style={twStyle("flex-1 pe-3")}>
              <Text style={twStyle("text-sm font-medium text-gray-700")}>{ad("requireConfirm")}</Text>
              <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
                {ad("requireConfirmHint")}
              </Text>
            </View>
            <Switch
              value={settings.requireConfirmationForBookings}
              onValueChange={(v) => setSettings((s) => ({ ...s, requireConfirmationForBookings: v }))}
            />
          </View>

          <View style={twStyle("mt-4")}>
            <ActionButton
              label={saving ? ad("saving") : ad("saveChanges")}
              onPress={handleSave}
              fullWidth
              disabled={saving}
            />
          </View>
        </View>
      </ScrollView>

      <BottomSheet
        visible={statusSheetOpen}
        onClose={() => setStatusSheetOpen(false)}
        title={ad("defaultStatusSheet")}
      >
        <ScrollView style={twStyle("max-h-80")}>
          {APPOINTMENT_STATUSES.map((s) => (
            <TouchableOpacity
              key={s.value}
              style={twStyle("border-b border-gray-100 py-3.5")}
              onPress={() => {
                setSettings((prev) => ({ ...prev, defaultAppointmentStatus: s.value }));
                setStatusSheetOpen(false);
              }}
              accessibilityLabel={ad(s.labelKey)}
              accessibilityRole="button"
            >
              <Text style={twStyle("text-base text-gray-900")}>{ad(s.labelKey)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </BottomSheet>
    </ScreenContainer>
  );
}
