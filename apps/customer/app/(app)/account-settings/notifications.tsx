import { useEffect, useState, useCallback, useRef } from "react";
import { useTranslation } from "@beautonomi/i18n";
import { View, Text, Switch, ScrollView, RefreshControl, ActivityIndicator, Alert, Platform, Linking, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import { requestOneSignalPushPermission } from "@/lib/onesignal-client";
import * as Notifications from "expo-notifications";
import { ScreenFrame } from "@/components/ScreenFrame";
import { Colors } from "@/constants/colors";
import { STACK_CONTENT_PADDING_BOTTOM } from "@/constants/layout";
import { useResponsive } from "@/hooks/useResponsive";

interface NotificationPrefs {
  // Flat keys (synthesized by API)
  email_notifications: boolean;
  sms_notifications: boolean;
  booking_reminders: boolean;
  // Nested category keys
  inspiration_and_offers?: { email: boolean; sms: boolean; push: boolean };
  news_and_programs?: { email: boolean; sms: boolean; push: boolean };
  account_activity?: { email: boolean; sms: boolean; push: boolean };
  client_policies?: { email: boolean; sms: boolean; push: boolean };
  reminders?: { email: boolean; sms: boolean; push: boolean };
  messages?: { email: boolean; sms: boolean; push: boolean };
  unsubscribe_marketing?: boolean;
}

const DEFAULT_PREFS: NotificationPrefs = {
  email_notifications: true,
  sms_notifications: false,
  booking_reminders: true,
  inspiration_and_offers: { email: true, sms: true, push: false },
  news_and_programs: { email: true, sms: true, push: false },
  account_activity: { email: true, sms: true, push: false },
  client_policies: { email: true, sms: false, push: false },
  reminders: { email: true, sms: true, push: false },
  messages: { email: true, sms: true, push: true },
  unsubscribe_marketing: false,
};

interface ToggleRowProps {
  label: string;
  description?: string;
  value: boolean;
  disabled?: boolean;
  saving?: boolean;
  onToggle: (val: boolean) => void;
}

function ToggleRow({ label, description, value, disabled, saving, onToggle }: ToggleRowProps) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        backgroundColor: Colors.white,
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: Colors.gray[100],
        marginBottom: 12,
      }}
    >
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text style={{ fontWeight: "500", color: Colors.gray[900] }}>{label}</Text>
        {description ? (
          <Text style={{ fontSize: 13, color: Colors.gray[500], marginTop: 2 }}>{description}</Text>
        ) : null}
      </View>
      {saving ? (
        <ActivityIndicator size="small" color={Colors.primary} />
      ) : (
        <Switch
          value={value}
          onValueChange={onToggle}
          disabled={disabled}
          trackColor={{ false: Colors.gray[300], true: Colors.primary }}
          thumbColor={Colors.white}
          /**
           * §UX-audit 2026-04: without these a11y props, TalkBack/VoiceOver
           * announced a bare "switch" without naming the preference, so users
           * had to rely on the (visually adjacent) label. Bind the toggle to
           * the row label explicitly.
           */
          accessibilityRole="switch"
          accessibilityLabel={label}
          accessibilityHint={description ?? undefined}
          accessibilityState={{ checked: value, disabled: !!disabled }}
        />
      )}
    </View>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={{ marginBottom: 12, marginTop: 4 }}>
      <Text style={{ fontSize: 16, fontWeight: "700", color: Colors.gray[900] }}>{title}</Text>
      {subtitle ? (
        <Text style={{ fontSize: 13, color: Colors.gray[500], marginTop: 2 }}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

export default function NotificationsScreen() {
  const { t } = useTranslation();
  const np = useCallback((key: string) => t(`customer.mobile.screens.notificationPreferences.${key}`), [t]);
  const insets = useSafeAreaInsets();
  const { contentPadding, contentMaxWidth, isTablet } = useResponsive();
  const scrollConstraint =
    isTablet || Platform.OS === "web"
      ? { maxWidth: contentMaxWidth, alignSelf: "center" as const, width: "100%" as const }
      : {};
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [pushPermissionStatus, setPushPermissionStatus] = useState<string | null>(null);
  // Keep a ref to the latest prefs so toggle callbacks don't close over stale state
  const prefsRef = useRef(prefs);
  useEffect(() => { prefsRef.current = prefs; }, [prefs]);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await api.get<NotificationPrefs>("/api/me/notification-preferences");
      if (res.error) {
        setError(getApiErrorMessage(res.error, np("loadFailed")));
      } else {
        setPrefs({ ...DEFAULT_PREFS, ...(res.data ?? {}) });
      }
    } catch (e) {
      setError(getApiErrorMessage(e, np("loadFailed")));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [np]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    void Notifications.getPermissionsAsync().then(({ status }) => setPushPermissionStatus(status));
  }, []);

  const handleEnablePushNotifications = useCallback(async () => {
    if (Platform.OS === "web") return;
    const current = await Notifications.getPermissionsAsync();
    setPushPermissionStatus(current.status);
    if (current.status === "granted") {
      Alert.alert("Push enabled", "Notifications are already allowed for this device.");
      return;
    }
    if (current.status === "undetermined" || current.canAskAgain) {
      const accepted = await requestOneSignalPushPermission(true);
      const next = await Notifications.getPermissionsAsync();
      setPushPermissionStatus(next.status);
      if (!accepted && next.status !== "granted") {
        Alert.alert(
          "Enable notifications",
          "Allow notifications in system settings to receive push alerts.",
          [
            { text: "Not now", style: "cancel" },
            { text: "Open Settings", onPress: () => void Linking.openSettings() },
          ],
        );
      }
      return;
    }
    Alert.alert(
      "Enable notifications",
      "Push was blocked for Beautonomi. Open system settings to turn notifications on.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Open Settings", onPress: () => void Linking.openSettings() },
      ],
    );
  }, []);

  const toggle = useCallback(async (key: string, value: boolean) => {
    const previous = prefsRef.current;
    const next = { ...previous, [key]: value };
    setPrefs(next);
    setSavingKey(key);
    try {
      const res = await api.patch<NotificationPrefs>("/api/me/notification-preferences", { [key]: value });
      if (res.error) {
        setPrefs(previous);
        Alert.alert(t("customer.mobile.screens.authLogin.errorTitle"), res.error.message || np("updateError"));
      }
    } catch {
      setPrefs(previous);
      Alert.alert(t("customer.mobile.screens.authLogin.errorTitle"), np("updateError"));
    } finally {
      setSavingKey(null);
    }
  }, [np, t]);

  const toggleNested = useCallback(async (category: keyof NotificationPrefs, channel: "email" | "sms" | "push", value: boolean) => {
    const previous = prefsRef.current;
    const existing = (previous[category] as { email: boolean; sms: boolean; push: boolean } | undefined) ?? { email: true, sms: false, push: false };
    const updated = { ...existing, [channel]: value };
    const next = { ...previous, [category]: updated };
    setPrefs(next);
    setSavingKey(`${String(category)}.${channel}`);
    try {
      const res = await api.patch<NotificationPrefs>("/api/me/notification-preferences", { [category]: updated });
      if (res.error) {
        setPrefs(previous);
        Alert.alert(t("customer.mobile.screens.authLogin.errorTitle"), res.error.message || np("updateError"));
      }
    } catch {
      setPrefs(previous);
      Alert.alert(t("customer.mobile.screens.authLogin.errorTitle"), np("updateError"));
    } finally {
      setSavingKey(null);
    }
  }, [np, t]);

  const isSaving = (key: string) => savingKey === key;

  return (
    <ScreenFrame loading={loading} error={error} onRetry={() => load()} scrollable={false}>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.primary} colors={[Colors.primary]} />
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: contentPadding,
          paddingTop: 8,
          paddingBottom: STACK_CONTENT_PADDING_BOTTOM + Math.max(insets.bottom, 8),
          ...scrollConstraint,
        }}
      >
        {/* ── Offers & Updates ── */}
        <View style={{ marginBottom: 8 }}>
          <SectionHeader
            title="Offers and updates"
            subtitle="Promotions, tips, and news from Beautonomi."
          />
          <ToggleRow
            label="Inspiration and offers"
            description="Email and SMS deals, tips, and promotions"
            value={prefs.inspiration_and_offers?.email !== false}
            saving={isSaving("inspiration_and_offers.email")}
            onToggle={(v) => toggleNested("inspiration_and_offers", "email", v)}
          />
          <ToggleRow
            label="SMS offers"
            description="Receive promotional SMS messages"
            value={prefs.inspiration_and_offers?.sms === true}
            saving={isSaving("inspiration_and_offers.sms")}
            onToggle={(v) => toggleNested("inspiration_and_offers", "sms", v)}
          />
          <ToggleRow
            label="News and programs"
            description="Brand new programs and announcements"
            value={prefs.news_and_programs?.email !== false}
            saving={isSaving("news_and_programs.email")}
            onToggle={(v) => toggleNested("news_and_programs", "email", v)}
          />
          <ToggleRow
            label="Unsubscribe from all marketing"
            description="Stop receiving promotional messages"
            value={prefs.unsubscribe_marketing === true}
            saving={isSaving("unsubscribe_marketing")}
            onToggle={(v) => toggle("unsubscribe_marketing", v)}
          />
        </View>

        {/* ── Account & Bookings ── */}
        <View style={{ marginBottom: 8, marginTop: 12 }}>
          <SectionHeader
            title="Account"
            subtitle="Booking reminders, account activity, and policies."
          />
          <ToggleRow
            label="Booking reminders"
            description="Reminders before your upcoming appointments"
            value={prefs.booking_reminders !== false}
            saving={isSaving("booking_reminders")}
            onToggle={(v) => toggle("booking_reminders", v)}
          />
          <ToggleRow
            label="Booking confirmation emails"
            description="Email when a booking is confirmed or updated"
            value={prefs.account_activity?.email !== false}
            saving={isSaving("account_activity.email")}
            onToggle={(v) => toggleNested("account_activity", "email", v)}
          />
          <ToggleRow
            label="Booking confirmation SMS"
            description="SMS when a booking is confirmed or updated"
            value={prefs.account_activity?.sms === true}
            saving={isSaving("account_activity.sms")}
            onToggle={(v) => toggleNested("account_activity", "sms", v)}
          />
          <ToggleRow
            label="Email notifications"
            description="Receive general Beautonomi emails"
            value={prefs.email_notifications !== false}
            saving={isSaving("email_notifications")}
            onToggle={(v) => toggle("email_notifications", v)}
          />
          <ToggleRow
            label="SMS notifications"
            description="Receive general Beautonomi SMS messages"
            value={prefs.sms_notifications === true}
            saving={isSaving("sms_notifications")}
            onToggle={(v) => toggle("sms_notifications", v)}
          />
        </View>

        {/* ── Messages ── */}
        <View style={{ marginBottom: 8, marginTop: 12 }}>
          <SectionHeader
            title="Messages"
            subtitle="Stay in touch with your beauty partner."
          />
          <ToggleRow
            label="Message emails"
            description="Email when you receive a new message"
            value={prefs.messages?.email !== false}
            saving={isSaving("messages.email")}
            onToggle={(v) => toggleNested("messages", "email", v)}
          />
          <ToggleRow
            label="Message SMS"
            description="SMS when you receive a new message"
            value={prefs.messages?.sms === true}
            saving={isSaving("messages.sms")}
            onToggle={(v) => toggleNested("messages", "sms", v)}
          />
          <ToggleRow
            label="Push notifications for messages"
            description="In-app push alerts for new messages"
            value={prefs.messages?.push === true}
            saving={isSaving("messages.push")}
            onToggle={(v) => toggleNested("messages", "push", v)}
          />
        </View>

        {/* ── Push notifications matrix ── */}
        <View style={{ marginBottom: 8, marginTop: 12 }}>
          <SectionHeader
            title="Push notifications"
            subtitle="Choose which push alerts you receive on this device. Critical alerts (like payment and safety) are always delivered."
          />
          <ToggleRow
            label="Booking reminders"
            description="Push reminders before your upcoming appointments"
            value={prefs.reminders?.push === true}
            saving={isSaving("reminders.push")}
            onToggle={(v) => toggleNested("reminders", "push", v)}
          />
          <ToggleRow
            label="Account activity"
            description="Push when a booking is confirmed, updated, or cancelled"
            value={prefs.account_activity?.push === true}
            saving={isSaving("account_activity.push")}
            onToggle={(v) => toggleNested("account_activity", "push", v)}
          />
          <ToggleRow
            label="Policies and reminders"
            description="Push for policy updates and check-ins"
            value={prefs.client_policies?.push === true}
            saving={isSaving("client_policies.push")}
            onToggle={(v) => toggleNested("client_policies", "push", v)}
          />
          <ToggleRow
            label="Offers and promotions"
            description="Push for deals, tips, and promotions"
            value={prefs.inspiration_and_offers?.push === true}
            saving={isSaving("inspiration_and_offers.push")}
            onToggle={(v) => toggleNested("inspiration_and_offers", "push", v)}
          />

          {Platform.OS !== "web" && (
            <>
              <TouchableOpacity
                onPress={() => void handleEnablePushNotifications()}
                accessibilityRole="button"
                accessibilityLabel={
                  pushPermissionStatus === "granted"
                    ? "Push notifications enabled on this device"
                    : "Enable push notifications on this device"
                }
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  backgroundColor: Colors.white,
                  borderRadius: 12,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: Colors.gray[100],
                  marginBottom: 12,
                }}
              >
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={{ fontWeight: "500", color: Colors.gray[900] }}>
                    {pushPermissionStatus === "granted"
                      ? "Push notifications enabled"
                      : "Enable push notifications"}
                  </Text>
                  <Text style={{ fontSize: 13, color: Colors.gray[500], marginTop: 2 }}>
                    {pushPermissionStatus === "granted"
                      ? "This device can receive push alerts"
                      : "Request permission if you skipped push during setup"}
                  </Text>
                </View>
                <Ionicons
                  name={pushPermissionStatus === "granted" ? "notifications" : "notifications-outline"}
                  size={20}
                  color={Colors.primary}
                />
              </TouchableOpacity>
              <TouchableOpacity
              onPress={() => {
                void Linking.openSettings().catch(() => {
                  Alert.alert(
                    "Open settings",
                    "Open your device Settings to manage system notification permissions for Beautonomi.",
                  );
                });
              }}
              accessibilityRole="button"
              accessibilityLabel="Open system notification settings"
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                backgroundColor: Colors.white,
                borderRadius: 12,
                padding: 16,
                borderWidth: 1,
                borderColor: Colors.gray[100],
                marginTop: 4,
              }}
            >
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={{ fontWeight: "500", color: Colors.gray[900] }}>
                  System notification settings
                </Text>
                <Text style={{ fontSize: 13, color: Colors.gray[500], marginTop: 2 }}>
                  Manage OS-level permissions if push isn’t arriving
                </Text>
              </View>
              <Ionicons name="open-outline" size={20} color={Colors.primary} />
            </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    </ScreenFrame>
  );
}
