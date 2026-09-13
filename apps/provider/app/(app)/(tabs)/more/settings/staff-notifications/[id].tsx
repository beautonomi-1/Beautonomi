/**
 * Per-staff notification settings — GET/PATCH /api/provider/staff/[id]/notifications (owner-only PATCH).
 */
import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, Switch, TouchableOpacity, Alert, Modal, FlatList } from "react-native";
import { useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { useTranslation } from "@beautonomi/i18n";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { useProvider } from "@/providers/ProviderContext";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { twStyle } from "@/lib/twStyle";
import { useRouter } from "expo-router";
import { showPlanGateAlert } from "@/lib/plan-gate";
import { verticalFlatListPerf } from "@/lib/flatListPerformance";

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

const REMINDER_OPTIONS: { value: string; labelKey: string }[] = [
  { value: "48h", labelKey: "reminder48h" },
  { value: "24h", labelKey: "reminder24h" },
  { value: "12h", labelKey: "reminder12h" },
  { value: "6h", labelKey: "reminder6h" },
  { value: "2h", labelKey: "reminder2h" },
  { value: "1h", labelKey: "reminder1h" },
  { value: "30m", labelKey: "reminder30m" },
  { value: "15m", labelKey: "reminder15m" },
];

function isOwnerRole(role: string | null): boolean {
  return role === "provider_owner" || role === "superadmin";
}

export default function StaffNotificationSettingsScreen() {
  const { t } = useTranslation();
  const sn = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.staffNotifications.${key}`, opts) as string,
    [t],
  );
  const router = useRouter();
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
      const { error: err, errorCode } = await patchNotif(
        `/api/provider/staff/${id}/notifications`,
        body,
      );
      if (err) {
        setLocal(rollback);
        showPlanGateAlert({ title: sn("saveFailedTitle"), message: err, errorCode, router });
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refresh();
    },
    [id, canEdit, patchNotif, refresh, router, sn]
  );

  const toggle = useCallback(
    (key: keyof StaffNotificationSettings, value: boolean) => {
      if (!canEdit) {
        Alert.alert(sn("viewOnlyTitle"), sn("viewOnlyBody"));
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
          showPlanGateAlert({
            title: sn("smsUnavailableTitle"),
            message: sn("smsUnavailableBody"),
            errorCode: "SUBSCRIPTION_REQUIRED",
            router,
          });
          return prev;
        }
        const rollback = { ...prev };
        const next = { ...prev, [key]: value };
        void applyPatch({ [sk]: value }, rollback);
        return next;
      });
    },
    [canEdit, applyPatch, router, sn]
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
        <ScreenHeader title={sn("title")} showBack />
        <LoadingState message={sn("noStaffSelected")} />
      </ScreenContainer>
    );
  }

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <LoadingState message={sn("loading")} />
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title={sn("title")} showBack />
        <ErrorState message={error} onRetry={refresh} />
      </ScreenContainer>
    );
  }

  const reminderLabel =
    REMINDER_OPTIONS.find((o) => o.value === local.reminderTime)
      ? sn(REMINDER_OPTIONS.find((o) => o.value === local.reminderTime)!.labelKey)
      : local.reminderTime;

  return (
    <ScreenContainer>
      <ScreenHeader
        title={sn("screenTitle")}
        showBack
        subtitle={canEdit ? sn("subtitleEdit") : sn("subtitleView")}
      />
      <ScrollView style={twStyle("flex-1")} contentContainerStyle={twStyle("pb-10")} showsVerticalScrollIndicator={false}>
        {!canEdit ? (
          <Text style={twStyle("mb-4 px-1 text-sm text-amber-800")}>
            {sn("ownerOnlyBanner")}
          </Text>
        ) : null}

        <SectionHeader title={sn("sectionChannels")} />
        <View style={twStyle("mb-6 overflow-hidden rounded-2xl border border-gray-100 bg-white")}>
          <RowSwitch
            label={sn("email")}
            sub={sn("emailSub")}
            value={local.emailEnabled}
            onValueChange={(v) => toggle("emailEnabled", v)}
            disabled={!canEdit || saving}
          />
          <RowSwitch
            label={sn("sms")}
            sub={
              local.smsPlanAllowed
                ? sn("smsSubAllowed")
                : sn("smsSubUpgrade")
            }
            value={local.smsEnabled}
            onValueChange={(v) => toggle("smsEnabled", v)}
            disabled={!canEdit || saving || !local.smsPlanAllowed}
          />
          <RowSwitch
            label={sn("desktop")}
            sub={sn("desktopSub")}
            value={local.desktopEnabled}
            onValueChange={(v) => toggle("desktopEnabled", v)}
            disabled={!canEdit || saving}
            last
          />
        </View>

        <SectionHeader title={sn("sectionWhat")} />
        <View style={twStyle("mb-6 overflow-hidden rounded-2xl border border-gray-100 bg-white")}>
          <RowSwitch
            label={sn("appointmentReminders")}
            sub={sn("appointmentRemindersSub")}
            value={local.appointmentReminders}
            onValueChange={(v) => toggle("appointmentReminders", v)}
            disabled={!canEdit || saving}
          />
          <RowSwitch
            label={sn("cancellations")}
            sub={sn("cancellationsSub")}
            value={local.appointmentCancellations}
            onValueChange={(v) => toggle("appointmentCancellations", v)}
            disabled={!canEdit || saving}
          />
          <RowSwitch
            label={sn("reschedules")}
            sub={sn("reschedulesSub")}
            value={local.appointmentReschedules}
            onValueChange={(v) => toggle("appointmentReschedules", v)}
            disabled={!canEdit || saving}
          />
          <RowSwitch
            label={sn("newBookings")}
            sub={sn("newBookingsSub")}
            value={local.newBookings}
            onValueChange={(v) => toggle("newBookings", v)}
            disabled={!canEdit || saving}
          />
          <RowSwitch
            label={sn("dailySchedule")}
            sub={sn("dailyScheduleSub")}
            value={local.dailySchedule}
            onValueChange={(v) => toggle("dailySchedule", v)}
            disabled={!canEdit || saving}
          />
          <RowSwitch
            label={sn("weeklySchedule")}
            sub={sn("weeklyScheduleSub")}
            value={local.weeklySchedule}
            onValueChange={(v) => toggle("weeklySchedule", v)}
            disabled={!canEdit || saving}
            last
          />
        </View>

        {local.appointmentReminders ? (
          <>
            <SectionHeader title={sn("sectionReminderTiming")} />
            <TouchableOpacity
              onPress={() => canEdit && setReminderModal(true)}
              disabled={!canEdit || saving}
              style={twStyle("mb-8 flex-row items-center justify-between rounded-2xl border border-gray-100 bg-white px-4 py-3.5")}
            >
              <View style={twStyle("flex-1 pe-2")}>
                <Text style={twStyle("text-sm font-medium text-gray-900")}>{sn("sendReminders")}</Text>
                <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>{reminderLabel}</Text>
              </View>
              <Text style={twStyle("text-sm text-indigo-600")}>{canEdit ? sn("change") : ""}</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </ScrollView>

      <Modal visible={reminderModal} animationType="slide" transparent>
        <View style={twStyle("flex-1 justify-end bg-black/40")}>
          <View style={twStyle("max-h-[70%] rounded-t-2xl bg-white pb-8 pt-2")}>
            <Text style={twStyle("mb-2 px-4 text-center text-base font-semibold text-gray-900")}>
              {sn("reminderTimeTitle")}
            </Text>
            <FlatList
              {...verticalFlatListPerf}
              data={REMINDER_OPTIONS}
              keyExtractor={(item: { value: string }) => item.value}
              renderItem={({ item }: { item: { value: string; labelKey: string } }) => (
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
                    {sn(item.labelKey)}
                  </Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={twStyle("mt-2 px-4 py-3")} onPress={() => setReminderModal(false)}>
              <Text style={twStyle("text-center text-base text-gray-600")}>{sn("cancel")}</Text>
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
      <View style={twStyle("flex-1 pe-3")}>
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
