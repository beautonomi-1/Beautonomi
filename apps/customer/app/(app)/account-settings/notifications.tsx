import { useEffect, useState, useCallback, useRef } from "react";
import { useTranslation } from "@beautonomi/i18n";
import { View, Text, Switch, ScrollView, RefreshControl, ActivityIndicator, Alert, Platform, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import { requestOneSignalPushPermission } from "@/lib/onesignal-client";
import { openAppNotificationSettings } from "@/lib/native-permissions";
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
  inspiration_and_offers?: { email: boolean; sms: boolean; push: boolean; whatsapp?: boolean };
  news_and_programs?: { email: boolean; sms: boolean; push: boolean; whatsapp?: boolean };
  account_activity?: { email: boolean; sms: boolean; push: boolean; whatsapp?: boolean };
  client_policies?: { email: boolean; sms: boolean; push: boolean; whatsapp?: boolean };
  reminders?: { email: boolean; sms: boolean; push: boolean; whatsapp?: boolean };
  messages?: { email: boolean; sms: boolean; push: boolean; whatsapp?: boolean };
  unsubscribe_marketing?: boolean;
}

const DEFAULT_PREFS: NotificationPrefs = {
  email_notifications: true,
  sms_notifications: false,
  booking_reminders: true,
  inspiration_and_offers: { email: true, sms: true, push: false, whatsapp: false },
  news_and_programs: { email: true, sms: true, push: false, whatsapp: false },
  account_activity: { email: true, sms: true, push: false, whatsapp: false },
  client_policies: { email: true, sms: false, push: false, whatsapp: false },
  reminders: { email: true, sms: true, push: false, whatsapp: false },
  messages: { email: true, sms: true, push: true, whatsapp: false },
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
      <View style={{ flex: 1, marginEnd: 12 }}>
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
  const an = useCallback((key: string) => t(`customer.mobile.screens.accountNotifications.${key}`), [t]);
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
      Alert.alert(an("pushEnabledTitle"), an("pushEnabledBody"));
      return;
    }
    if (current.status === "undetermined" || current.canAskAgain) {
      const accepted = await requestOneSignalPushPermission(true);
      const next = await Notifications.getPermissionsAsync();
      setPushPermissionStatus(next.status);
      if (!accepted && next.status !== "granted") {
        Alert.alert(
          an("enableNotificationsTitle"),
          an("enableNotificationsBody"),
          [
            { text: an("notNow"), style: "cancel" },
            { text: an("openSettings"), onPress: () => void openAppNotificationSettings() },
          ],
        );
      }
      return;
    }
    Alert.alert(
      an("pushBlockedTitle"),
      an("pushBlockedBody"),
      [
        { text: t("common.cancel"), style: "cancel" },
        { text: an("openSettings"), onPress: () => void openAppNotificationSettings() },
      ],
    );
  }, [an, t]);

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

  const toggleNested = useCallback(async (category: keyof NotificationPrefs, channel: "email" | "sms" | "push" | "whatsapp", value: boolean) => {
    const previous = prefsRef.current;
    const existing = (previous[category] as { email: boolean; sms: boolean; push: boolean; whatsapp?: boolean } | undefined) ?? { email: true, sms: false, push: false, whatsapp: false };
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
        {/* ── System permission status ── */}
        {Platform.OS !== "web" && pushPermissionStatus && pushPermissionStatus !== "granted" ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: "#FEF3F2",
              borderColor: "#FECDCA",
              borderWidth: 1,
              borderRadius: 12,
              padding: 14,
              marginBottom: 16,
            }}
          >
            <Ionicons name="notifications-off-outline" size={22} color="#B42318" style={{ marginEnd: 12 }} />
            <View style={{ flex: 1, marginEnd: 12 }}>
              <Text style={{ fontWeight: "700", color: "#7A271A" }}>
                {t("common.pushPermission.systemOffTitle")}
              </Text>
              <Text style={{ fontSize: 13, color: "#912018", marginTop: 2 }}>
                {t("common.pushPermission.systemOffBody")}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => void handleEnablePushNotifications()}
              accessibilityRole="button"
              accessibilityLabel={t("common.pushPermission.turnOn")}
              style={{ backgroundColor: "#B42318", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9 }}
            >
              <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>
                {t("common.pushPermission.turnOn")}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ── Offers & Updates ── */}
        <View style={{ marginBottom: 8 }}>
          <SectionHeader
            title={np("offersTitle")}
            subtitle={np("offersSubtitle")}
          />
          <ToggleRow
            label={np("inspirationLabel")}
            description={np("inspirationDesc")}
            value={prefs.inspiration_and_offers?.email !== false}
            saving={isSaving("inspiration_and_offers.email")}
            onToggle={(v) => toggleNested("inspiration_and_offers", "email", v)}
          />
          <ToggleRow
            label={np("smsOffersLabel")}
            description={np("smsOffersDesc")}
            value={prefs.inspiration_and_offers?.sms === true}
            saving={isSaving("inspiration_and_offers.sms")}
            onToggle={(v) => toggleNested("inspiration_and_offers", "sms", v)}
          />
          <ToggleRow
            label={np("whatsappOffersLabel")}
            description={np("whatsappOffersDesc")}
            value={prefs.inspiration_and_offers?.whatsapp === true}
            saving={isSaving("inspiration_and_offers.whatsapp")}
            onToggle={(v) => toggleNested("inspiration_and_offers", "whatsapp", v)}
          />
          <ToggleRow
            label={np("newsLabel")}
            description={np("newsDesc")}
            value={prefs.news_and_programs?.email !== false}
            saving={isSaving("news_and_programs.email")}
            onToggle={(v) => toggleNested("news_and_programs", "email", v)}
          />
          <ToggleRow
            label={np("unsubscribeLabel")}
            description={np("unsubscribeDesc")}
            value={prefs.unsubscribe_marketing === true}
            saving={isSaving("unsubscribe_marketing")}
            onToggle={(v) => toggle("unsubscribe_marketing", v)}
          />
        </View>

        {/* ── Account & Bookings ── */}
        <View style={{ marginBottom: 8, marginTop: 12 }}>
          <SectionHeader
            title={np("accountTitle")}
            subtitle={np("accountSubtitle")}
          />
          <ToggleRow
            label={np("bookingRemindersLabel")}
            description={np("bookingRemindersDesc")}
            value={prefs.booking_reminders !== false}
            saving={isSaving("booking_reminders")}
            onToggle={(v) => toggle("booking_reminders", v)}
          />
          <ToggleRow
            label={np("bookingConfEmailLabel")}
            description={np("bookingConfEmailDesc")}
            value={prefs.account_activity?.email !== false}
            saving={isSaving("account_activity.email")}
            onToggle={(v) => toggleNested("account_activity", "email", v)}
          />
          <ToggleRow
            label={np("bookingConfSmsLabel")}
            description={np("bookingConfSmsDesc")}
            value={prefs.account_activity?.sms === true}
            saving={isSaving("account_activity.sms")}
            onToggle={(v) => toggleNested("account_activity", "sms", v)}
          />
          <ToggleRow
            label={np("bookingConfWhatsappLabel")}
            description={np("bookingConfWhatsappDesc")}
            value={prefs.account_activity?.whatsapp === true}
            saving={isSaving("account_activity.whatsapp")}
            onToggle={(v) => toggleNested("account_activity", "whatsapp", v)}
          />
          <ToggleRow
            label={np("emailNotifLabel")}
            description={np("emailNotifDesc")}
            value={prefs.email_notifications !== false}
            saving={isSaving("email_notifications")}
            onToggle={(v) => toggle("email_notifications", v)}
          />
          <ToggleRow
            label={np("smsNotifLabel")}
            description={np("smsNotifDesc")}
            value={prefs.sms_notifications === true}
            saving={isSaving("sms_notifications")}
            onToggle={(v) => toggle("sms_notifications", v)}
          />
        </View>

        {/* ── Messages ── */}
        <View style={{ marginBottom: 8, marginTop: 12 }}>
          <SectionHeader
            title={np("messagesTitle")}
            subtitle={np("messagesSubtitle")}
          />
          <ToggleRow
            label={np("messageEmailLabel")}
            description={np("messageEmailDesc")}
            value={prefs.messages?.email !== false}
            saving={isSaving("messages.email")}
            onToggle={(v) => toggleNested("messages", "email", v)}
          />
          <ToggleRow
            label={np("messageSmsLabel")}
            description={np("messageSmsDesc")}
            value={prefs.messages?.sms === true}
            saving={isSaving("messages.sms")}
            onToggle={(v) => toggleNested("messages", "sms", v)}
          />
          <ToggleRow
            label={np("messageWhatsappLabel")}
            description={np("messageWhatsappDesc")}
            value={prefs.messages?.whatsapp === true}
            saving={isSaving("messages.whatsapp")}
            onToggle={(v) => toggleNested("messages", "whatsapp", v)}
          />
          <ToggleRow
            label={np("messagePushLabel")}
            description={np("messagePushDesc")}
            value={prefs.messages?.push === true}
            saving={isSaving("messages.push")}
            onToggle={(v) => toggleNested("messages", "push", v)}
          />
        </View>

        {/* ── Push notifications matrix ── */}
        <View style={{ marginBottom: 8, marginTop: 12 }}>
          <SectionHeader
            title={np("pushTitle")}
            subtitle={np("pushSubtitle")}
          />
          <ToggleRow
            label={np("pushRemindersLabel")}
            description={np("pushRemindersDesc")}
            value={prefs.reminders?.push === true}
            saving={isSaving("reminders.push")}
            onToggle={(v) => toggleNested("reminders", "push", v)}
          />
          <ToggleRow
            label={np("whatsappRemindersLabel")}
            description={np("whatsappRemindersDesc")}
            value={prefs.reminders?.whatsapp === true}
            saving={isSaving("reminders.whatsapp")}
            onToggle={(v) => toggleNested("reminders", "whatsapp", v)}
          />
          <ToggleRow
            label={np("pushAccountActivityLabel")}
            description={np("pushAccountActivityDesc")}
            value={prefs.account_activity?.push === true}
            saving={isSaving("account_activity.push")}
            onToggle={(v) => toggleNested("account_activity", "push", v)}
          />
          <ToggleRow
            label={np("pushPoliciesLabel")}
            description={np("pushPoliciesDesc")}
            value={prefs.client_policies?.push === true}
            saving={isSaving("client_policies.push")}
            onToggle={(v) => toggleNested("client_policies", "push", v)}
          />
          <ToggleRow
            label={np("pushOffersLabel")}
            description={np("pushOffersDesc")}
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
                    ? np("pushEnabledA11y")
                    : np("enablePushA11y")
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
                <View style={{ flex: 1, marginEnd: 12 }}>
                  <Text style={{ fontWeight: "500", color: Colors.gray[900] }}>
                    {pushPermissionStatus === "granted"
                      ? np("pushEnabledLabel")
                      : np("enablePushLabel")}
                  </Text>
                  <Text style={{ fontSize: 13, color: Colors.gray[500], marginTop: 2 }}>
                    {pushPermissionStatus === "granted"
                      ? np("pushEnabledDesc")
                      : np("enablePushDesc")}
                  </Text>
                </View>
                <Ionicons
                  name={pushPermissionStatus === "granted" ? "notifications" : "notifications-outline"}
                  size={20}
                  color={Colors.primary}
                />
              </TouchableOpacity>
              <TouchableOpacity
              onPress={() => void openAppNotificationSettings()}
              accessibilityRole="button"
              accessibilityLabel={np("systemSettingsA11y")}
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
              <View style={{ flex: 1, marginEnd: 12 }}>
                <Text style={{ fontWeight: "500", color: Colors.gray[900] }}>
                  {np("systemSettingsLabel")}
                </Text>
                <Text style={{ fontSize: 13, color: Colors.gray[500], marginTop: 2 }}>
                  {np("systemSettingsDesc")}
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
