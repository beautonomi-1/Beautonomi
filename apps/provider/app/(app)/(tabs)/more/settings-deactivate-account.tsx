/**
 * Deactivate account screen – required for App Store / Play Store compliance.
 * Calls POST /api/me/deactivate with password (and optional reason), then signs out.
 */
import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
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
          setProfileLoadError(res.error.message ?? "Could not load account settings.");
          return;
        }
        setProfileLoadError(null);
        setAuthSecurity((res.data as { auth_security?: AuthSecurityState | null } | undefined)?.auth_security ?? null);
      })
      .catch((e) => {
        if (alive) setProfileLoadError(getApiErrorMessage(e, "Could not load account settings."));
      });
    return () => {
      alive = false;
    };
  }, []);

  const handleDeactivate = useCallback(async () => {
    const pwd = password.trim();
    const nonce = verificationNonce.trim();
    if (!authSecurityLoaded) {
      Alert.alert("Required", "Still loading account security settings. Please try again.");
      return;
    }
    if (hasPassword && !pwd) {
      Alert.alert("Required", "Please enter your password to deactivate.");
      return;
    }
    if (!hasPassword && !nonce) {
      Alert.alert("Required", "Enter the verification code to deactivate.");
      return;
    }

    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    Alert.alert(
      "Deactivate account",
      "Your account will be disabled. You can reactivate anytime by logging in again or opening the reactivate page in the web app. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Deactivate",
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
                Alert.alert("Error", res.error.message ?? "Deactivation failed.");
                setLoading(false);
                return;
              }
              await signOut();
              router.replace("/(auth)/login?deactivated=1" as never);
            } catch (e) {
              const msg = e instanceof Error ? e.message : "Deactivation failed. Please try again.";
              Alert.alert("Error", msg);
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  }, [password, verificationNonce, hasPassword, authSecurityLoaded, reason, signOut, router]);

  const requestVerificationCode = useCallback(async () => {
    if (!canVerifyWithCode) {
      Alert.alert("Add contact method", "Add and verify an email or phone number before deactivating this account.");
      return;
    }
    setRequestingNonce(true);
    try {
      const { error } = await supabase.auth.reauthenticate();
      if (error) throw error;
      Alert.alert("Code sent", "A verification code has been sent to the email address on your account. Enter it below to confirm deactivation.");
    } catch (e) {
      Alert.alert("Error", getApiErrorMessage(e, "Failed to send verification code."));
    } finally {
      setRequestingNonce(false);
    }
  }, [canVerifyWithCode]);

  return (
    <ScreenContainer keyboardAvoiding={false}>
      <ScreenHeader title="Deactivate account" subtitle="Temporarily disable your account" onBack={() => router.back()} />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "padding"}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === "ios" ? 56 : 20}
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
                Deactivating disables your account. Your data is kept. You can reactivate anytime by logging in again or opening the reactivate page in the web app.
              </Text>
            </View>
            {profileLoadError ? (
              <Text style={{ marginBottom: 12, fontSize: 14, color: "#dc2626" }}>{profileLoadError}</Text>
            ) : null}
            <View style={{ marginBottom: 12 }}>
              {!authSecurityLoaded ? (
                <View style={{ alignItems: "center", paddingVertical: 12 }}>
                  <ActivityIndicator color={Colors.gray[600]} />
                  <Text style={{ marginTop: 8, fontSize: 14, color: Colors.gray[600] }}>Loading verification options…</Text>
                </View>
              ) : hasPassword ? (
                <>
                  <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Password</Text>
                  <TextInput
                    style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
                    placeholder="Enter your password"
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
                  <Text style={{ marginBottom: 8, fontSize: 14, color: Colors.gray[600] }}>We&apos;ll send a verification code to the email address on your account.</Text>
                  <TouchableOpacity
                    onPress={requestVerificationCode}
                    disabled={requestingNonce || !canVerifyWithCode}
                    style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, paddingVertical: 12, alignItems: "center", marginBottom: 10 }}
                  >
                    <Text style={{ color: Colors.gray[900], fontWeight: "600" }}>{requestingNonce ? "Sending..." : "Send verification code"}</Text>
                  </TouchableOpacity>
                  <TextInput
                    style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
                    placeholder="Enter code"
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
              <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Reason (optional)</Text>
              <TextInput
                style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
                placeholder="e.g. Taking a break"
                placeholderTextColor="#9ca3af"
                value={reason}
                onChangeText={setReason}
              />
            </View>
            <View style={{ marginTop: 16 }}>
              <ActionButton
                label={loading ? "Deactivating…" : "Deactivate account"}
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
