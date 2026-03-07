import { useState, useEffect, useCallback, useMemo } from "react";
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
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { twStyle } from "@/lib/twStyle";

interface ChannelPrefs {
  email?: boolean;
  sms?: boolean;
  push?: boolean;
}

interface NotificationPreferences {
  booking_updates?: ChannelPrefs;
  booking_cancellations?: ChannelPrefs;
  booking_reminders?: ChannelPrefs;
  new_reviews?: ChannelPrefs;
  review_responses?: ChannelPrefs;
  client_messages?: ChannelPrefs;
  payment_received?: ChannelPrefs;
  payout_updates?: ChannelPrefs;
  waitlist_notifications?: ChannelPrefs;
  system_updates?: ChannelPrefs;
  marketing?: ChannelPrefs;
  unsubscribe_marketing?: boolean;
}

const SECTIONS: { id: keyof NotificationPreferences; title: string; description: string }[] = [
  { id: "booking_updates", title: "Booking updates", description: "When bookings are created, updated, or rescheduled" },
  { id: "booking_cancellations", title: "Booking cancellations", description: "When clients cancel appointments" },
  { id: "booking_reminders", title: "Booking reminders", description: "Reminders about upcoming appointments" },
  { id: "new_reviews", title: "New reviews", description: "When customers leave reviews" },
  { id: "client_messages", title: "Client messages", description: "Messages from clients" },
  { id: "payment_received", title: "Payment received", description: "When payments are received" },
  { id: "payout_updates", title: "Payout updates", description: "Payout requests and processing" },
  { id: "waitlist_notifications", title: "Waitlist", description: "Waitlist activity" },
  { id: "system_updates", title: "System updates", description: "Important announcements" },
  { id: "marketing", title: "Marketing & promotions", description: "Marketing emails and offers" },
];

const defaultChannel = (): ChannelPrefs => ({ email: true, sms: false, push: true });

export default function SettingsNotificationPreferencesScreen() {
  const router = useRouter();
  const { data, loading, error, refresh } = useApi<NotificationPreferences | { data?: NotificationPreferences }>(
    "/api/provider/notification-preferences"
  );
  const { execute: patchPrefs, loading: saving } = useApiMutation("patch");

  const prefs = useMemo(
    () =>
      (data as NotificationPreferences)?.booking_updates !== undefined
        ? (data as NotificationPreferences)
        : (data as any)?.data ?? {},
    [data]
  );

  const [localPrefs, setLocalPrefs] = useState<NotificationPreferences>({});

  useEffect(() => {
    if (Object.keys(prefs).length > 0) {
      setLocalPrefs(prefs);
    }
  }, [prefs]);

  const updateSection = useCallback(
    async (sectionId: string, channel: "email" | "sms" | "push", value: boolean) => {
      const current = (localPrefs as any)[sectionId] ?? defaultChannel();
      const next = { ...current, [channel]: value };
      setLocalPrefs((p) => ({ ...p, [sectionId]: next }));
      const res = await patchPrefs("/api/provider/notification-preferences", { [sectionId]: next }) as { error?: string };
      if (res.error) {
        setLocalPrefs((p) => ({ ...p, [sectionId]: current }));
        Alert.alert("Error", res.error);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    },
    [localPrefs, patchPrefs]
  );

  const toggleMarketing = useCallback(async () => {
    const next = !localPrefs.unsubscribe_marketing;
    setLocalPrefs((p) => ({ ...p, unsubscribe_marketing: next }));
    const res = await patchPrefs("/api/provider/notification-preferences", { unsubscribe_marketing: next }) as { error?: string };
    if (res.error) {
      setLocalPrefs((p) => ({ ...p, unsubscribe_marketing: !next }));
      Alert.alert("Error", res.error);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [localPrefs.unsubscribe_marketing, patchPrefs]);

  if (loading && Object.keys(localPrefs).length === 0) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Notification preferences" onBack={() => router.back()} />
        <LoadingState message="Loading..." />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader
        title="Notification preferences"
        subtitle="How you receive notifications"
        onBack={() => router.back()}
      />

      <ScrollView
        style={twStyle("flex-1")}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {error && (
          <View style={twStyle("mx-2 mb-3 rounded-xl border border-red-200 bg-red-50 p-3")}>
            <Text style={twStyle("text-sm text-red-700")}>{error}</Text>
            <TouchableOpacity onPress={() => refresh()} style={twStyle("mt-2")}>
              <Text style={twStyle("text-sm font-medium text-red-700")}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {SECTIONS.filter((s) => s.id !== "unsubscribe_marketing").map((section) => {
          const channel = (localPrefs[section.id] as ChannelPrefs) ?? defaultChannel();
          return (
            <View key={section.id} style={twStyle("mb-4 rounded-xl border border-gray-200 bg-white overflow-hidden")}>
              <View style={twStyle("border-b border-gray-100 px-4 py-3")}>
                <Text style={twStyle("text-base font-semibold text-gray-900")}>{section.title}</Text>
                <Text style={twStyle("mt-0.5 text-sm text-gray-500")}>{section.description}</Text>
              </View>
              <View style={twStyle("px-4 py-2")}>
                <View style={twStyle("flex-row items-center justify-between py-2")}>
                  <Ionicons name="mail-outline" size={20} color="#6b7280" />
                  <Text style={twStyle("flex-1 ml-3 text-sm text-gray-700")}>Email</Text>
                  <Switch
                    value={channel.email !== false}
                    onValueChange={(v) => updateSection(section.id, "email", v)}
                    disabled={saving}
                  />
                </View>
                <View style={twStyle("flex-row items-center justify-between py-2")}>
                  <Ionicons name="chatbubble-outline" size={20} color="#6b7280" />
                  <Text style={twStyle("flex-1 ml-3 text-sm text-gray-700")}>SMS</Text>
                  <Switch
                    value={channel.sms === true}
                    onValueChange={(v) => updateSection(section.id, "sms", v)}
                    disabled={saving}
                  />
                </View>
                <View style={twStyle("flex-row items-center justify-between py-2")}>
                  <Ionicons name="notifications-outline" size={20} color="#6b7280" />
                  <Text style={twStyle("flex-1 ml-3 text-sm text-gray-700")}>Push</Text>
                  <Switch
                    value={channel.push === true}
                    onValueChange={(v) => updateSection(section.id, "push", v)}
                    disabled={saving}
                  />
                </View>
              </View>
            </View>
          );
        })}

        <View style={twStyle("mb-4 rounded-xl border border-gray-200 bg-white overflow-hidden")}>
          <View style={twStyle("px-4 py-3 flex-row items-center justify-between")}>
            <View>
              <Text style={twStyle("text-base font-semibold text-gray-900")}>Marketing & promotions</Text>
              <Text style={twStyle("mt-0.5 text-sm text-gray-500")}>Unsubscribe from marketing emails</Text>
            </View>
            <Switch
              value={localPrefs.unsubscribe_marketing === true}
              onValueChange={toggleMarketing}
              disabled={saving}
            />
          </View>
        </View>

        {saving && (
          <View style={twStyle("py-2 flex-row items-center justify-center")}>
            <ActivityIndicator size="small" color="#6366f1" />
            <Text style={twStyle("ml-2 text-sm text-gray-500")}>Saving...</Text>
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
