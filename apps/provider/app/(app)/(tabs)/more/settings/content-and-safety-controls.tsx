import { useCallback, useState } from "react";
import { View, Text, Switch, ActivityIndicator, TouchableOpacity, Platform } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import * as LocalAuthentication from "expo-local-authentication";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "@beautonomi/i18n";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { TrustScreenShell } from "@/components/safety/TrustScreenShell";
import { Colors } from "@/constants/colors";
import { trackContentSafetyToggle } from "@/lib/analytics";
import { useBiometricAuth } from "@/hooks/useBiometricAuth";
import {
  useSafetySettings,
  type SafetySettingKey,
} from "@/hooks/useSafetySettings";
import { pushWebAgeSuitability } from "@/lib/legal-web";

interface ToggleRowProps {
  label: string;
  description?: string;
  value: boolean;
  disabled?: boolean;
  locked?: boolean;
  lockedNote?: string;
  saving?: boolean;
  onToggle: (val: boolean) => void;
}

function ToggleRow({ label, description, value, disabled, locked, lockedNote, saving, onToggle }: ToggleRowProps) {
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
        opacity: locked ? 0.72 : 1,
      }}
    >
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text style={{ fontWeight: "500", color: Colors.gray[900] }}>{label}</Text>
        {description ? (
          <Text style={{ fontSize: 13, color: Colors.gray[500], marginTop: 2 }}>{description}</Text>
        ) : null}
        {locked && lockedNote ? (
          <Text style={{ fontSize: 12, color: Colors.gray[400], marginTop: 4, fontStyle: "italic" }}>
            {lockedNote}
          </Text>
        ) : null}
      </View>
      {saving ? (
        <ActivityIndicator size="small" color={Colors.primary} />
      ) : (
        <Switch
          value={value}
          onValueChange={onToggle}
          disabled={disabled || locked}
          trackColor={{ false: Colors.gray[300], true: Colors.primary }}
          thumbColor={Colors.white}
          accessibilityRole="switch"
          accessibilityLabel={label}
          accessibilityHint={description ?? undefined}
          accessibilityState={{ checked: value, disabled: !!(disabled || locked) }}
        />
      )}
    </View>
  );
}

const TOGGLE_KEYS: SafetySettingKey[] = [
  "restricted_mode",
  "hide_social_feed",
  "disable_comments_likes",
  "disable_direct_messaging",
  "sensitive_content_filter",
  "require_device_auth",
];

export default function ContentAndSafetyControlsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const biometric = useBiometricAuth();
  const { settings, locked, age_band, loading, error, refresh, toggle, savingKey } = useSafetySettings();
  const [authUnlocked, setAuthUnlocked] = useState(Platform.OS === "web");
  const [authPending, setAuthPending] = useState(false);

  const cs = useCallback(
    (key: string) =>
      t(`provider.mobile.screens.contentSafety.${key}`, {
        defaultValue: t(`customer.mobile.screens.contentSafety.${key}`),
      }) as string,
    [t],
  );

  const screenTitle = t("customer.accountSettings.contentSafetyTitle");
  const screenDesc = t("customer.accountSettings.contentSafetyDesc");
  const breadcrumbSegment = t("provider.mobile.screens.contentSafety.breadcrumb", {
    defaultValue: "Content controls",
  });

  const promptDeviceAuth = useCallback(async () => {
    if (Platform.OS === "web") {
      setAuthUnlocked(true);
      return;
    }

    setAuthPending(true);
    try {
      if (biometric.isEnabled) {
        const ok = await biometric.authenticate(cs("authPrompt"));
        setAuthUnlocked(ok);
        return;
      }

      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!compatible || !enrolled) {
        setAuthUnlocked(true);
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: cs("authPrompt"),
        cancelLabel: t("common.cancel"),
        disableDeviceFallback: false,
      });
      setAuthUnlocked(result.success);
    } catch {
      setAuthUnlocked(false);
    } finally {
      setAuthPending(false);
    }
  }, [biometric, cs, t]);

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS === "web") {
        setAuthUnlocked(true);
        return;
      }
      if (loading) return;
      if (!settings.require_device_auth) {
        setAuthUnlocked(true);
        return;
      }
      setAuthUnlocked(false);
      void promptDeviceAuth();
    }, [loading, settings.require_device_auth, promptDeviceAuth]),
  );

  const toggleLabel = (key: SafetySettingKey) => cs(`toggle_${key}_label`);
  const toggleDesc = (key: SafetySettingKey) => cs(`toggle_${key}_desc`);

  const showAgeBandNote = age_band === "13_17";

  if (loading) {
    return (
      <ScreenContainer scrollable={false}>
        <TrustScreenShell title={screenTitle} breadcrumbSegment={breadcrumbSegment} />
        <LoadingState />
      </ScreenContainer>
    );
  }

  if (!authUnlocked && settings.require_device_auth) {
    return (
      <ScreenContainer scrollable={false}>
        <TrustScreenShell title={screenTitle} breadcrumbSegment={breadcrumbSegment} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, minHeight: 320 }}>
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              backgroundColor: Colors.gray[100],
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 16,
            }}
          >
            <Ionicons name="lock-closed-outline" size={32} color={Colors.gray[600]} />
          </View>
          <Text style={{ fontSize: 18, fontWeight: "600", color: Colors.gray[900], marginBottom: 8, textAlign: "center" }}>
            {cs("authRequired")}
          </Text>
          <Text style={{ fontSize: 14, color: Colors.gray[500], textAlign: "center", lineHeight: 20, marginBottom: 24 }}>
            {cs("authPrompt")}
          </Text>
          <TouchableOpacity
            onPress={() => void promptDeviceAuth()}
            disabled={authPending}
            style={{
              backgroundColor: Colors.primary,
              paddingHorizontal: 24,
              paddingVertical: 12,
              borderRadius: 12,
              minWidth: 160,
              alignItems: "center",
            }}
            accessibilityRole="button"
            accessibilityLabel={cs("authRequired")}
          >
            {authPending ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={{ color: Colors.white, fontWeight: "600" }}>{cs("authRequired")}</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  if (error) {
    return (
      <ScreenContainer scrollable={false}>
        <TrustScreenShell title={screenTitle} breadcrumbSegment={breadcrumbSegment} />
        <ErrorState message={error} onRetry={refresh} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <TrustScreenShell title={screenTitle} subtitle={screenDesc} breadcrumbSegment={breadcrumbSegment} />
      <View>

        {showAgeBandNote ? (
          <View
            style={{
              marginTop: 16,
              backgroundColor: Colors.primaryLight,
              borderRadius: 12,
              padding: 14,
            }}
          >
            <Text style={{ fontSize: 14, color: Colors.gray[700], lineHeight: 20 }}>{cs("ageBandNote")}</Text>
          </View>
        ) : null}

        <View style={{ marginTop: 20 }}>
          {TOGGLE_KEYS.map((key) => (
            <ToggleRow
              key={key}
              label={toggleLabel(key)}
              description={toggleDesc(key)}
              value={settings[key]}
              locked={locked[key]}
              lockedNote={cs("lockedNote")}
              disabled={savingKey != null}
              saving={savingKey === key}
              onToggle={(v) => {
                trackContentSafetyToggle(key, v);
                void toggle(key, v);
              }}
            />
          ))}
        </View>

        {Object.values(locked).some(Boolean) ? (
          <Text style={{ fontSize: 13, color: Colors.gray[500], lineHeight: 18, marginTop: 4 }}>
            {cs("lockedNote")}
          </Text>
        ) : null}

        <TouchableOpacity
          onPress={() => pushWebAgeSuitability(router)}
          style={{ marginTop: 20 }}
          accessibilityRole="link"
        >
          <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.primary, textDecorationLine: "underline" }}>
            {cs("linkAgeSuitability")}
          </Text>
        </TouchableOpacity>
      </View>
    </ScreenContainer>
  );
}
