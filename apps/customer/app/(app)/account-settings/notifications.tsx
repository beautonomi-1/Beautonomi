import { useEffect, useState, useCallback, useRef } from "react";
import { View, Text, Switch, ScrollView, RefreshControl, ActivityIndicator, Alert } from "react-native";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import { ScreenFrame } from "@/components/ScreenFrame";
import { Colors } from "@/constants/colors";

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
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
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
        setError(getApiErrorMessage(res.error, "Failed to load"));
      } else {
        setPrefs({ ...DEFAULT_PREFS, ...(res.data ?? {}) });
      }
    } catch (e) {
      setError(getApiErrorMessage(e, "Failed to load"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = useCallback(async (key: string, value: boolean) => {
    const previous = prefsRef.current;
    const next = { ...previous, [key]: value };
    setPrefs(next);
    setSavingKey(key);
    try {
      const res = await api.patch<NotificationPrefs>("/api/me/notification-preferences", { [key]: value });
      if (res.error) {
        setPrefs(previous);
        Alert.alert("Error", res.error.message || "Could not update preference. Please try again.");
      }
    } catch {
      setPrefs(previous);
      Alert.alert("Error", "Could not update preference. Please try again.");
    } finally {
      setSavingKey(null);
    }
  }, []);

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
        Alert.alert("Error", res.error.message || "Could not update preference. Please try again.");
      }
    } catch {
      setPrefs(previous);
      Alert.alert("Error", "Could not update preference. Please try again.");
    } finally {
      setSavingKey(null);
    }
  }, []);

  const isSaving = (key: string) => savingKey === key;

  return (
    <ScreenFrame loading={loading} error={error} onRetry={() => load()}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.primary} />}
        showsVerticalScrollIndicator={false}
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
      </ScrollView>
    </ScreenFrame>
  );
}
