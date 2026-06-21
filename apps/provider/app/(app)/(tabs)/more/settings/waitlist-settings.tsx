/**
 * Waitlist settings – full native screen.
 * GET/PATCH /api/provider/settings/waitlist
 */
import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, Switch, TextInput, Alert, RefreshControl, Platform } from "react-native";
import { AppKeyboardAvoidingView as KeyboardAvoidingView } from "@/components/AppKeyboardAvoidingView";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { ActionButton } from "@/components/ui/ActionButton";
import { twStyle } from "@/lib/twStyle";

interface WaitlistSettings {
  enableIntelligentWaitlist: boolean;
  autoNotifyOnAvailability: boolean;
  notifyPriorityFirst: boolean;
  notificationDelayMinutes: number;
  allowClientSelfCheckIn: boolean;
  allowOnlineWaitlist: boolean;
  maxWaitlistSize: number;
  autoRemoveAfterDays: number;
  enableVirtualWaitingRoom: boolean;
  showEstimatedWaitTime: boolean;
}

const DEFAULT_SETTINGS: WaitlistSettings = {
  enableIntelligentWaitlist: true,
  autoNotifyOnAvailability: true,
  notifyPriorityFirst: true,
  notificationDelayMinutes: 0,
  allowClientSelfCheckIn: true,
  allowOnlineWaitlist: true,
  maxWaitlistSize: 50,
  autoRemoveAfterDays: 30,
  enableVirtualWaitingRoom: true,
  showEstimatedWaitTime: true,
};

export default function WaitlistSettingsScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const { data: apiData, loading, error, refresh } = useApi<WaitlistSettings>("/api/provider/settings/waitlist");
  const [local, setLocal] = useState<WaitlistSettings>(DEFAULT_SETTINGS);
  const { execute: patch, loading: saving } = useApiMutation("patch");

  useEffect(() => {
    if (apiData && typeof apiData.enableIntelligentWaitlist === "boolean") {
      setLocal(apiData);
    }
  }, [apiData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  function set<K extends keyof WaitlistSettings>(key: K, value: WaitlistSettings[K]) {
    setLocal((s) => ({ ...s, [key]: value }));
  }

  async function handleSave() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const { error: err } = await patch("/api/provider/settings/waitlist", {
      enable_intelligent_waitlist: local.enableIntelligentWaitlist,
      auto_notify_on_availability: local.autoNotifyOnAvailability,
      notify_priority_first: local.notifyPriorityFirst,
      notification_delay_minutes: local.notificationDelayMinutes,
      allow_client_self_check_in: local.allowClientSelfCheckIn,
      allow_online_waitlist: local.allowOnlineWaitlist,
      max_waitlist_size: local.maxWaitlistSize,
      auto_remove_after_days: local.autoRemoveAfterDays,
      enable_virtual_waiting_room: local.enableVirtualWaitingRoom,
      show_estimated_wait_time: local.showEstimatedWaitTime,
    });
    if (err) {
      Alert.alert("Error", err);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    refresh();
  }

  if (loading && !apiData) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Waitlist settings" onBack={() => router.back()} />
        <View style={twStyle("flex-1 items-center justify-center py-12")}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !apiData) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Waitlist settings" onBack={() => router.back()} />
        <View style={twStyle("flex-1 justify-center px-4")}>
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  const row = (label: string, desc: string | null, children: React.ReactNode) => (
    <View style={twStyle("border-b border-gray-100 py-3.5")}>
      <View style={twStyle("flex-row items-center justify-between")}>
        <View style={twStyle("flex-1 pr-4")}>
          <Text style={twStyle("text-sm font-medium text-gray-900")}>{label}</Text>
          {desc ? <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>{desc}</Text> : null}
        </View>
        {children}
      </View>
    </View>
  );

  return (
    <ScreenContainer scrollable={false} keyboardAvoiding={false}>
      <ScreenHeader title="Waitlist settings" onBack={() => router.back()} subtitle="Configure waitlist and waiting room" />
      <KeyboardAvoidingView
        style={twStyle("flex-1")}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={80}
      >
        <ScrollView
          style={twStyle("flex-1")}
          contentContainerStyle={twStyle("px-4 pb-24")}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={twStyle("mt-2 mb-3 text-sm font-semibold text-gray-700")}>Intelligent waitlist</Text>
          <View style={twStyle("rounded-2xl border border-gray-200 bg-white px-4")}>
            {row(
              "Enable intelligent waitlist",
              "Notify clients when slots become available",
              <Switch value={local.enableIntelligentWaitlist} onValueChange={(v) => set("enableIntelligentWaitlist", v)} trackColor={{ false: "#d1d5db", true: "#6366f1" }} />
            )}
            {local.enableIntelligentWaitlist && (
              <>
                {row(
                  "Auto-notify when slots open",
                  "Send notifications when appointments are cancelled or new slots open",
                  <Switch value={local.autoNotifyOnAvailability} onValueChange={(v) => set("autoNotifyOnAvailability", v)} trackColor={{ false: "#d1d5db", true: "#6366f1" }} />
                )}
                {row(
                  "Notify high priority first",
                  "High priority entries get notified before others",
                  <Switch value={local.notifyPriorityFirst} onValueChange={(v) => set("notifyPriorityFirst", v)} trackColor={{ false: "#d1d5db", true: "#6366f1" }} />
                )}
                <View style={twStyle("border-b border-gray-100 py-3.5")}>
                  <Text style={twStyle("text-sm font-medium text-gray-900")}>Notification delay (minutes)</Text>
                  <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>Wait before sending to avoid spam</Text>
                  <TextInput
                    style={twStyle("mt-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900")}
                    value={String(local.notificationDelayMinutes)}
                    onChangeText={(t) => set("notificationDelayMinutes", Math.min(60, Math.max(0, parseInt(t, 10) || 0)))}
                    keyboardType="number-pad"
                    maxLength={2}
                  />
                </View>
              </>
            )}
          </View>

          <Text style={twStyle("mt-6 mb-3 text-sm font-semibold text-gray-700")}>Virtual waiting room</Text>
          <View style={twStyle("rounded-2xl border border-gray-200 bg-white px-4")}>
            {row(
              "Enable virtual waiting room",
              "Clients can check in and wait virtually",
              <Switch value={local.enableVirtualWaitingRoom} onValueChange={(v) => set("enableVirtualWaitingRoom", v)} trackColor={{ false: "#d1d5db", true: "#6366f1" }} />
            )}
            {local.enableVirtualWaitingRoom && (
              <>
                {row(
                  "Allow client self check-in",
                  "Clients can check themselves in via app or booking",
                  <Switch value={local.allowClientSelfCheckIn} onValueChange={(v) => set("allowClientSelfCheckIn", v)} trackColor={{ false: "#d1d5db", true: "#6366f1" }} />
                )}
                {row(
                  "Show estimated wait time",
                  "Display estimated wait time in the waiting room",
                  <Switch value={local.showEstimatedWaitTime} onValueChange={(v) => set("showEstimatedWaitTime", v)} trackColor={{ false: "#d1d5db", true: "#6366f1" }} />
                )}
              </>
            )}
          </View>

          <Text style={twStyle("mt-6 mb-3 text-sm font-semibold text-gray-700")}>Online waitlist</Text>
          <View style={twStyle("rounded-2xl border border-gray-200 bg-white px-4")}>
            {row(
              "Allow clients to join waitlist online",
              "When no slots available in online booking",
              <Switch value={local.allowOnlineWaitlist} onValueChange={(v) => set("allowOnlineWaitlist", v)} trackColor={{ false: "#d1d5db", true: "#6366f1" }} />
            )}
          </View>

          <Text style={twStyle("mt-6 mb-3 text-sm font-semibold text-gray-700")}>General</Text>
          <View style={twStyle("rounded-2xl border border-gray-200 bg-white px-4")}>
            <View style={twStyle("border-b border-gray-100 py-3.5")}>
              <Text style={twStyle("text-sm font-medium text-gray-900")}>Max waitlist size</Text>
              <TextInput
                style={twStyle("mt-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900")}
                value={String(local.maxWaitlistSize)}
                onChangeText={(t) => set("maxWaitlistSize", Math.min(500, Math.max(10, parseInt(t, 10) || 50)))}
                keyboardType="number-pad"
              />
            </View>
            <View style={twStyle("py-3.5")}>
              <Text style={twStyle("text-sm font-medium text-gray-900")}>Auto-remove after (days)</Text>
              <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>Remove entries not converted to appointment</Text>
              <TextInput
                style={twStyle("mt-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900")}
                value={String(local.autoRemoveAfterDays)}
                onChangeText={(t) => set("autoRemoveAfterDays", Math.min(365, Math.max(1, parseInt(t, 10) || 30)))}
                keyboardType="number-pad"
              />
            </View>
          </View>

          <ActionButton label="Save settings" onPress={handleSave} loading={saving} fullWidth style={twStyle("mt-6")} />
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
