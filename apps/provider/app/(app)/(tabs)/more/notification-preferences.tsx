/**
 * Notification preferences – in-app screen using /api/provider/notification-preferences.
 */
import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, Switch, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";

type ChannelPrefs = { email?: boolean; sms?: boolean; push?: boolean };
type Preferences = Record<string, ChannelPrefs | boolean>;

const SECTIONS: { id: string; title: string; description: string }[] = [
  { id: "booking_updates", title: "Booking updates", description: "When bookings are created or changed" },
  { id: "booking_cancellations", title: "Booking cancellations", description: "When clients cancel" },
  { id: "booking_reminders", title: "Booking reminders", description: "Upcoming appointments" },
  { id: "new_reviews", title: "New reviews", description: "When customers leave reviews" },
  { id: "review_responses", title: "Review responses", description: "Review interactions" },
  { id: "client_messages", title: "Client messages", description: "Messages from clients" },
  { id: "payment_received", title: "Payment received", description: "When payments are received" },
  { id: "payout_updates", title: "Payout updates", description: "Payout requests and processing" },
  { id: "waitlist_notifications", title: "Waitlist", description: "Waitlist activity" },
  { id: "system_updates", title: "System updates", description: "Important announcements" },
  { id: "marketing", title: "Marketing & promotions", description: "Promotional offers" },
];

export default function NotificationPreferencesScreen() {
  const router = useRouter();
  const { data, loading, error, refresh } = useApi<Preferences>("/api/provider/notification-preferences");
  const { execute: patch, loading: saving } = useApiMutation("patch");
  const [prefs, setPrefs] = useState<Preferences>({});

  useEffect(() => {
    const raw = (data as any)?.data ?? data;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) setPrefs(raw);
  }, [data]);

  const updateSection = useCallback(
    async (sectionId: string, channelPrefs: ChannelPrefs) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const res = await patch("/api/provider/notification-preferences", { [sectionId]: channelPrefs });
      if (!res.error && data) setPrefs((prev) => ({ ...prev, [sectionId]: channelPrefs }));
    },
    [patch]
  );

  const toggleChannel = useCallback(
    (sectionId: string, channel: "email" | "sms" | "push") => {
      const current = (prefs[sectionId] as ChannelPrefs) || { email: true, sms: true, push: true };
      const next = { ...current, [channel]: !current[channel] };
      updateSection(sectionId, next);
    },
    [prefs, updateSection]
  );

  const toggleMarketing = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = !prefs.unsubscribe_marketing;
    const res = await patch("/api/provider/notification-preferences", { unsubscribe_marketing: next });
    if (!res.error) setPrefs((prev) => ({ ...prev, unsubscribe_marketing: next }));
  }, [prefs.unsubscribe_marketing, patch]);

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Notification preferences" onBack={() => router.back()} />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#FF0077" />
          <Text className="mt-3 text-gray-500">Loading…</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (error) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Notification preferences" onBack={() => router.back()} />
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-center text-gray-600">{(error as any)?.message || "Failed to load"}</Text>
          <TouchableOpacity onPress={() => refresh()} className="mt-4 rounded-xl bg-gray-900 px-6 py-3">
            <Text className="font-medium text-white">Retry</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader title="Notification preferences" subtitle="How you receive notifications" onBack={() => router.back()} />
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        <View className="px-2 pt-4">
          {SECTIONS.map((section) => {
            const isMarketing = section.id === "marketing";
            const channelPrefs = (prefs[section.id] as ChannelPrefs) || { email: true, sms: true, push: true };
            return (
              <View key={section.id} className="mb-4 rounded-2xl border border-gray-200 bg-white p-4">
                <Text className="font-semibold text-gray-900">{section.title}</Text>
                <Text className="mt-0.5 text-sm text-gray-500">{section.description}</Text>
                {isMarketing ? (
                  <View className="mt-3 flex-row items-center justify-between">
                    <Text className="text-sm text-gray-700">Email & push</Text>
                    <Switch
                      value={!prefs.unsubscribe_marketing}
                      onValueChange={toggleMarketing}
                      trackColor={{ false: "#d1d5db", true: "#FF0077" }}
                      thumbColor="#fff"
                      disabled={saving}
                    />
                  </View>
                ) : (
                  <View className="mt-3 gap-2">
                    {(["email", "sms", "push"] as const).map((ch) => (
                      <View key={ch} className="flex-row items-center justify-between">
                        <Text className="capitalize text-sm text-gray-700">{ch}</Text>
                        <Switch
                          value={!!channelPrefs[ch]}
                          onValueChange={() => toggleChannel(section.id, ch)}
                          trackColor={{ false: "#d1d5db", true: "#FF0077" }}
                          thumbColor="#fff"
                          disabled={saving}
                        />
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
