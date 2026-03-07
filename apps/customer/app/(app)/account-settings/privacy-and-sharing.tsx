import { useEffect, useState, useCallback } from "react";
import { View, Text, Switch, ActivityIndicator } from "react-native";
import { api } from "@/lib/api-client";
import { ScreenFrame } from "@/components/ScreenFrame";
import { Colors } from "@/constants/colors";

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
    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get<PrivacySettings>("/api/me/privacy-settings");
        if (cancelled) return;
        if (res.error) {
          setError(res.error.message || "Failed to load privacy settings");
        } else if (res.data) {
          setSettings({ ...DEFAULT_SETTINGS, ...res.data });
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load privacy settings");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();
    return () => {
      cancelled = true;
    };
  }, []);

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
        </View>
      </View>
    </ScreenFrame>
  );
}
