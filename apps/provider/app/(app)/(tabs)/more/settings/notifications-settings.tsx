import { useState, useEffect, useMemo } from "react";
import { View, Text, TouchableOpacity, Alert, Switch } from "react-native";
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

interface NotificationPrefs {
  booking_updates: ChannelPrefs;
  booking_cancellations: ChannelPrefs;
  booking_reminders: ChannelPrefs;
  new_reviews: ChannelPrefs;
  review_responses: ChannelPrefs;
  client_messages: ChannelPrefs;
  payment_received: ChannelPrefs;
  payout_updates: ChannelPrefs;
  waitlist_notifications: ChannelPrefs;
  system_updates: ChannelPrefs;
  marketing: ChannelPrefs;
  unsubscribe_marketing: boolean;
}

const DEFAULT_CHANNEL: ChannelPrefs = { email: true, sms: true, push: true };

const DEFAULT_PREFS: NotificationPrefs = {
  booking_updates: { ...DEFAULT_CHANNEL },
  booking_cancellations: { ...DEFAULT_CHANNEL },
  booking_reminders: { ...DEFAULT_CHANNEL },
  new_reviews: { email: true, sms: false, push: true },
  review_responses: { email: true, sms: false, push: true },
  client_messages: { ...DEFAULT_CHANNEL },
  payment_received: { email: true, sms: false, push: true },
  payout_updates: { ...DEFAULT_CHANNEL },
  waitlist_notifications: { email: true, sms: false, push: true },
  system_updates: { email: true, sms: false, push: false },
  marketing: { email: true, sms: false, push: false },
  unsubscribe_marketing: false,
};

type PrefsCategory = Exclude<keyof NotificationPrefs, "unsubscribe_marketing">;

interface SectionItem {
  label: string;
  key: PrefsCategory;
  icon: string;
}

const PUSH_SECTIONS: SectionItem[] = [
  { label: "New Bookings", key: "booking_updates", icon: "calendar-outline" },
  { label: "Cancellations", key: "booking_cancellations", icon: "close-circle-outline" },
  { label: "Reminders", key: "booking_reminders", icon: "alarm-outline" },
  { label: "Reviews", key: "new_reviews", icon: "star-outline" },
  { label: "Messages", key: "client_messages", icon: "chatbubble-outline" },
  { label: "Payments", key: "payment_received", icon: "card-outline" },
];

const EMAIL_SECTIONS: SectionItem[] = [
  { label: "New Bookings", key: "booking_updates", icon: "calendar-outline" },
  { label: "Cancellations", key: "booking_cancellations", icon: "close-circle-outline" },
  { label: "Reviews", key: "new_reviews", icon: "star-outline" },
  { label: "Payouts", key: "payout_updates", icon: "wallet-outline" },
  { label: "System Updates", key: "system_updates", icon: "settings-outline" },
  { label: "Marketing", key: "marketing", icon: "megaphone-outline" },
];

const SMS_SECTIONS: SectionItem[] = [
  { label: "New Bookings", key: "booking_updates", icon: "calendar-outline" },
  { label: "Cancellations", key: "booking_cancellations", icon: "close-circle-outline" },
  { label: "Reminders", key: "booking_reminders", icon: "alarm-outline" },
];

export default function NotificationSettingsScreen() {
  const { data: prefs, loading, refresh } = useApi<NotificationPrefs>(
    "/api/provider/notification-preferences"
  );
  const { execute: savePrefs, loading: saving } = useApiMutation("patch");
  const { execute: testNotif, loading: testing } = useApiMutation("post");

  const [form, setForm] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (prefs) {
      setForm({ ...DEFAULT_PREFS, ...prefs });
      setDirty(false);
    }
  }, [prefs]);

  function toggleChannel(category: PrefsCategory, channel: keyof ChannelPrefs) {
    setForm((prev) => ({
      ...prev,
      [category]: {
        ...prev[category],
        [channel]: !(prev[category] as ChannelPrefs)[channel],
      },
    }));
    setDirty(true);
  }

  function enableAll(items: SectionItem[], channel: keyof ChannelPrefs) {
    setForm((prev) => {
      const next = { ...prev };
      items.forEach((item) => {
        (next[item.key] as ChannelPrefs) = {
          ...(next[item.key] as ChannelPrefs),
          [channel]: true,
        };
      });
      return next;
    });
    setDirty(true);
  }

  function disableAll(items: SectionItem[], channel: keyof ChannelPrefs) {
    setForm((prev) => {
      const next = { ...prev };
      items.forEach((item) => {
        (next[item.key] as ChannelPrefs) = {
          ...(next[item.key] as ChannelPrefs),
          [channel]: false,
        };
      });
      return next;
    });
    setDirty(true);
  }

  const enabledCount = useMemo(() => {
    let count = 0;
    const keys: PrefsCategory[] = [
      "booking_updates", "booking_cancellations", "booking_reminders",
      "new_reviews", "review_responses", "client_messages",
      "payment_received", "payout_updates", "waitlist_notifications",
      "system_updates", "marketing",
    ];
    keys.forEach((k) => {
      const ch = form[k] as ChannelPrefs;
      if (ch.email) count++;
      if (ch.sms) count++;
      if (ch.push) count++;
    });
    return count;
  }, [form]);

  async function handleSave() {
    const { error } = await savePrefs(
      "/api/provider/notification-preferences",
      form as unknown as Record<string, unknown>
    );
    if (error) Alert.alert("Error", error);
    else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDirty(false);
      refresh();
    }
  }

  async function handleTest() {
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

  if (loading) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Notifications" showBack />
        <LoadingState />
      </ScreenContainer>
    );
  }

  function renderSection(
    title: string,
    icon: string,
    items: SectionItem[],
    channel: keyof ChannelPrefs
  ) {
    const allEnabled = items.every(
      (item) => (form[item.key] as ChannelPrefs)[channel]
    );

    return (
      <View style={twStyle("mb-5")}>
        <View style={twStyle("mb-2 flex-row items-center justify-between")}>
          <View style={twStyle("flex-row items-center")}>
            <Ionicons name={icon as any} size={14} color="#6b7280" style={{ marginRight: 8 }} />
            <Text style={twStyle("text-xs font-semibold uppercase tracking-wider text-gray-400")}>
              {title}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() =>
              allEnabled
                ? disableAll(items, channel)
                : enableAll(items, channel)
            }
          >
            <Text style={twStyle("text-[10px] font-medium text-indigo-600")}>
              {allEnabled ? "Disable All" : "Enable All"}
            </Text>
          </TouchableOpacity>
        </View>
        <View style={twStyle("overflow-hidden rounded-2xl border border-gray-100 bg-white")}>
          {items.map((item, idx) => {
            const value = (form[item.key] as ChannelPrefs)[channel];
            return (
              <TouchableOpacity
                key={`${item.key}-${channel}`}
                style={twStyle(`flex-row items-center justify-between px-4 py-3.5 ${
                  idx < items.length - 1 ? "border-b border-gray-50" : ""
                }`)}
                onPress={() => toggleChannel(item.key, channel)}
                activeOpacity={0.7}
              >
                <View style={twStyle("flex-row items-center")}>
                  <Ionicons
                    name={item.icon as any}
                    style={{ marginRight: 10 }}
                    size={16}
                    color={value ? "#6366f1" : "#9ca3af"}
                  />
                  <Text style={twStyle("text-sm text-gray-700")}>{item.label}</Text>
                </View>
                <Switch
                  value={value}
                  onValueChange={() => toggleChannel(item.key, channel)}
                  trackColor={{ false: "#e5e7eb", true: "#818cf8" }}
                  thumbColor={value ? "#6366f1" : "#f4f4f5"}
                  style={{
                    transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }],
                  }}
                />
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader
        title="Notification Settings"
        showBack
        subtitle={`${enabledCount} active channels`}
      />

      {/* Test notification */}
      <TouchableOpacity
        style={twStyle("mb-4 flex-row items-center rounded-xl border border-indigo-100 bg-indigo-50 p-3")}
        onPress={handleTest}
        disabled={testing}
      >
        <View style={twStyle("h-8 w-8 items-center justify-center rounded-lg bg-indigo-100")}>
          <Ionicons name="paper-plane-outline" size={16} color="#6366f1" />
        </View>
        <View style={twStyle("ml-3 flex-1")}>
          <Text style={twStyle("text-sm font-medium text-indigo-700")}>
            Send Test Notification
          </Text>
          <Text style={twStyle("text-[10px] text-indigo-500")}>
            Verify your channels are working
          </Text>
        </View>
        {testing ? (
          <Text style={twStyle("text-xs text-indigo-400")}>Sending...</Text>
        ) : (
          <Ionicons name="chevron-forward" size={16} color="#6366f1" />
        )}
      </TouchableOpacity>

      {renderSection(
        "Push Notifications",
        "phone-portrait-outline",
        PUSH_SECTIONS,
        "push"
      )}
      {renderSection(
        "Email Notifications",
        "mail-outline",
        EMAIL_SECTIONS,
        "email"
      )}
      {renderSection(
        "SMS Notifications",
        "chatbox-outline",
        SMS_SECTIONS,
        "sms"
      )}

      {/* Marketing unsubscribe */}
      <View style={twStyle("mb-4 rounded-2xl border border-gray-100 bg-white p-4")}>
        <View style={twStyle("flex-row items-center justify-between")}>
          <View style={twStyle("flex-row flex-1 items-center")}>
            <Ionicons name="megaphone-outline" size={18} color="#ef4444" />
            <View style={twStyle("ml-3 flex-1")}>
              <Text style={twStyle("text-sm font-medium text-gray-900")}>
                Unsubscribe Marketing
              </Text>
              <Text style={twStyle("text-xs text-gray-500")}>
                Stop all marketing communications
              </Text>
            </View>
          </View>
          <Switch
            value={form.unsubscribe_marketing}
            onValueChange={(v) => {
              setForm((p) => ({ ...p, unsubscribe_marketing: v }));
              setDirty(true);
            }}
            trackColor={{ false: "#d1d5db", true: "#fca5a5" }}
            thumbColor={form.unsubscribe_marketing ? "#ef4444" : "#f4f4f5"}
          />
        </View>
      </View>

      <ActionButton
        label="Save Preferences"
        onPress={handleSave}
        loading={saving}
        disabled={!dirty}
        fullWidth
      />
      <View style={twStyle("h-8")} />
    </ScreenContainer>
  );
}
