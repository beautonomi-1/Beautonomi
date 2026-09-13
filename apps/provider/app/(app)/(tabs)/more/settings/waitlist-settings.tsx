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
import { useTranslation } from "@beautonomi/i18n";
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
  const { t } = useTranslation();
  const ws = (key: string) => t(`provider.mobile.screens.waitlistSettings.${key}`) as string;
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
      Alert.alert(ws("errorTitle"), err);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    refresh();
  }

  if (loading && !apiData) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title={ws("title")} onBack={() => router.back()} />
        <View style={twStyle("flex-1 items-center justify-center py-12")}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !apiData) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title={ws("title")} onBack={() => router.back()} />
        <View style={twStyle("flex-1 justify-center px-4")}>
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  const row = (label: string, desc: string | null, children: React.ReactNode) => (
    <View style={twStyle("border-b border-gray-100 py-3.5")}>
      <View style={twStyle("flex-row items-center justify-between")}>
        <View style={twStyle("flex-1 pe-4")}>
          <Text style={twStyle("text-sm font-medium text-gray-900")}>{label}</Text>
          {desc ? <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>{desc}</Text> : null}
        </View>
        {children}
      </View>
    </View>
  );

  return (
    <ScreenContainer scrollable={false} keyboardAvoiding={false}>
      <ScreenHeader title={ws("title")} onBack={() => router.back()} subtitle={ws("subtitle")} />
      <KeyboardAvoidingView
        style={twStyle("flex-1")}
        behavior="padding"
        keyboardVerticalOffset={80}
      >
        <ScrollView
          style={twStyle("flex-1")}
          contentContainerStyle={twStyle("px-4 pb-24")}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={twStyle("mt-2 mb-3 text-sm font-semibold text-gray-700")}>{ws("sectionIntelligent")}</Text>
          <View style={twStyle("rounded-2xl border border-gray-200 bg-white px-4")}>
            {row(
              ws("enableIntelligent"),
              ws("enableIntelligentDesc"),
              <Switch value={local.enableIntelligentWaitlist} onValueChange={(v) => set("enableIntelligentWaitlist", v)} trackColor={{ false: "#d1d5db", true: "#6366f1" }} />
            )}
            {local.enableIntelligentWaitlist && (
              <>
                {row(
                  ws("autoNotify"),
                  ws("autoNotifyDesc"),
                  <Switch value={local.autoNotifyOnAvailability} onValueChange={(v) => set("autoNotifyOnAvailability", v)} trackColor={{ false: "#d1d5db", true: "#6366f1" }} />
                )}
                {row(
                  ws("notifyPriority"),
                  ws("notifyPriorityDesc"),
                  <Switch value={local.notifyPriorityFirst} onValueChange={(v) => set("notifyPriorityFirst", v)} trackColor={{ false: "#d1d5db", true: "#6366f1" }} />
                )}
                <View style={twStyle("border-b border-gray-100 py-3.5")}>
                  <Text style={twStyle("text-sm font-medium text-gray-900")}>{ws("notificationDelay")}</Text>
                  <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>{ws("notificationDelayDesc")}</Text>
                  <TextInput
                    style={twStyle("mt-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900")}
                    value={String(local.notificationDelayMinutes)}
                    onChangeText={(text) => set("notificationDelayMinutes", Math.min(60, Math.max(0, parseInt(text, 10) || 0)))}
                    keyboardType="number-pad"
                    maxLength={2}
                  />
                </View>
              </>
            )}
          </View>

          <Text style={twStyle("mt-6 mb-3 text-sm font-semibold text-gray-700")}>{ws("sectionVirtual")}</Text>
          <View style={twStyle("rounded-2xl border border-gray-200 bg-white px-4")}>
            {row(
              ws("enableVirtual"),
              ws("enableVirtualDesc"),
              <Switch value={local.enableVirtualWaitingRoom} onValueChange={(v) => set("enableVirtualWaitingRoom", v)} trackColor={{ false: "#d1d5db", true: "#6366f1" }} />
            )}
            {local.enableVirtualWaitingRoom && (
              <>
                {row(
                  ws("allowSelfCheckIn"),
                  ws("allowSelfCheckInDesc"),
                  <Switch value={local.allowClientSelfCheckIn} onValueChange={(v) => set("allowClientSelfCheckIn", v)} trackColor={{ false: "#d1d5db", true: "#6366f1" }} />
                )}
                {row(
                  ws("showWaitTime"),
                  ws("showWaitTimeDesc"),
                  <Switch value={local.showEstimatedWaitTime} onValueChange={(v) => set("showEstimatedWaitTime", v)} trackColor={{ false: "#d1d5db", true: "#6366f1" }} />
                )}
              </>
            )}
          </View>

          <Text style={twStyle("mt-6 mb-3 text-sm font-semibold text-gray-700")}>{ws("sectionOnline")}</Text>
          <View style={twStyle("rounded-2xl border border-gray-200 bg-white px-4")}>
            {row(
              ws("allowOnline"),
              ws("allowOnlineDesc"),
              <Switch value={local.allowOnlineWaitlist} onValueChange={(v) => set("allowOnlineWaitlist", v)} trackColor={{ false: "#d1d5db", true: "#6366f1" }} />
            )}
          </View>

          <Text style={twStyle("mt-6 mb-3 text-sm font-semibold text-gray-700")}>{ws("sectionGeneral")}</Text>
          <View style={twStyle("rounded-2xl border border-gray-200 bg-white px-4")}>
            <View style={twStyle("border-b border-gray-100 py-3.5")}>
              <Text style={twStyle("text-sm font-medium text-gray-900")}>{ws("maxSize")}</Text>
              <TextInput
                style={twStyle("mt-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900")}
                value={String(local.maxWaitlistSize)}
                onChangeText={(text) => set("maxWaitlistSize", Math.min(500, Math.max(10, parseInt(text, 10) || 50)))}
                keyboardType="number-pad"
              />
            </View>
            <View style={twStyle("py-3.5")}>
              <Text style={twStyle("text-sm font-medium text-gray-900")}>{ws("autoRemove")}</Text>
              <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>{ws("autoRemoveDesc")}</Text>
              <TextInput
                style={twStyle("mt-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900")}
                value={String(local.autoRemoveAfterDays)}
                onChangeText={(text) => set("autoRemoveAfterDays", Math.min(365, Math.max(1, parseInt(text, 10) || 30)))}
                keyboardType="number-pad"
              />
            </View>
          </View>

          <ActionButton label={ws("save")} onPress={handleSave} loading={saving} fullWidth style={twStyle("mt-6")} />
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
