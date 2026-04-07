/**
 * Per-staff notification settings — GET/PATCH /api/provider/staff/[id]/notifications (owner-only PATCH).
 */
import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, Switch, TouchableOpacity, Alert, Modal, FlatList } from "react-native";
import { useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { useProvider } from "@/providers/ProviderContext";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { twStyle } from "@/lib/twStyle";

interface StaffNotificationSettings {
  emailEnabled: boolean;
  smsEnabled: boolean;
  smsPlanAllowed: boolean;
  desktopEnabled: boolean;
  appointmentReminders: boolean;
  appointmentCancellations: boolean;
  appointmentReschedules: boolean;
  newBookings: boolean;
  dailySchedule: boolean;
  weeklySchedule: boolean;
  reminderTime: string;
}

const DEFAULT_SETTINGS: StaffNotificationSettings = {
  emailEnabled: true,
  smsEnabled: false,
  smsPlanAllowed: false,
  desktopEnabled: false,
  appointmentReminders: true,
  appointmentCancellations: true,
  appointmentReschedules: true,
  newBookings: true,
  dailySchedule: true,
  weeklySchedule: false,
  reminderTime: "24h",
};

const REMINDER_OPTIONS: { value: string; label: string }[] = [
  { value: "48h", label: "48 hours before" },
  { value: "24h", label: "24 hours before" },
  { value: "12h", label: "12 hours before" },
  { value: "6h", label: "6 hours before" },
  { value: "2h", label: "2 hours before" },
  { value: "1h", label: "1 hour before" },
  { value: "30m", label: "30 minutes before" },
  { value: "15m", label: "15 minutes before" },
];

function isOwnerRole(role: string | null): boolean {
  return role === "provider_owner" || role === "superadmin";
}

export default function StaffNotificationSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { role } = useProvider();
  const canEdit = isOwnerRole(role);

  const { data, loading, error, refresh } = useApi<StaffNotificationSettings>(
    id ? `/api/provider/staff/${id}/notifications` : "",
    { enabled: !!id }
  );
  const { execute: patchNotif, loading: saving } = useApiMutation<StaffNotificationSettings>("patch");

  const [local, setLocal] = useState<StaffNotificationSettings>(DEFAULT_SETTINGS);
  const [reminderModal, setReminderModal] = useState(false);

  useEffect(() => {
    if (data && typeof data === "object") {
      setLocal({ ...DEFAULT_SETTINGS, ...data });
    }
  }, [data]);

  const applyPatch = useCallback(
    async (body: Record<string, unknown>, rollback: StaffNotificationSettings) => {
      if (!id || !canEdit) return;
      const { error: err } = await patchNotif(`/api/provider/staff/${id}/notifications`, body);
      if (err) {
        setLocal(rollback);
        Alert.alert("Could not save", err);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refresh();
    },
    [id, canEdit, patchNotif, refresh]
  );

  const toggle = useCallback(
    (key: keyof StaffNotificationSettings, value: boolean) => {
      if (!canEdit) {
        Alert.alert("View only", "Only the business owner can change team notification settings.");
        return;
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const snakeMap: Partial<Record<keyof StaffNotificationSettings, string>> = {
        emailEnabled: "email_enabled",
        smsEnabled: "sms_enabled",
        desktopEnabled: "desktop_enabled",
        appointmentReminders: "appointment_reminders",
        appointmentCancellations: "appointment_cancellations",
        appointmentReschedules: "appointment_reschedules",
        newBookings: "new_bookings",
        dailySchedule: "daily_schedule",
        weeklySchedule: "weekly_schedule",
        reminderTime: "reminder_time",
      };
      const sk = snakeMap[key];
      if (!sk) return;

      setLocal((prev) => {
        if (key === "smsEnabled" && value && !prev.smsPlanAllowed) {
          Alert.alert(
            "SMS not available",
            "Staff SMS is included only on subscription plans that enable it."
          );
          return prev;
        }
        const rollback = { ...prev };
        const next = { ...prev, [key]: value };
        void applyPatch({ [sk]: value }, rollback);
        return next;
      });
    },
    [canEdit, applyPatch]
  );

  const setReminderTime = useCallback(
    (value: string) => {
      if (!canEdit) return;
      setReminderModal(false);
      setLocal((prev) => {
        const rollback = { ...prev };
        void applyPatch({ reminder_time: value }, rollback);
        return { ...prev, reminderTime: value };
      });
    },
    [canEdit, applyPatch]
  );

  if (!id) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Notifications" showBack />
        <LoadingState message="No staff member selected" />
      </ScreenContainer>
    );
  }

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <LoadingState message="Loading notification settings..." />
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Notifications" showBack />
        <ErrorState message={error} onRetry={refresh} />
      </ScreenContainer>
    );
  }

  const reminderLabel =
    REMINDER_OPTIONS.find((o) => o.value === local.reminderTime)?.label ?? local.reminderTime;

  return (
    <ScreenContainer>
      <ScreenHeader
        title="Staff notifications"
        showBack
        subtitle={canEdit ? "Channels & alerts for this person" : "View only (owner edits)"}
      />
      <ScrollView style={twStyle("flex-1")} contentContainerStyle={twStyle("pb-10")} showsVerticalScrollIndicator={false}>
        {!canEdit ? (
          <Text style={twStyle("mb-4 px-1 text-sm text-amber-800")}>
            Only the business owner can update team notification settings.
          </Text>
        ) : null}

        <SectionHeader title="Channels" />
        <View style={twStyle("mb-6 overflow-hidden rounded-2xl border border-gray-100 bg-white")}>
          <RowSwitch
            label="Email"
            sub="Booking and schedule emails"
            value={local.emailEnabled}
            onValueChange={(v) => toggle("emailEnabled", v)}
            disabled={!canEdit || saving}
          />
          <RowSwitch
            label="SMS"
            sub={
              local.smsPlanAllowed
                ? "Text messages to their mobile"
                : "Upgrade your plan to enable staff SMS"
            }
            value={local.smsEnabled}
            onValueChange={(v) => toggle("smsEnabled", v)}
            disabled={!canEdit || saving || !local.smsPlanAllowed}
          />
          <RowSwitch
            label="Desktop"
            sub="Browser notifications where supported"
            value={local.desktopEnabled}
            onValueChange={(v) => toggle("desktopEnabled", v)}
            disabled={!canEdit || saving}
            last
          />
        </View>

        <SectionHeader title="What to notify" />
        <View style={twStyle("mb-6 overflow-hidden rounded-2xl border border-gray-100 bg-white")}>
          <RowSwitch
            label="Appointment reminders"
            sub="Before upcoming appointments"
            value={local.appointmentReminders}
            onValueChange={(v) => toggle("appointmentReminders", v)}
            disabled={!canEdit || saving}
          />
          <RowSwitch
            label="Cancellations"
            sub="When appointments are cancelled"
            value={local.appointmentCancellations}
            onValueChange={(v) => toggle("appointmentCancellations", v)}
            disabled={!canEdit || saving}
          />
          <RowSwitch
            label="Reschedules"
            sub="When appointments move"
            value={local.appointmentReschedules}
            onValueChange={(v) => toggle("appointmentReschedules", v)}
            disabled={!canEdit || saving}
          />
          <RowSwitch
            label="New bookings"
            sub="New appointments assigned to them"
            value={local.newBookings}
            onValueChange={(v) => toggle("newBookings", v)}
            disabled={!canEdit || saving}
          />
          <RowSwitch
            label="Daily schedule"
            sub="Daily summary"
            value={local.dailySchedule}
            onValueChange={(v) => toggle("dailySchedule", v)}
            disabled={!canEdit || saving}
          />
          <RowSwitch
            label="Weekly schedule"
            sub="Weekly summary"
            value={local.weeklySchedule}
            onValueChange={(v) => toggle("weeklySchedule", v)}
            disabled={!canEdit || saving}
            last
          />
        </View>

        {local.appointmentReminders ? (
          <>
            <SectionHeader title="Reminder timing" />
            <TouchableOpacity
              onPress={() => canEdit && setReminderModal(true)}
              disabled={!canEdit || saving}
              style={twStyle("mb-8 flex-row items-center justify-between rounded-2xl border border-gray-100 bg-white px-4 py-3.5")}
            >
              <View style={twStyle("flex-1 pr-2")}>
                <Text style={twStyle("text-sm font-medium text-gray-900")}>Send reminders</Text>
                <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>{reminderLabel}</Text>
              </View>
              <Text style={twStyle("text-sm text-indigo-600")}>{canEdit ? "Change" : ""}</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </ScrollView>

      <Modal visible={reminderModal} animationType="slide" transparent>
        <View style={twStyle("flex-1 justify-end bg-black/40")}>
          <View style={twStyle("max-h-[70%] rounded-t-2xl bg-white pb-8 pt-2")}>
            <Text style={twStyle("mb-2 px-4 text-center text-base font-semibold text-gray-900")}>
              Reminder time
            </Text>
            <FlatList
              data={REMINDER_OPTIONS}
              keyExtractor={(item: { value: string }) => item.value}
              renderItem={({ item }: { item: { value: string; label: string } }) => (
                <TouchableOpacity
                  style={twStyle("border-b border-gray-50 px-4 py-3.5")}
                  onPress={() => setReminderTime(item.value)}
                >
                  <Text
                    style={twStyle(
                      item.value === local.reminderTime
                        ? "text-base font-semibold text-indigo-600"
                        : "text-base text-gray-900"
                    )}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={twStyle("mt-2 px-4 py-3")} onPress={() => setReminderModal(false)}>
              <Text style={twStyle("text-center text-base text-gray-600")}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

function RowSwitch(props: {
  label: string;
  sub: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
  last?: boolean;
}) {
  return (
    <View
      style={[
        twStyle("flex-row items-center justify-between px-4 py-3.5"),
        !props.last && twStyle("border-b border-gray-50"),
      ]}
    >
      <View style={twStyle("flex-1 pr-3")}>
        <Text style={twStyle("text-sm text-gray-900")}>{props.label}</Text>
        <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>{props.sub}</Text>
      </View>
      <Switch
        value={props.value}
        onValueChange={props.onValueChange}
        disabled={props.disabled}
        trackColor={{ false: "#d1d5db", true: "#6366f1" }}
        thumbColor="#fff"
      />
    </View>
  );
}
