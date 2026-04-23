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
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import { twStyle } from "@/lib/twStyle";

const APPOINTMENT_STATUSES = [
  { value: "pending", label: "Pending" },
  { value: "booked", label: "Booked" },
  { value: "started", label: "Started" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "no_show", label: "No Show" },
];

interface AppointmentSettings {
  defaultAppointmentStatus: string;
  autoConfirmAppointments: boolean;
  requireConfirmationForBookings: boolean;
}

export default function SettingsAppointmentDefaultsScreen() {
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
      Alert.alert("Error", res.error);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    }
  }, [settings, patchSettings, router]);

  if (loading && !raw) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Appointment settings" onBack={() => router.back()} />
        <LoadingState message="Loading..." />
      </ScreenContainer>
    );
  }

  const statusLabel = APPOINTMENT_STATUSES.find((s) => s.value === settings.defaultAppointmentStatus)?.label ?? settings.defaultAppointmentStatus;

  return (
    <ScreenContainer>
      <ScreenHeader
        title="Appointment settings"
        subtitle="Default status & confirmation"
        onBack={() => router.back()}
        rightAction={
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving}
            style={twStyle("min-h-[40px] flex-row items-center justify-center rounded-full bg-indigo-600 px-4")}
            accessibilityLabel="Save appointment settings"
            accessibilityRole="button"
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={twStyle("font-medium text-white")}>Save</Text>
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
                accessibilityLabel="Retry"
                accessibilityRole="button"
              >
                <Text style={twStyle("text-sm font-medium text-red-700")}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={twStyle("mb-3")}>
            <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Default appointment status</Text>
            <Text style={twStyle("mb-2 text-xs text-gray-500")}>
              Status for new appointments when they are created
            </Text>
            <TouchableOpacity
              style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}
              onPress={() => setStatusSheetOpen(true)}
              accessibilityLabel={`Default appointment status, ${statusLabel}`}
              accessibilityRole="button"
            >
              <Text style={twStyle("text-base text-gray-900")}>{statusLabel}</Text>
            </TouchableOpacity>
          </View>

          <View style={twStyle("mb-3 flex-row items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}>
            <View style={twStyle("flex-1 pr-3")}>
              <Text style={twStyle("text-sm font-medium text-gray-700")}>Auto-confirm appointments</Text>
              <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
                New bookings are confirmed automatically
              </Text>
            </View>
            <Switch
              value={settings.autoConfirmAppointments}
              onValueChange={(v) => setSettings((s) => ({ ...s, autoConfirmAppointments: v }))}
            />
          </View>

          <View style={twStyle("mb-3 flex-row items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3")}>
            <View style={twStyle("flex-1 pr-3")}>
              <Text style={twStyle("text-sm font-medium text-gray-700")}>Require confirmation for bookings</Text>
              <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
                Online bookings need your confirmation first
              </Text>
            </View>
            <Switch
              value={settings.requireConfirmationForBookings}
              onValueChange={(v) => setSettings((s) => ({ ...s, requireConfirmationForBookings: v }))}
            />
          </View>

          <View style={twStyle("mt-4")}>
            <ActionButton
              label={saving ? "Saving..." : "Save changes"}
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
        title="Default status"
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
              accessibilityLabel={s.label}
              accessibilityRole="button"
            >
              <Text style={twStyle("text-base text-gray-900")}>{s.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </BottomSheet>
    </ScreenContainer>
  );
}
