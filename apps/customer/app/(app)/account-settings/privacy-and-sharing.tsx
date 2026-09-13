import { useEffect, useState, useCallback } from "react";
import { View, Text, Switch, ActivityIndicator, TouchableOpacity, Alert } from "react-native";
import { useRouter } from "expo-router";
import { api } from "@/lib/api-client";
import { ScreenFrame } from "@/components/ScreenFrame";
import { Colors } from "@/constants/colors";
import { pushWebCookiePolicy, pushWebPrivacyPolicy, pushWebTermsOfService, pushWebAgeSuitability } from "@/lib/legal-web";
import { useTranslation } from "@beautonomi/i18n";

interface PrivacySettings {
  show_profile_publicly: boolean;
  allow_providers_see_reviews: boolean;
  share_booking_data: boolean;
  receive_marketing: boolean;
  analytics_consent: boolean;
}

function buildPrivacyToggles(t: (key: string) => string): {
  key: keyof PrivacySettings;
  label: string;
  description: string;
}[] {
  return [
    {
      key: "show_profile_publicly",
      label: t("customer.mobile.screens.privacySharing.toggleShowProfilePubliclyLabel"),
      description: t("customer.mobile.screens.privacySharing.toggleShowProfilePubliclyDesc"),
    },
    {
      key: "allow_providers_see_reviews",
      label: t("customer.mobile.screens.privacySharing.toggleAllowProvidersSeeReviewsLabel"),
      description: t("customer.mobile.screens.privacySharing.toggleAllowProvidersSeeReviewsDesc"),
    },
    {
      key: "share_booking_data",
      label: t("customer.mobile.screens.privacySharing.toggleShareBookingDataLabel"),
      description: t("customer.mobile.screens.privacySharing.toggleShareBookingDataDesc"),
    },
    {
      key: "receive_marketing",
      label: t("customer.mobile.screens.privacySharing.toggleReceiveMarketingLabel"),
      description: t("customer.mobile.screens.privacySharing.toggleReceiveMarketingDesc"),
    },
    {
      key: "analytics_consent",
      label: t("customer.mobile.screens.privacySharing.toggleAnalyticsConsentLabel"),
      description: t("customer.mobile.screens.privacySharing.toggleAnalyticsConsentDesc"),
    },
  ];
}

const DEFAULT_SETTINGS: PrivacySettings = {
  show_profile_publicly: true,
  allow_providers_see_reviews: true,
  share_booking_data: true,
  receive_marketing: false,
  analytics_consent: true,
};

function mergeServerPrivacyPayload(raw: unknown): Partial<PrivacySettings> {
  if (!raw || typeof raw !== "object") return {};
  const d = raw as Record<string, unknown>;
  const out: Partial<PrivacySettings> = {};
  (Object.keys(DEFAULT_SETTINGS) as (keyof PrivacySettings)[]).forEach((k) => {
    if (typeof d[k] === "boolean") out[k] = d[k];
  });
  return out;
}

export default function PrivacyAndSharingScreen() {
  const { t } = useTranslation();
  const PRIVACY_TOGGLES = buildPrivacyToggles(t);
  const errTitle = t("customer.mobile.screens.authLogin.errorTitle");
  const ps = useCallback(
    (key: "updateErrorBody" | "loadFailed") => t(`customer.mobile.screens.privacySharing.${key}`) as string,
    [t],
  );
  const router = useRouter();
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
        setError(res.error.message || ps("loadFailed"));
      } else if (res.data) {
        setSettings({ ...DEFAULT_SETTINGS, ...mergeServerPrivacyPayload(res.data) });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : ps("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [ps]);

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
        const res = await api.patch<Record<string, unknown>>("/api/me/privacy-settings", {
          [key]: value,
        });
        if (res.error) {
          setSettings(previous);
          Alert.alert(errTitle, res.error.message || ps("updateErrorBody"));
        } else if (res.data) {
          const merged = mergeServerPrivacyPayload(res.data);
          if (Object.keys(merged).length) {
            setSettings((s) => ({ ...s, ...merged }));
          }
        }
      } catch {
        setSettings(previous);
        Alert.alert(errTitle, ps("updateErrorBody"));
      } finally {
        setSavingKey(null);
      }
    },
    [settings, errTitle, ps],
  );

  return (
    <ScreenFrame loading={loading} error={error} onRetry={load}>
      <View>
        <View>
          <Text style={{ fontSize: 18, fontWeight: "700", color: Colors.gray[900] }}>{t("customer.mobile.screens.privacySharing.title")}</Text>
          <Text style={{ fontSize: 14, color: Colors.gray[500], marginTop: 4 }}>
            {t("customer.mobile.screens.privacySharing.subtitle")}
          </Text>
        </View>

        <View style={{ marginTop: 24 }}>
          {PRIVACY_TOGGLES.map((item, index) => (
            <View key={item.key} style={{ backgroundColor: Colors.white, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: Colors.gray[100], marginTop: index === 0 ? 0 : 12 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View style={{ flex: 1, marginEnd: 12 }}>
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
            {t("customer.mobile.screens.privacySharing.popiaNote")}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 12, alignItems: "center" }}>
            <Text
              style={{ fontSize: 14, fontWeight: "600", color: Colors.primary, textDecorationLine: "underline", marginEnd: 8 }}
              onPress={() => pushWebPrivacyPolicy(router)}
            >
              {t("customer.mobile.screens.privacySharing.privacyPolicyLink")}
            </Text>
            <Text
              style={{ fontSize: 14, fontWeight: "600", color: Colors.primary, textDecorationLine: "underline", marginEnd: 8 }}
              onPress={() => pushWebTermsOfService(router)}
            >
              {t("customer.mobile.screens.privacySharing.termsLink")}
            </Text>
            <Text
              style={{ fontSize: 14, fontWeight: "600", color: Colors.primary, textDecorationLine: "underline", marginEnd: 8 }}
              onPress={() => pushWebCookiePolicy(router)}
            >
              {t("customer.mobile.screens.privacySharing.cookiePolicyLink")}
            </Text>
            <Text
              style={{ fontSize: 14, fontWeight: "600", color: Colors.primary, textDecorationLine: "underline" }}
              onPress={() => pushWebAgeSuitability(router)}
            >
              {t("customer.mobile.screens.privacySharing.ageSuitabilityLink")}
            </Text>
          </View>
        </View>

        <View style={{ marginTop: 28 }}>
          <Text style={{ fontSize: 16, fontWeight: "600", color: Colors.gray[900], marginBottom: 8 }}>
            {t("customer.mobile.screens.privacySharing.deleteAccountSectionTitle")}
          </Text>
          <Text style={{ fontSize: 14, color: Colors.gray[600], marginBottom: 12, lineHeight: 20 }}>
            {t("customer.mobile.screens.privacySharing.deleteAccountSectionBody")}
          </Text>
          <TouchableOpacity
            onPress={() => router.push("/(app)/account-settings/delete-account" as never)}
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
            accessibilityLabel={t("customer.mobile.screens.privacySharing.deleteAccountA11y")}
          >
            <Text style={{ color: "#b91c1c", fontWeight: "700", fontSize: 16 }}>{t("customer.mobile.screens.privacySharing.deleteAccountCta")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScreenFrame>
  );
}
