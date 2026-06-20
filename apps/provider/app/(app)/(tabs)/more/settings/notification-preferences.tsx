import { useState, useEffect, useCallback } from "react";
import { View, Text, Switch, Alert, TouchableOpacity, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect } from "expo-router";
import * as Notifications from "expo-notifications";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { requestOneSignalPushPermission } from "@/lib/onesignal-client";
import { openAppNotificationSettings } from "@/lib/native-permissions";
import { emitAlertPrefsChanged } from "@/lib/notification-badge-events";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
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
  review_responses: ChannelPrefs;
  client_messages: ChannelPrefs;
  payment_received: ChannelPrefs;
  payout_updates: ChannelPrefs;
  waitlist_notifications: ChannelPrefs;
  system_updates: ChannelPrefs;
  marketing: ChannelPrefs;
  booking_alert_sound?: boolean;
  order_alert_sound?: boolean;
  message_alert_sound?: boolean;
  unsubscribe_marketing?: boolean;
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
  review_responses: { label: "Review Responses", icon: "chatbubbles-outline" },
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
    keys: ["client_messages", "new_reviews", "review_responses", "waitlist_notifications"],
  },
  { title: "Payments", keys: ["payment_received", "payout_updates"] },
  { title: "Other", keys: ["system_updates", "marketing"] },
];

const DEFAULT_PREFS: NotifPreferences = {
  booking_updates: { email: true, sms: true, push: true },
  booking_cancellations: { email: true, sms: true, push: true },
  booking_reminders: { email: true, sms: true, push: true },
  new_reviews: { email: true, sms: false, push: true },
  review_responses: { email: true, sms: false, push: true },
  client_messages: { email: true, sms: true, push: true },
  payment_received: { email: true, sms: false, push: true },
  payout_updates: { email: true, sms: true, push: true },
  waitlist_notifications: { email: true, sms: false, push: true },
  system_updates: { email: true, sms: false, push: false },
  marketing: { email: true, sms: false, push: false },
  booking_alert_sound: true,
  order_alert_sound: true,
  message_alert_sound: true,
  unsubscribe_marketing: false,
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
  const { data: prefs, loading, error: loadError, refresh } =
    useApi<NotifPreferences>("/api/provider/notification-preferences");
  const { execute: savePrefs, loading: saving } = useApiMutation("patch");
  const { execute: testNotif, loading: testing } = useApiMutation("post");
  const [local, setLocal] = useState<NotifPreferences>(DEFAULT_PREFS);
  const [dirty, setDirty] = useState(false);
  const [pushPermissionStatus, setPushPermissionStatus] = useState<string | null>(null);

  const refreshPushPermission = useCallback(async () => {
    if (Platform.OS === "web") return;
    // Read the OS source of truth (expo-notifications) — same as the customer
    // settings screen and the permission nudge — instead of OneSignal's
    // init-dependent getPermissionAsync(), which could disagree on cold start.
    // "undetermined" maps to null (neutral) so we never flash an alarming red
    // banner before the user has been asked.
    const { status } = await Notifications.getPermissionsAsync();
    setPushPermissionStatus(
      status === "granted" ? "granted" : status === "denied" ? "denied" : null,
    );
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshPushPermission();
    }, [refreshPushPermission]),
  );

  async function handleEnablePushNotifications() {
    if (Platform.OS === "web") return;
    const { status } = await Notifications.getPermissionsAsync();
    if (status === "granted") {
      setPushPermissionStatus("granted");
      Alert.alert("Push enabled", "Notifications are already allowed for this device.");
      return;
    }
    const accepted = await requestOneSignalPushPermission(true);
    await refreshPushPermission();
    if (accepted) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Push enabled", "You will receive push alerts on this device.");
    } else {
      Alert.alert(
        "Enable notifications",
        "Allow notifications in system settings to receive push alerts.",
        [
          { text: "Not now", style: "cancel" },
          { text: "Open Settings", onPress: () => void openAppNotificationSettings() },
        ],
      );
    }
  }

  useEffect(() => {
    if (!prefs) return;
    const merged: NotifPreferences = { ...DEFAULT_PREFS };
    (Object.keys(DEFAULT_PREFS) as (keyof typeof DEFAULT_PREFS)[]).forEach((key) => {
      const incoming = prefs[key];
      if (incoming === undefined) return;
      const base = DEFAULT_PREFS[key];
      if (
        incoming &&
        typeof incoming === "object" &&
        !Array.isArray(incoming) &&
        base &&
        typeof base === "object" &&
        "email" in base &&
        "email" in (incoming as object)
      ) {
        merged[key] = { ...(base as ChannelPrefs), ...(incoming as ChannelPrefs) };
      } else {
        (merged as Record<string, unknown>)[key as string] = incoming;
      }
    });
    setLocal(merged);
    setDirty(false);
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
        const key = k as keyof NotifPreferences;
        const base = DEFAULT_PREFS[key];
        if (base && typeof base === "object" && "email" in base) {
          next[key] = { email: true, sms: true, push: true };
        }
      });
      return next;
    });
    setDirty(true);
  }

  function disableAllInSection(keys: string[]) {
    setLocal((prev) => {
      const next = { ...prev };
      keys.forEach((k) => {
        const key = k as keyof NotifPreferences;
        const base = DEFAULT_PREFS[key];
        if (base && typeof base === "object" && "email" in base) {
          next[key] = { email: false, sms: false, push: false };
        }
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
    emitAlertPrefsChanged();
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

  if (loadError && !prefs) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Notification Preferences" showBack subtitle="Control how you receive alerts" />
        <ErrorState message={typeof loadError === "string" ? loadError : "Failed to load preferences"} onRetry={refresh} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader
        title="Notification Preferences"
        showBack
        subtitle="Control how you receive alerts"
      />

      {Platform.OS !== "web" && (
        <TouchableOpacity
          style={twStyle(
            pushPermissionStatus === "denied"
              ? "mb-4 flex-row items-center rounded-xl border border-red-200 bg-red-50 p-3"
              : "mb-4 flex-row items-center rounded-xl border border-gray-200 bg-white p-3",
          )}
          onPress={() => void handleEnablePushNotifications()}
          accessibilityRole="button"
          accessibilityLabel={
            pushPermissionStatus === "granted"
              ? "Push notifications enabled on this device"
              : "Turn on push notifications"
          }
        >
          <Ionicons
            name={pushPermissionStatus === "granted" ? "notifications" : "notifications-off-outline"}
            size={18}
            color={
              pushPermissionStatus === "granted"
                ? "#10b981"
                : pushPermissionStatus === "denied"
                  ? "#b42318"
                  : "#6366f1"
            }
          />
          <View style={twStyle("ml-2 flex-1")}>
            <Text
              style={twStyle(
                pushPermissionStatus === "denied"
                  ? "text-sm font-semibold text-red-900"
                  : "text-sm font-medium text-gray-900",
              )}
            >
              {pushPermissionStatus === "granted"
                ? "Push notifications enabled"
                : pushPermissionStatus === "denied"
                  ? "System notifications are off"
                  : "Enable push notifications"}
            </Text>
            <Text
              style={twStyle(
                pushPermissionStatus === "denied" ? "text-xs text-red-700" : "text-xs text-gray-500",
              )}
            >
              {pushPermissionStatus === "granted"
                ? "This device can receive push alerts"
                : pushPermissionStatus === "denied"
                  ? "Beautonomi can’t send push alerts until you allow notifications in your phone’s settings"
                  : "Turn on system permission if you skipped push during setup"}
            </Text>
          </View>
          {pushPermissionStatus === "denied" ? (
            <View style={twStyle("rounded-lg bg-red-600 px-3 py-2")}>
              <Text style={twStyle("text-xs font-semibold text-white")}>Turn on</Text>
            </View>
          ) : (
            <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
          )}
        </TouchableOpacity>
      )}

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

      {/* Booking alert sound */}
      <View style={twStyle("mb-4 rounded-2xl border border-gray-100 bg-white p-4")}>
        <View style={twStyle("flex-row items-center justify-between")}>
          <View style={twStyle("flex-row flex-1 items-center")}>
            <View style={twStyle("h-9 w-9 items-center justify-center rounded-lg bg-emerald-50")}>
              <Ionicons name="volume-high-outline" size={18} color="#10b981" />
            </View>
            <View style={twStyle("ml-3 flex-1")}>
              <Text style={twStyle("text-sm font-medium text-gray-900")}>
                Booking Alert Sound
              </Text>
              <Text style={twStyle("text-xs text-gray-500")}>
                When on, new booking alerts play audio if your market sets a normal-booking ringtone in Control Plane;
                otherwise vibration (mobile).
              </Text>
            </View>
          </View>
          <Switch
            value={local.booking_alert_sound !== false}
            onValueChange={(v) => {
              setLocal((p) => ({ ...p, booking_alert_sound: v }));
              setDirty(true);
            }}
            trackColor={{ false: "#d1d5db", true: "#6ee7b7" }}
            thumbColor={local.booking_alert_sound !== false ? "#10b981" : "#f4f4f5"}
          />
        </View>
      </View>

      {/* Order alert sound */}
      <View style={twStyle("mb-4 rounded-2xl border border-gray-100 bg-white p-4")}>
        <View style={twStyle("flex-row items-center justify-between")}>
          <View style={twStyle("flex-row flex-1 items-center")}>
            <View style={twStyle("h-9 w-9 items-center justify-center rounded-lg bg-blue-50")}>
              <Ionicons name="bag-handle-outline" size={18} color="#2563eb" />
            </View>
            <View style={twStyle("ml-3 flex-1")}>
              <Text style={twStyle("text-sm font-medium text-gray-900")}>Order Alert Sound</Text>
              <Text style={twStyle("text-xs text-gray-500")}>
                Play a sound when a new product order arrives while the app is open.
              </Text>
            </View>
          </View>
          <Switch
            value={local.order_alert_sound !== false}
            onValueChange={(v) => {
              setLocal((p) => ({ ...p, order_alert_sound: v }));
              setDirty(true);
            }}
            trackColor={{ false: "#d1d5db", true: "#93c5fd" }}
            thumbColor={local.order_alert_sound !== false ? "#2563eb" : "#f4f4f5"}
          />
        </View>
      </View>

      {/* Message alert sound */}
      <View style={twStyle("mb-4 rounded-2xl border border-gray-100 bg-white p-4")}>
        <View style={twStyle("flex-row items-center justify-between")}>
          <View style={twStyle("flex-row flex-1 items-center")}>
            <View style={twStyle("h-9 w-9 items-center justify-center rounded-lg bg-indigo-50")}>
              <Ionicons name="chatbubble-ellipses-outline" size={18} color="#4f46e5" />
            </View>
            <View style={twStyle("ml-3 flex-1")}>
              <Text style={twStyle("text-sm font-medium text-gray-900")}>Message Alert Sound</Text>
              <Text style={twStyle("text-xs text-gray-500")}>
                Play a sound when a client sends a message while you are on another screen.
              </Text>
            </View>
          </View>
          <Switch
            value={local.message_alert_sound !== false}
            onValueChange={(v) => {
              setLocal((p) => ({ ...p, message_alert_sound: v }));
              setDirty(true);
            }}
            trackColor={{ false: "#d1d5db", true: "#a5b4fc" }}
            thumbColor={local.message_alert_sound !== false ? "#4f46e5" : "#f4f4f5"}
          />
        </View>
      </View>

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
                digest_mode: opt.value as NotifPreferences["digest_mode"],
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

      {/* Unsubscribe from marketing */}
      <View style={twStyle("mb-4 rounded-2xl border border-gray-100 bg-white p-4")}>
        <View style={twStyle("flex-row items-center justify-between")}>
          <View style={twStyle("flex-row flex-1 items-center")}>
            <View style={twStyle("h-9 w-9 items-center justify-center rounded-lg bg-red-50")}>
              <Ionicons name="mail-unread-outline" size={18} color="#ef4444" />
            </View>
            <View style={twStyle("ml-3 flex-1")}>
              <Text style={twStyle("text-sm font-medium text-gray-900")}>
                Unsubscribe from Marketing
              </Text>
              <Text style={twStyle("text-xs text-gray-500")}>
                Stop all promotional emails and messages
              </Text>
            </View>
          </View>
          <Switch
            value={local.unsubscribe_marketing ?? false}
            onValueChange={(v) => {
              setLocal((p) => ({ ...p, unsubscribe_marketing: v }));
              setDirty(true);
            }}
            trackColor={{ false: "#d1d5db", true: "#fca5a5" }}
            thumbColor={local.unsubscribe_marketing ? "#ef4444" : "#f4f4f5"}
          />
        </View>
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
                      (PREF_LABELS[key]?.icon as keyof typeof Ionicons.glyphMap) ?? "notifications-outline"
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
