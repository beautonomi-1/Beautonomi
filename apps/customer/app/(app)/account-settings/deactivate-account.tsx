/**
 * Self-service account deactivation (App Store / Play parity with web).
 * POST /api/me/deactivate, then sign out → login with deactivated messaging.
 */
import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useTranslation } from "@beautonomi/i18n";
import { useAuth } from "@/providers/AuthProvider";
import { api } from "@/lib/api-client";
import { ScreenFrame } from "@/components/ScreenFrame";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { Colors } from "@/constants/colors";
import { getApiErrorMessage } from "@/lib/api-error";
import { supabase } from "@/lib/supabase/client";
import {
  canVerifySensitiveActionWithCode,
  isAuthSecurityLoaded,
  sensitiveActionSubmitReady,
  userHasPassword,
} from "@beautonomi/utils";

type AuthSecurityState = {
  has_password: boolean;
  has_mailable_email: boolean;
  has_phone: boolean;
};

export default function DeactivateAccountScreen() {
  useScreenTracking("Deactivate account");
  const { t } = useTranslation();
  const da = useCallback(
    (key: string, options?: Record<string, string | number>) => {
      const fullKey = `customer.mobile.screens.deactivateAccount.${key}`;
      return (options != null ? t(fullKey, options as never) : t(fullKey)) as string;
    },
    [t],
  );
  const errTitle = t("customer.mobile.screens.authLogin.errorTitle");
  const router = useRouter();
  const { signOut } = useAuth();
  const [password, setPassword] = useState("");
  const [verificationNonce, setVerificationNonce] = useState("");
  const [authSecurity, setAuthSecurity] = useState<AuthSecurityState | null>(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [requestingNonce, setRequestingNonce] = useState(false);
  const [profileLoadError, setProfileLoadError] = useState<string | null>(null);
  const authSecurityLoaded = isAuthSecurityLoaded(authSecurity);
  const hasPassword = userHasPassword(authSecurity);
  const canVerifyWithCode = canVerifySensitiveActionWithCode(authSecurity);

  useEffect(() => {
    let alive = true;
    api.get<{ auth_security?: AuthSecurityState | null }>("/api/me/profile")
      .then((res) => {
        if (!alive) return;
        if (res.error) {
          setProfileLoadError(res.error.message ?? da("loadFailed"));
          return;
        }
        setProfileLoadError(null);
        setAuthSecurity((res.data as { auth_security?: AuthSecurityState | null } | undefined)?.auth_security ?? null);
      })
      .catch((e) => {
        if (alive) setProfileLoadError(getApiErrorMessage(e, da("loadFailed")));
      });
    return () => {
      alive = false;
    };
  }, []);

  const handleDeactivate = useCallback(async () => {
    const pwd = password.trim();
    const nonce = verificationNonce.trim();
    if (!authSecurityLoaded) {
      Alert.alert(errTitle, "Still loading account security settings. Please try again.");
      return;
    }
    if (hasPassword && !pwd) {
      Alert.alert(da("requiredPasswordTitle"), da("requiredPasswordBody"));
      return;
    }
    if (!hasPassword && !nonce) {
      Alert.alert(errTitle, "Enter the verification code to deactivate your account.");
      return;
    }

    if (Platform.OS !== "web") {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }

    Alert.alert(
      da("confirmTitle"),
      da("confirmBody"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: da("confirmDeactivateCta"),
          style: "destructive",
          onPress: async () => {
            setLoading(true);
            try {
              const res = (await api.post<unknown>("/api/me/deactivate", {
                password: hasPassword ? pwd : undefined,
                verificationNonce: hasPassword ? undefined : nonce,
                reason: reason.trim() || null,
              })) as { error?: { message?: string } };
              if (res.error) {
                Alert.alert(errTitle, res.error.message ?? da("deactivateFailed"));
                return;
              }
              await signOut();
              router.replace("/(auth)/login?deactivated=1" as never);
            } catch (e) {
              Alert.alert(errTitle, getApiErrorMessage(e, da("deactivateRetry")));
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  }, [password, verificationNonce, hasPassword, authSecurityLoaded, reason, signOut, router, da, errTitle, t]);

  const requestVerificationCode = useCallback(async () => {
    if (!canVerifyWithCode) {
      Alert.alert(errTitle, "Add and verify an email or phone number before deactivating this account.");
      return;
    }
    setRequestingNonce(true);
    try {
      const { error } = await supabase.auth.reauthenticate();
      if (error) throw error;
      Alert.alert("Code sent", "A verification code has been sent to the email address on your account. Enter it below to confirm deactivation.");
    } catch (e) {
      Alert.alert(errTitle, getApiErrorMessage(e, "Failed to send verification code."));
    } finally {
      setRequestingNonce(false);
    }
  }, [canVerifyWithCode, errTitle]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
    >
      <ScreenFrame loading={false} error={null}>
        <View
          style={{
            marginBottom: 16,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "#fcd34d",
            backgroundColor: "rgba(254, 243, 199, 0.85)",
            padding: 14,
          }}
        >
          <Text style={{ fontSize: 14, color: "#92400e", lineHeight: 20 }}>{da("infoBanner")}</Text>
        </View>

          {profileLoadError ? (
            <Text style={{ fontSize: 14, color: Colors.error, marginBottom: 12 }}>{profileLoadError}</Text>
          ) : null}

          {!authSecurityLoaded ? (
            <View style={{ paddingVertical: 12, alignItems: "center" }}>
              <ActivityIndicator color={Colors.gray[600]} />
              <Text style={{ marginTop: 8, fontSize: 14, color: Colors.gray[600] }}>Loading verification options…</Text>
            </View>
          ) : hasPassword ? (
            <>
              <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginBottom: 6 }}>{da("passwordLabel")}</Text>
              <TextInput
                style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[300], backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
                placeholder="Enter your password"
                placeholderTextColor={Colors.gray[400]}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
            </>
          ) : (
            <View>
              <Text style={{ fontSize: 14, color: Colors.gray[600], marginBottom: 8 }}>We&apos;ll send a verification code to the email address on your account.</Text>
              <TouchableOpacity
                onPress={requestVerificationCode}
                disabled={requestingNonce || !canVerifyWithCode}
                style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[300], backgroundColor: Colors.white, paddingVertical: 12, alignItems: "center", marginBottom: 10 }}
              >
                <Text style={{ color: Colors.gray[900], fontWeight: "600" }}>{requestingNonce ? "Sending..." : "Send verification code"}</Text>
              </TouchableOpacity>
              <TextInput
                style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[300], backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
                placeholder="Enter code"
                placeholderTextColor={Colors.gray[400]}
                value={verificationNonce}
                onChangeText={(value) => setVerificationNonce(value.replace(/\D/g, ""))}
                keyboardType="number-pad"
                autoComplete="sms-otp"
                textContentType="oneTimeCode"
              />
            </View>
          )}

          <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginTop: 16, marginBottom: 6 }}>
            {da("reasonLabel")}
          </Text>
          <TextInput
            style={{
              borderRadius: 12,
              borderWidth: 1,
              borderColor: Colors.gray[300],
              backgroundColor: Colors.white,
              paddingHorizontal: 16,
              paddingVertical: 12,
              fontSize: 16,
              color: Colors.gray[900],
              minHeight: 88,
              textAlignVertical: "top",
            }}
            placeholder={da("reasonPlaceholder")}
            placeholderTextColor={Colors.gray[400]}
            value={reason}
            onChangeText={setReason}
            multiline
          />

          <Text style={{ fontSize: 13, color: Colors.gray[500], marginTop: 12, lineHeight: 18 }}>{da("footerHint")}</Text>

          <TouchableOpacity
            onPress={() => void handleDeactivate()}
            disabled={
              loading ||
              !sensitiveActionSubmitReady(authSecurity, {
                password,
                verificationNonce,
              })
            }
            style={{
              marginTop: 24,
              backgroundColor: "#dc2626",
              paddingVertical: 14,
              borderRadius: 12,
              alignItems: "center",
              opacity: loading ? 0.7 : 1,
            }}
            accessibilityRole="button"
            accessibilityLabel={da("submitA11y")}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>{da("submitLabel")}</Text>
            )}
          </TouchableOpacity>
      </ScreenFrame>
    </KeyboardAvoidingView>
  );
}
