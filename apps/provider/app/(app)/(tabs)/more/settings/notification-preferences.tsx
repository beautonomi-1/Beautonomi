import { useState, useEffect } from "react";
import { View, Text, Switch, Alert, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { LoadingState } from "@/components/ui/LoadingState";
import { twStyle } from "@/lib/twStyle";

interface ChannelPrefs {
  email: boolean;
  sms: boolean;
  push: boolean;
}

interface NotifPreferences {
  booking_updates: ChannelPrefs;
  booking_cancellations: ChannelPrefs;
  booking_reminders: ChannelPrefs;
  new_reviews: ChannelPrefs;
  client_messages: ChannelPrefs;
  payment_received: ChannelPrefs;
  payout_updates: ChannelPrefs;
  waitlist_notifications: ChannelPrefs;
  system_updates: ChannelPrefs;
  marketing: ChannelPrefs;
  quiet_hours_enabled?: boolean;
  quiet_hours_start?: string;
  quiet_hours_end?: string;
  digest_mode?: "none" | "daily" | "weekly";
  [key: string]: ChannelPrefs | boolean | string | undefined;
}

const PREF_LABELS: Record<string, { label: string; icon: string }> = {
  booking_updates: { label: "Booking Updates", icon: "calendar-outline" },
  booking_cancellations: { label: "Cancellations", icon: "close-circle-outline" },
  booking_reminders: { label: "Booking Reminders", icon: "alarm-outline" },
  new_reviews: { label: "New Reviews", icon: "star-outline" },
  client_messages: { label: "Client Messages", icon: "chatbubble-outline" },
  payment_received: { label: "Payment Received", icon: "card-outline" },
  payout_updates: { label: "Payout Updates", icon: "wallet-outline" },
  waitlist_notifications: { label: "Waitlist", icon: "hourglass-outline" },
  system_updates: { label: "System Updates", icon: "settings-outline" },
  marketing: { label: "Marketing", icon: "megaphone-outline" },
};

const SECTIONS = [
  {
    title: "Bookings",
    keys: ["booking_updates", "booking_cancellations", "booking_reminders"],
  },
  {
    title: "Communication",
    keys: ["client_messages", "new_reviews", "waitlist_notifications"],
  },
  { title: "Payments", keys: ["payment_received", "payout_updates"] },
  { title: "Other", keys: ["system_updates", "marketing"] },
];

const DEFAULT_PREFS: NotifPreferences = {
  booking_updates: { email: true, sms: true, push: true },
  booking_cancellations: { email: true, sms: true, push: true },
  booking_reminders: { email: true, sms: true, push: true },
  new_reviews: { email: true, sms: false, push: true },
  client_messages: { email: true, sms: true, push: true },
  payment_received: { email: true, sms: false, push: true },
  payout_updates: { email: true, sms: true, push: true },
  waitlist_notifications: { email: true, sms: false, push: true },
  system_updates: { email: true, sms: false, push: false },
  marketing: { email: true, sms: false, push: false },
  quiet_hours_enabled: false,
  quiet_hours_start: "22:00",
  quiet_hours_end: "07:00",
  digest_mode: "none",
};

const DIGEST_OPTIONS = [
  { label: "Instant", value: "none", desc: "Get notified immediately" },
  { label: "Daily Digest", value: "daily", desc: "Summary once a day" },
  { label: "Weekly Digest", value: "weekly", desc: "Summary once a week" },
];

export default function NotificationPreferencesScreen() {
  const { data: prefs, loading, refresh } =
    useApi<NotifPreferences>("/api/provider/notification-preferences");
  const { execute: savePrefs, loading: saving } = useApiMutation("patch");
  const { execute: testNotif, loading: testing } = useApiMutation("post");
  const [local, setLocal] = useState<NotifPreferences>(DEFAULT_PREFS);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (prefs) {
      const merged = { ...DEFAULT_PREFS };
      for (const key of Object.keys(DEFAULT_PREFS)) {
        if (prefs[key] !== undefined) {
          (merged as any)[key] =
            typeof prefs[key] === "object"
              ? { ...(DEFAULT_PREFS as any)[key], ...(prefs[key] as any) }
              : prefs[key];
        }
      }
      setLocal(merged);
      setDirty(false);
    }
  }, [prefs]);

  function toggle(key: string, channel: "email" | "sms" | "push") {
    setLocal((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] as ChannelPrefs),
        [channel]: !(prev[key] as ChannelPrefs)[channel],
      },
    }));
    setDirty(true);
  }

  function enableAllInSection(keys: string[]) {
    setLocal((prev) => {
      const next = { ...prev };
      keys.forEach((k) => {
        (next as any)[k] = { email: true, sms: true, push: true };
      });
      return next;
    });
    setDirty(true);
  }

  function disableAllInSection(keys: string[]) {
    setLocal((prev) => {
      const next = { ...prev };
      keys.forEach((k) => {
        (next as any)[k] = { email: false, sms: false, push: false };
      });
      return next;
    });
    setDirty(true);
  }

  async function handleSave() {
    const { error } = await savePrefs(
      "/api/provider/notification-preferences",
      local
    );
    if (error) {
      Alert.alert("Error", error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setDirty(false);
    refresh();
  }

  async function handleTestNotification() {
    const { error } = await testNotif(
      "/api/provider/notification-preferences/test",
      {}
    );
    if (error) Alert.alert("Error", error);
    else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Sent", "Test notification sent to all enabled channels");
    }
  }

  if (loading && !prefs) return <LoadingState />;

  return (
    <ScreenContainer>
      <ScreenHeader
        title="Notification Preferences"
        showBack
        subtitle="Control how you receive alerts"
      />

      {/* Test notification */}
      <TouchableOpacity
        style={twStyle("mb-4 flex-row items-center rounded-xl border border-indigo-100 bg-indigo-50 p-3")}
        onPress={handleTestNotification}
        disabled={testing}
      >
        <Ionicons name="notifications-outline" size={18} color="#6366f1" />
        <Text style={twStyle("ml-2 flex-1 text-sm font-medium text-indigo-700")}>
          Send Test Notification
        </Text>
        <Ionicons name="chevron-forward" size={16} color="#6366f1" />
      </TouchableOpacity>

      {/* Quiet hours */}
      <View style={twStyle("mb-4 rounded-2xl border border-gray-100 bg-white p-4")}>
        <View style={twStyle("flex-row items-center justify-between")}>
          <View style={twStyle("flex-row flex-1 items-center")}>
            <View style={twStyle("h-9 w-9 items-center justify-center rounded-lg bg-purple-50")}>
              <Ionicons name="moon-outline" size={18} color="#a855f7" />
            </View>
            <View style={twStyle("ml-3 flex-1")}>
              <Text style={twStyle("text-sm font-medium text-gray-900")}>
                Quiet Hours
              </Text>
              <Text style={twStyle("text-xs text-gray-500")}>
                {local.quiet_hours_enabled
                  ? `${local.quiet_hours_start} – ${local.quiet_hours_end}`
                  : "Mute push notifications during specified hours"}
              </Text>
            </View>
          </View>
          <Switch
            value={local.quiet_hours_enabled ?? false}
            onValueChange={(v) => {
              setLocal((p) => ({ ...p, quiet_hours_enabled: v }));
              setDirty(true);
            }}
            trackColor={{ false: "#d1d5db", true: "#c084fc" }}
            thumbColor={local.quiet_hours_enabled ? "#a855f7" : "#f4f4f5"}
          />
        </View>
      </View>

      {/* Digest mode */}
      <Text style={twStyle("mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400")}>
        Delivery Mode
      </Text>
      <View style={twStyle("mb-4 overflow-hidden rounded-2xl border border-gray-100 bg-white")}>
        {DIGEST_OPTIONS.map((opt, idx) => (
          <TouchableOpacity
            key={opt.value}
            style={twStyle(`flex-row items-center px-4 py-3.5 ${
              idx < DIGEST_OPTIONS.length - 1 ? "border-b border-gray-50" : ""
            } ${local.digest_mode === opt.value ? "bg-indigo-50/50" : ""}`)}
            onPress={() => {
              setLocal((p) => ({
                ...p,
                digest_mode: opt.value as any,
              }));
              setDirty(true);
            }}
          >
            <View style={twStyle("flex-1")}>
              <Text style={twStyle("text-sm font-medium text-gray-900")}>
                {opt.label}
              </Text>
              <Text style={twStyle("text-xs text-gray-500")}>{opt.desc}</Text>
            </View>
            {local.digest_mode === opt.value && (
              <Ionicons name="checkmark-circle" size={22} color="#6366f1" />
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Channel preferences */}
      {SECTIONS.map((section) => (
        <View key={section.title} style={twStyle("mb-5")}>
          <View style={twStyle("mb-2 flex-row items-center justify-between")}>
            <Text style={twStyle("text-xs font-semibold uppercase tracking-wider text-gray-400")}>
              {section.title}
            </Text>
            <View style={twStyle("flex-row")}>
              <TouchableOpacity
                style={{ marginRight: 8 }}
                onPress={() => enableAllInSection(section.keys)}
              >
                <Text style={twStyle("text-[10px] font-medium text-indigo-600")}>
                  Enable All
                </Text>
              </TouchableOpacity>
              <Text style={twStyle("text-[10px] text-gray-300")}>|</Text>
              <TouchableOpacity
                onPress={() => disableAllInSection(section.keys)}
              >
                <Text style={twStyle("text-[10px] font-medium text-gray-400")}>
                  Disable All
                </Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={twStyle("rounded-2xl border border-gray-100 bg-white")}>
            <View style={twStyle("flex-row items-center border-b border-gray-50 px-4 py-2")}>
              <View style={twStyle("flex-1")} />
              <Text style={twStyle("w-14 text-center text-[10px] font-semibold text-gray-400")}>
                Email
              </Text>
              <Text style={twStyle("w-14 text-center text-[10px] font-semibold text-gray-400")}>
                SMS
              </Text>
              <Text style={twStyle("w-14 text-center text-[10px] font-semibold text-gray-400")}>
                Push
              </Text>
            </View>
            {section.keys.map((key, idx) => (
              <View
                key={key}
                style={twStyle(`flex-row items-center px-4 py-3 ${
                  idx < section.keys.length - 1
                    ? "border-b border-gray-50"
                    : ""
                }`)}
              >
                <View style={twStyle("flex-row flex-1 items-center")}>
                  <Ionicons
                    name={
                      (PREF_LABELS[key]?.icon as any) ?? "notifications-outline"
                    }
                    size={16}
                    color="#6b7280"
                  />
                  <Text style={twStyle("ml-2 text-sm font-medium text-gray-900")}>
                    {PREF_LABELS[key]?.label ?? key}
                  </Text>
                </View>
                {(["email", "sms", "push"] as const).map((ch) => (
                  <View key={ch} style={twStyle("w-14 items-center")}>
                    <Switch
                      value={(local[key] as ChannelPrefs)?.[ch] ?? false}
                      onValueChange={() => toggle(key, ch)}
                      trackColor={{ false: "#e5e7eb", true: "#818cf8" }}
                      thumbColor={
                        (local[key] as ChannelPrefs)?.[ch]
                          ? "#6366f1"
                          : "#f4f4f5"
                      }
                      style={{
                        transform: [{ scaleX: 0.75 }, { scaleY: 0.75 }],
                      }}
                    />
                  </View>
                ))}
              </View>
            ))}
          </View>
        </View>
      ))}

      {dirty && (
        <View style={twStyle("mb-6")}>
          <ActionButton
            label="Save Preferences"
            onPress={handleSave}
            loading={saving}
            fullWidth
          />
        </View>
      )}
      <View style={twStyle("h-8")} />
    </ScreenContainer>
  );
}
