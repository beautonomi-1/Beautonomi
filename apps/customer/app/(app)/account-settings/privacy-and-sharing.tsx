import { useEffect, useState, useCallback } from "react";
import { View, Text, Switch, ActivityIndicator, TouchableOpacity, Linking } from "react-native";
import { router } from "expo-router";
import { api } from "@/lib/api-client";
import { ScreenFrame } from "@/components/ScreenFrame";
import { Colors } from "@/constants/colors";
import { APP_URL } from "@/config/public-env";

interface PrivacySettings {
  show_profile_publicly: boolean;
  allow_providers_see_reviews: boolean;
  share_booking_data: boolean;
  receive_marketing: boolean;
}

const PRIVACY_TOGGLES: {
  key: keyof PrivacySettings;
  label: string;
  description: string;
}[] = [
  {
    key: "show_profile_publicly",
    label: "Show my profile publicly",
    description: "Allow other users to view your profile and basic information",
  },
  {
    key: "allow_providers_see_reviews",
    label: "Allow providers to see my reviews",
    description: "Let service providers view reviews you've written",
  },
  {
    key: "share_booking_data",
    label: "Share booking data for recommendations",
    description: "Help us personalise your experience with smarter recommendations",
  },
  {
    key: "receive_marketing",
    label: "Receive marketing communications",
    description: "Get emails and notifications about promotions and new features",
  },
];

const DEFAULT_SETTINGS: PrivacySettings = {
  show_profile_publicly: true,
  allow_providers_see_reviews: true,
  share_booking_data: true,
  receive_marketing: false,
};

export default function PrivacyAndSharingScreen() {
  const [settings, setSettings] = useState<PrivacySettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<keyof PrivacySettings | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<PrivacySettings>("/api/me/privacy-settings");
      if (res.error) {
        setError(res.error.message || "Failed to load privacy settings");
      } else if (res.data) {
        setSettings({ ...DEFAULT_SETTINGS, ...res.data });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load privacy settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = useCallback(
    async (key: keyof PrivacySettings, value: boolean) => {
      const previous = { ...settings };
      const next: PrivacySettings = { ...settings, [key]: value };
      setSettings(next);
      setSavingKey(key);
      try {
        const res = await api.patch<PrivacySettings>("/api/me/privacy-settings", {
          [key]: value,
        });
        if (res.error) {
          setSettings(previous);
        }
      } catch {
        setSettings(previous);
      } finally {
        setSavingKey(null);
      }
    },
    [settings],
  );

  return (
    <ScreenFrame loading={loading} error={error} onRetry={load}>
      <View>
        <View>
          <Text style={{ fontSize: 18, fontWeight: "700", color: Colors.gray[900] }}>Privacy Controls</Text>
          <Text style={{ fontSize: 14, color: Colors.gray[500], marginTop: 4 }}>
            Manage how your information is used and shared
          </Text>
        </View>

        <View style={{ marginTop: 24 }}>
          {PRIVACY_TOGGLES.map((item, index) => (
            <View key={item.key} style={{ backgroundColor: Colors.white, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: Colors.gray[100], marginTop: index === 0 ? 0 : 12 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={{ fontWeight: "500", color: Colors.gray[900] }}>{item.label}</Text>
                  <Text style={{ fontSize: 14, color: Colors.gray[500], marginTop: 4 }}>{item.description}</Text>
                </View>
                <View style={{ alignItems: "center" }}>
                  {savingKey === item.key ? (
                    <ActivityIndicator size="small" color={Colors.primary} />
                  ) : (
                    <Switch
                      value={settings[item.key]}
                      onValueChange={(v) => toggle(item.key, v)}
                      trackColor={{ false: Colors.gray[300], true: Colors.primary }}
                      thumbColor={Colors.white}
                      disabled={savingKey != null}
                    />
                  )}
                </View>
              </View>
            </View>
          ))}
        </View>

        <View style={{ backgroundColor: Colors.primaryLight, borderRadius: 12, padding: 16, marginTop: 8 }}>
          <Text style={{ fontSize: 14, color: Colors.gray[700], lineHeight: 20 }}>
            Your data is protected in accordance with the Protection of Personal Information
            Act (POPIA) and our Privacy Policy. You can change these settings at any time.
            Disabling data sharing may limit personalised recommendations.
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 12 }}>
            <Text
              style={{ fontSize: 14, fontWeight: "600", color: Colors.primary, textDecorationLine: "underline", marginRight: 16 }}
              onPress={() => Linking.openURL(`${APP_URL.replace(/\/$/, "")}/privacy-policy`).catch(() => {})}
            >
              Full Privacy Policy
            </Text>
            <Text
              style={{ fontSize: 14, fontWeight: "600", color: Colors.primary, textDecorationLine: "underline" }}
              onPress={() => Linking.openURL(`${APP_URL.replace(/\/$/, "")}/cookie-policy`).catch(() => {})}
            >
              Cookie Policy
            </Text>
          </View>
        </View>

        <View style={{ marginTop: 28 }}>
          <Text style={{ fontSize: 16, fontWeight: "600", color: Colors.gray[900], marginBottom: 8 }}>
            Delete account
          </Text>
          <Text style={{ fontSize: 14, color: Colors.gray[600], marginBottom: 12, lineHeight: 20 }}>
            Permanently delete your account and personal data. You will confirm with your password and by typing
            DELETE.
          </Text>
          <TouchableOpacity
            onPress={() => router.push("/(app)/account-settings/delete-account")}
            style={{
              borderWidth: 1,
              borderColor: "#fecaca",
              backgroundColor: "#FEF2F2",
              paddingVertical: 14,
              paddingHorizontal: 16,
              borderRadius: 12,
              alignItems: "center",
            }}
            accessibilityRole="button"
            accessibilityLabel="Delete account permanently"
          >
            <Text style={{ color: "#b91c1c", fontWeight: "700", fontSize: 16 }}>Delete account</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScreenFrame>
  );
}
