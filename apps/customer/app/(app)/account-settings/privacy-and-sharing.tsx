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
      <View className="gap-6">
        {/* Section header */}
        <View>
          <Text className="text-lg font-bold text-gray-900">Privacy Controls</Text>
          <Text className="text-sm text-gray-500 mt-1">
            Manage how your information is used and shared
          </Text>
        </View>

        {/* Toggles */}
        <View className="gap-3">
          {PRIVACY_TOGGLES.map((item) => (
            <View
              key={item.key}
              className="bg-white rounded-xl p-4 border border-gray-100"
            >
              <View className="flex-row justify-between items-center">
                <View className="flex-1 mr-3">
                  <Text className="font-medium text-gray-900">{item.label}</Text>
                  <Text className="text-sm text-gray-500 mt-1">{item.description}</Text>
                </View>
                <View className="items-center">
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

        {/* Info text */}
        <View className="bg-primary-light rounded-xl p-4 mt-2">
          <Text className="text-sm text-gray-700 leading-5">
            Your data is protected in accordance with the Protection of Personal Information
            Act (POPIA) and our Privacy Policy. You can change these settings at any time.
            Disabling data sharing may limit personalised recommendations.
          </Text>
        </View>
      </View>
    </ScreenFrame>
  );
}
