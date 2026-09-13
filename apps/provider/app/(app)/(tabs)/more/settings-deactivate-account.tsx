/**
 * Deactivate account screen – required for App Store / Play Store compliance.
 * Calls POST /api/me/deactivate with password (and optional reason), then signs out.
 */
import { useEffect, useState, useCallback, useMemo } from "react";
import { View, Text, TextInput, ScrollView, Alert, Platform, TouchableOpacity, ActivityIndicator } from "react-native";
import { useTranslation } from "@beautonomi/i18n";
import { AppKeyboardAvoidingView as KeyboardAvoidingView } from "@/components/AppKeyboardAvoidingView";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/providers/AuthProvider";
import { api } from "@/lib/api-client";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { Colors } from "@/constants/colors";
import { getApiErrorMessage } from "@/lib/api-error";
import { supabase } from "@/lib/supabase/client";
import {
  canVerifySensitiveActionWithCode,
  describeReauthOtpDestination,
  isAuthSecurityLoaded,
  sensitiveActionSubmitReady,
  userHasPassword,
} from "@beautonomi/utils";

type AuthSecurityState = {
  has_password: boolean;
  has_mailable_email: boolean;
  has_phone: boolean;
};

export default function SettingsDeactivateAccountScreen() {
  const { t } = useTranslation();
  const da = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.settingsDeactivateAccount.${key}`, opts) as string,
    [t],
  );
  const router = useRouter();
  const { signOut } = useAuth();
  const [password, setPassword] = useState("");
  const [verificationNonce, setVerificationNonce] = useState("");
  const [authSecurity, setAuthSecurity] = useState<AuthSecurityState | null>(null);
  const [profileEmail, setProfileEmail] = useState<string | null>(null);
  const [profilePhone, setProfilePhone] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [requestingNonce, setRequestingNonce] = useState(false);
  const [profileLoadError, setProfileLoadError] = useState<string | null>(null);
  const authSecurityLoaded = isAuthSecurityLoaded(authSecurity);
  const hasPassword = userHasPassword(authSecurity);
  const canVerifyWithCode = canVerifySensitiveActionWithCode(authSecurity);
  const otpDestination = useMemo(
    () => describeReauthOtpDestination(authSecurity, { email: profileEmail, phone: profilePhone }),
    [authSecurity, profileEmail, profilePhone],
  );

  useEffect(() => {
    let alive = true;
    api.get<{ auth_security?: AuthSecurityState | null; email?: string; phone?: string }>("/api/me/profile")
      .then((res) => {
        if (!alive) return;
        if (res.error) {
          setProfileLoadError(res.error.message ?? da("loadFailed"));
          return;
        }
        setProfileLoadError(null);
        const data = res.data as { auth_security?: AuthSecurityState | null; email?: string; phone?: string } | undefined;
        setAuthSecurity(data?.auth_security ?? null);
        setProfileEmail(data?.email ?? null);
        setProfilePhone(data?.phone ?? null);
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
      Alert.alert(da("requiredTitle"), da("stillLoading"));
      return;
    }
    if (hasPassword && !pwd) {
      Alert.alert(da("requiredTitle"), da("enterPassword"));
      return;
    }
    if (!hasPassword && !nonce) {
      Alert.alert(da("requiredTitle"), da("enterCode"));
      return;
    }

    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    Alert.alert(
      da("confirmTitle"),
      da("confirmBody"),
      [
        { text: da("cancel"), style: "cancel" },
        {
          text: da("deactivate"),
          style: "destructive",
          onPress: async () => {
            setLoading(true);
            try {
              const res = await api.post<unknown>("/api/me/deactivate", {
                password: hasPassword ? pwd : undefined,
                verificationNonce: hasPassword ? undefined : nonce,
                reason: reason.trim() || null,
              }) as { data?: unknown; error?: { message?: string } };
              if (res.error) {
                Alert.alert(da("errorTitle"), res.error.message ?? da("deactivateFailed"));
                setLoading(false);
                return;
              }
              await signOut();
              router.replace("/(auth)/login?deactivated=1" as never);
            } catch (e) {
              const msg = e instanceof Error ? e.message : da("deactivateFailedRetry");
              Alert.alert(da("errorTitle"), msg);
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  }, [password, verificationNonce, hasPassword, authSecurityLoaded, reason, signOut, router, da]);

  const requestVerificationCode = useCallback(async () => {
    if (!canVerifyWithCode) {
      Alert.alert(da("addContactTitle"), otpDestination.codeSentMessage);
      return;
    }
    setRequestingNonce(true);
    try {
      const { error } = await supabase.auth.reauthenticate();
      if (error) throw error;
      Alert.alert(da("codeSentTitle"), otpDestination.codeSentMessage);
    } catch (e) {
      Alert.alert(da("errorTitle"), getApiErrorMessage(e, da("sendCodeFailed")));
    } finally {
      setRequestingNonce(false);
    }
  }, [canVerifyWithCode, otpDestination.codeSentMessage, da]);

  return (
    <ScreenContainer keyboardAvoiding={false}>
      <ScreenHeader title={da("title")} subtitle={da("subtitle")} onBack={() => router.back()} />

      <KeyboardAvoidingView
        behavior="padding"
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === "ios" ? 56 : 0}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 220 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <View style={{ paddingHorizontal: 8, paddingTop: 8 }}>
            <View style={{ marginBottom: 12, borderRadius: 12, borderWidth: 1, borderColor: "#fcd34d", backgroundColor: "rgba(254,243,199,0.8)", padding: 12 }}>
              <Text style={{ fontSize: 14, color: "#92400e" }}>
                {da("warning")}
              </Text>
            </View>
            {profileLoadError ? (
              <Text style={{ marginBottom: 12, fontSize: 14, color: "#dc2626" }}>{profileLoadError}</Text>
            ) : null}
            <View style={{ marginBottom: 12 }}>
              {!authSecurityLoaded ? (
                <View style={{ alignItems: "center", paddingVertical: 12 }}>
                  <ActivityIndicator color={Colors.gray[600]} />
                  <Text style={{ marginTop: 8, fontSize: 14, color: Colors.gray[600] }}>{da("loadingOptions")}</Text>
                </View>
              ) : hasPassword ? (
                <>
                  <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>{da("password")}</Text>
                  <TextInput
                    style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
                    placeholder={da("passwordPlaceholder")}
                    placeholderTextColor="#9ca3af"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </>
              ) : (
                <>
                  <Text style={{ marginBottom: 8, fontSize: 14, color: Colors.gray[600] }}>{otpDestination.sendButtonHint}</Text>
                  <TouchableOpacity
                    onPress={requestVerificationCode}
                    disabled={requestingNonce || !canVerifyWithCode}
                    style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, paddingVertical: 12, alignItems: "center", marginBottom: 10 }}
                  >
                    <Text style={{ color: Colors.gray[900], fontWeight: "600" }}>{requestingNonce ? da("sending") : da("sendCode")}</Text>
                  </TouchableOpacity>
                  <TextInput
                    style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
                    placeholder={da("codePlaceholder")}
                    placeholderTextColor="#9ca3af"
                    value={verificationNonce}
                    onChangeText={(value) => setVerificationNonce(value.replace(/\D/g, ""))}
                    keyboardType="number-pad"
                    autoComplete="sms-otp"
                    textContentType="oneTimeCode"
                  />
                </>
              )}
            </View>
            <View style={{ marginBottom: 12 }}>
              <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>{da("reasonLabel")}</Text>
              <TextInput
                style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
                placeholder={da("reasonPlaceholder")}
                placeholderTextColor="#9ca3af"
                value={reason}
                onChangeText={setReason}
              />
            </View>
            <View style={{ marginTop: 16 }}>
              <ActionButton
                label={loading ? da("deactivating") : da("confirmTitle")}
                onPress={handleDeactivate}
                fullWidth
                disabled={
                  loading ||
                  !sensitiveActionSubmitReady(authSecurity, {
                    password,
                    verificationNonce,
                  })
                }
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
