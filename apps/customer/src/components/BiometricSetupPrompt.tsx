import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import { useTranslation } from "@beautonomi/i18n";
import { useAuth } from "@/providers/AuthProvider";
import { useBiometricAuth } from "@/hooks/useBiometricAuth";
import { useNativePermissionsOnboardingGate } from "@/providers/NativePermissionsOnboardingProvider";
import { isScreenshotMode } from "@/config/public-env";
import { Colors } from "@/constants/colors";
import {
  canShowBiometricSetupPrompt,
  clearBiometricPromptPending,
  isBiometricPromptPending,
  isBiometricSetupPromptDismissed,
  markBiometricSetupPromptDismissed,
  subscribeBiometricPromptPending,
} from "@/lib/biometric-setup-prompt";

export function BiometricSetupPrompt() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const biometric = useBiometricAuth();
  const { gate } = useNativePermissionsOnboardingGate();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingRevision, setPendingRevision] = useState(0);

  const bp = useCallback(
    (key: string, options?: Record<string, string | number>) => {
      const fullKey = `customer.mobile.screens.loginSecurity.biometricSetupPrompt.${key}`;
      return (options != null ? t(fullKey as never, options as never) : t(fullKey as never)) as string;
    },
    [t],
  );

  useEffect(() => subscribeBiometricPromptPending(() => setPendingRevision((n) => n + 1)), []);

  const biometricLabel =
    biometric.biometricType === "face"
      ? "Face ID"
      : biometric.biometricType === "fingerprint"
        ? "Fingerprint"
        : "Biometrics";

  const closePrompt = useCallback(async () => {
    setVisible(false);
    clearBiometricPromptPending();
    if (userId) await markBiometricSetupPromptDismissed(userId);
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setVisible(false);
      return;
    }

    let cancelled = false;

    const evaluate = async () => {
      const permissionsPhase =
        gate.phase === "loading"
          ? "loading"
          : gate.phase === "needs_onboarding"
            ? "needs_onboarding"
            : "complete";

      const dismissed = await isBiometricSetupPromptDismissed(userId);
      if (cancelled) return;

      const eligible = canShowBiometricSetupPrompt({
        platform: Platform.OS,
        isScreenshotMode: isScreenshotMode(),
        isAvailable: biometric.isAvailable,
        isEnabled: biometric.isEnabled,
        dismissed,
        pending: isBiometricPromptPending(userId),
        pathname: pathname ?? "",
        permissionsPhase,
      });

      setVisible(eligible);
    };

    void evaluate();
    return () => {
      cancelled = true;
    };
  }, [
    userId,
    pathname,
    gate.phase,
    biometric.isAvailable,
    biometric.isEnabled,
    pendingRevision,
  ]);

  const onEnable = useCallback(async () => {
    setBusy(true);
    try {
      const ok = await biometric.enable();
      if (ok) await closePrompt();
    } finally {
      setBusy(false);
    }
  }, [biometric, closePrompt]);

  const onNotNow = useCallback(async () => {
    await closePrompt();
  }, [closePrompt]);

  const onOpenSettings = useCallback(async () => {
    await closePrompt();
    router.push("/(app)/account-settings/login-and-security" as never);
  }, [closePrompt, router]);

  if (!visible) return null;

  return (
    <Modal
      visible
      animationType="fade"
      transparent
      onRequestClose={() => void onNotNow()}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.45)",
          justifyContent: "center",
          paddingHorizontal: 24,
        }}
      >
        <View
          style={{
            backgroundColor: Colors.white,
            borderRadius: 16,
            padding: 24,
          }}
        >
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              backgroundColor: Colors.primaryLight,
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 16,
            }}
          >
            <Ionicons
              name={biometric.biometricType === "face" ? "scan-outline" : "finger-print-outline"}
              size={28}
              color={Colors.primary}
            />
          </View>
          <Text style={{ fontSize: 22, fontWeight: "700", color: Colors.gray[900], marginBottom: 8 }}>
            {bp("title")}
          </Text>
          <Text style={{ fontSize: 15, lineHeight: 22, color: Colors.gray[600], marginBottom: 20 }}>
            {bp("body", { label: biometricLabel })}
          </Text>
          <TouchableOpacity
            onPress={() => void onEnable()}
            disabled={busy}
            style={{
              backgroundColor: Colors.primary,
              paddingVertical: 14,
              borderRadius: 12,
              alignItems: "center",
              marginBottom: 10,
            }}
            accessibilityRole="button"
            accessibilityLabel={bp("enableCta", { label: biometricLabel })}
          >
            {busy ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={{ color: Colors.white, fontWeight: "600", fontSize: 16 }}>
                {bp("enableCta", { label: biometricLabel })}
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => void onNotNow()}
            disabled={busy}
            style={{
              paddingVertical: 12,
              borderRadius: 12,
              alignItems: "center",
              borderWidth: 1,
              borderColor: Colors.gray[300],
            }}
            accessibilityRole="button"
            accessibilityLabel={bp("notNowCta")}
          >
            <Text style={{ color: Colors.gray[700], fontWeight: "600", fontSize: 16 }}>
              {bp("notNowCta")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => void onOpenSettings()}
            disabled={busy}
            style={{ marginTop: 12, paddingVertical: 8, alignItems: "center" }}
            accessibilityRole="link"
            accessibilityLabel={bp("settingsLink")}
          >
            <Text style={{ color: Colors.primary, fontWeight: "600", fontSize: 14 }}>
              {bp("settingsLink")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
