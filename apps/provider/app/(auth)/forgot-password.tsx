/**
 * Forgot password – Supabase `resetPasswordForEmail` sends one email with a code and a link.
 *
 * Code: entered here together with the new password → `verifyOtp({ type: "recovery" })` then
 * `updateUser({ password })`. Needs `{{ .Token }}` in the Supabase "Reset password" template.
 * Link: opens the web app (`EXPO_PUBLIC_APP_URL/auth/callback`), which lands on its reset-password page.
 * Also opened from Settings while signed in (`(auth)/_layout` allows this screen); the email is then locked.
 */
import { useState, useCallback, useRef } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Platform, ScrollView, Alert } from "react-native";
import { AppKeyboardAvoidingView as KeyboardAvoidingView } from "@/components/AppKeyboardAvoidingView";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "@beautonomi/i18n";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase/client";
import { api } from "@/lib/api-client";
import { APP_URL } from "@/config/public-env";
import { useResponsive } from "@/hooks/useResponsive";
import { Colors } from "@/constants/colors";
import { DirectionalIcon } from "@/components/ui/DirectionalIcon";
import { OtpDigitRow } from "@/components/OtpDigitRow";
import { NewPasswordFields } from "@/components/auth/NewPasswordFields";
import { isCompleteOtpForLength, normalizeSupabaseSmsOtpToken } from "@/lib/supabase-sms-otp";
import { DEFAULT_AUTH } from "@/lib/config-bundle";
import { getNewPasswordIssue, type NewPasswordIssue } from "@/lib/auth/password-recovery";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { useAuth } from "@/providers/AuthProvider";

const RESET_NS = "provider.mobile.screens.resetPassword";

function getRedirectUrl(): string {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return `${window.location.origin}/auth/callback`;
  }
  const base = APP_URL?.replace(/\/$/, "") || "";
  return base ? `${base}/auth/callback` : "";
}

export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const fp = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.forgotPassword.${key}`, opts) as string,
    [t],
  );
  const rp = useCallback(
    (key: string, opts?: Record<string, unknown>) => t(`${RESET_NS}.${key}`, opts) as string,
    [t],
  );
  const router = useRouter();
  const { screenPadding } = useResponsive();
  const { bundle: configBundle } = useConfigBundle();
  const policy = configBundle?.auth ?? DEFAULT_AUTH;
  const codeLength = policy.email_otp_length;
  const { session } = useAuth();
  // Captured once: a signed-out reset creates a session mid-flow and must not flip this screen to "settings" mode.
  const [accountEmail] = useState(() => session?.user?.email?.trim() || null);
  const fromSettings = accountEmail !== null;
  const [email, setEmail] = useState(accountEmail ?? "");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [resending, setResending] = useState(false);
  const [code, setCode] = useState("");
  const [codeVerified, setCodeVerified] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  const sendResetEmail = useCallback(async (trimmed: string): Promise<boolean> => {
    const redirectTo = getRedirectUrl();
    if (!redirectTo) {
      Alert.alert(fp("notAvailableTitle"), fp("notAvailableBody"));
      return false;
    }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo,
      });
      if (error) {
        Alert.alert(fp("errorTitle"), error.message);
        return false;
      }
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : fp("genericError");
      Alert.alert(fp("errorTitle"), msg);
      return false;
    }
  }, [fp]);

  const handleSendEmail = useCallback(async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      Alert.alert(fp("requiredTitle"), fp("enterEmail"));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      Alert.alert(fp("invalidTitle"), fp("invalidBody"));
      return;
    }
    setLoading(true);
    try {
      if (await sendResetEmail(trimmed)) {
        setCode("");
        setSent(true);
      }
    } finally {
      setLoading(false);
    }
  }, [email, fp, sendResetEmail]);

  const handleResend = useCallback(async () => {
    if (resending || submitting) return;
    setResending(true);
    try {
      if (await sendResetEmail(email.trim())) setCode("");
    } finally {
      setResending(false);
    }
  }, [email, resending, submitting, sendResetEmail]);

  const issueMessage = useCallback((issue: NewPasswordIssue): string => {
    if (issue === "minLength") return rp("minLength", { count: policy.minimum_password_length });
    if (issue === "policy") return rp("policyMix");
    return rp("mismatch");
  }, [rp, policy.minimum_password_length]);

  const handleSubmit = useCallback(async () => {
    if (submitting) return;
    if (!codeVerified && !isCompleteOtpForLength(code, codeLength)) {
      Alert.alert(fp("invalidCodeTitle"), fp("invalidCodeBody", { digits: codeLength }));
      return;
    }
    const issue = getNewPasswordIssue(newPassword, confirmPassword, policy);
    if (issue) {
      Alert.alert(rp("validationTitle"), issueMessage(issue));
      return;
    }
    setSubmitting(true);
    try {
      if (!codeVerified) {
        const { error } = await supabase.auth.verifyOtp({
          email: email.trim(),
          token: normalizeSupabaseSmsOtpToken(code),
          type: "recovery",
        });
        if (error) {
          setCode("");
          Alert.alert(fp("invalidCodeTitle"), error.message);
          return;
        }
        setCodeVerified(true);
      }
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) {
        Alert.alert(rp("errorTitle"), updateError.message);
        return;
      }
      await api.post("/api/me/password/changed", {}).catch(() => {});
      Alert.alert(rp("successTitle"), rp("successBody"), [{ text: rp("ok") }]);
      if (fromSettings) {
        if (router.canGoBack()) router.back();
        else router.replace("/(app)/(tabs)/more/settings-login-and-security" as never);
      } else {
        router.replace("/");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : fp("genericError");
      Alert.alert(fp("errorTitle"), msg);
    } finally {
      setSubmitting(false);
    }
  }, [
    submitting, codeVerified, code, codeLength, newPassword, confirmPassword, policy,
    email, fp, rp, issueMessage, fromSettings, router,
  ]);

  const codeReady = codeVerified || isCompleteOtpForLength(code, codeLength);
  const canSubmit = codeReady && newPassword.length > 0 && confirmPassword.length > 0 && !submitting;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.white }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: Colors.gray[200], paddingHorizontal: 16, paddingVertical: 12 }}>
        <TouchableOpacity
          onPress={() => router.back()}
          disabled={submitting}
          style={{ marginEnd: 12, padding: 8 }}
          accessibilityLabel={fp("backA11y")}
          accessibilityRole="button"
        >
          <DirectionalIcon name="arrow-back" size={24} color={Colors.gray[900]} />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: "600", color: Colors.gray[900] }}>{fp("title")}</Text>
      </View>

      <KeyboardAvoidingView
        behavior="padding"
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === "ios" ? 56 : 0}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: screenPadding, paddingTop: 24, paddingBottom: 220 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {sent ? (
            <View>
              <View style={{ flexDirection: "row", alignItems: "flex-start", borderRadius: 12, borderWidth: 1, borderColor: "#bbf7d0", backgroundColor: "#f0fdf4", padding: 14, marginBottom: 24 }}>
                <Ionicons name="mail-open-outline" size={22} color="#15803d" style={{ marginEnd: 10, marginTop: 1 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: "600", color: "#166534" }}>{fp("checkEmail")}</Text>
                  <Text style={{ marginTop: 4, fontSize: 14, color: "#15803d", lineHeight: 20 }}>
                    {fp("sentBody", { email: email.trim() })}
                  </Text>
                </View>
              </View>

              <Text style={{ fontSize: 15, fontWeight: "700", color: Colors.gray[900], marginBottom: 10 }}>
                {fp("stepCode", { digits: codeLength })}
              </Text>
              {codeVerified ? (
                <View style={{ flexDirection: "row", alignItems: "center", borderRadius: 12, backgroundColor: "#f0fdf4", paddingHorizontal: 14, paddingVertical: 12 }}>
                  <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
                  <Text style={{ marginStart: 6, fontSize: 14, fontWeight: "600", color: "#166534" }}>{fp("codeVerified")}</Text>
                </View>
              ) : (
                <OtpDigitRow
                  length={codeLength}
                  value={code}
                  onChange={setCode}
                  onComplete={() => passwordRef.current?.focus()}
                  disabled={submitting}
                  autoFocus
                  accessibilityLabelPrefix={fp("codeA11y")}
                />
              )}
              {!codeVerified ? (
                <TouchableOpacity
                  onPress={() => void handleResend()}
                  disabled={resending || submitting}
                  style={{ alignSelf: "flex-start", marginTop: 10, paddingVertical: 4 }}
                  accessibilityLabel={fp("resendA11y")}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: resending || submitting, busy: resending }}
                >
                  {resending ? (
                    <ActivityIndicator color={Colors.primary} />
                  ) : (
                    <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.primary }}>{fp("resend")}</Text>
                  )}
                </TouchableOpacity>
              ) : null}

              <Text style={{ fontSize: 15, fontWeight: "700", color: Colors.gray[900], marginTop: 24, marginBottom: 10 }}>
                {fp("stepPassword")}
              </Text>
              <NewPasswordFields
                ref={passwordRef}
                ns={RESET_NS}
                password={newPassword}
                onPasswordChange={setNewPassword}
                confirm={confirmPassword}
                onConfirmChange={setConfirmPassword}
                policy={policy}
                disabled={submitting}
                onSubmitEditing={() => void handleSubmit()}
              />

              <TouchableOpacity
                onPress={() => void handleSubmit()}
                disabled={!canSubmit}
                style={{ marginTop: 12, borderRadius: 12, backgroundColor: Colors.primary, paddingVertical: 16, opacity: canSubmit ? 1 : 0.5 }}
                accessibilityLabel={submitting ? fp("submittingA11y") : fp("submit")}
                accessibilityRole="button"
                accessibilityState={{ disabled: !canSubmit, busy: submitting }}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ textAlign: "center", fontWeight: "700", color: Colors.white }}>{fp("submit")}</Text>
                )}
              </TouchableOpacity>

              <View style={{ flexDirection: "row", alignItems: "flex-start", marginTop: 20, borderRadius: 12, backgroundColor: Colors.gray[50], padding: 12 }}>
                <Ionicons name="link-outline" size={16} color={Colors.gray[500]} style={{ marginEnd: 8, marginTop: 1 }} />
                <Text style={{ flex: 1, fontSize: 13, color: Colors.gray[600], lineHeight: 18 }}>{fp("linkAlternative")}</Text>
              </View>

              <TouchableOpacity
                onPress={() => (fromSettings ? router.back() : router.replace("/(auth)/login" as never))}
                disabled={submitting}
                style={{ marginTop: 12, paddingVertical: 10 }}
                accessibilityLabel={fromSettings ? fp("backA11y") : fp("backToLoginA11y")}
                accessibilityRole="button"
              >
                <Text style={{ textAlign: "center", fontSize: 14, fontWeight: "500", color: Colors.gray[600] }}>
                  {fromSettings ? fp("back") : fp("backToLogin")}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={{ fontSize: 14, color: Colors.gray[600] }}>
                {fromSettings ? fp("signedInIntro") : fp("intro")}
              </Text>
              <Text style={{ marginTop: 16, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>{fp("emailLabel")}</Text>
              <TextInput
                style={{ marginTop: 4, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: fromSettings ? Colors.gray[100] : Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
                placeholder={fp("emailPlaceholder")}
                placeholderTextColor={Colors.gray[400]}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading && !fromSettings}
                accessibilityLabel={fp("emailA11y")}
              />
              <TouchableOpacity
                onPress={handleSendEmail}
                disabled={loading}
                style={{ marginTop: 24, borderRadius: 12, backgroundColor: Colors.primary, paddingVertical: 16 }}
                accessibilityLabel={loading ? fp("sendingA11y") : fp("sendA11y")}
                accessibilityRole="button"
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ textAlign: "center", fontWeight: "600", color: Colors.white }}>{fp("send")}</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => router.back()}
                style={{ marginTop: 16, paddingVertical: 8 }}
                accessibilityLabel={fromSettings ? fp("backA11y") : fp("backToLoginA11y")}
                accessibilityRole="button"
              >
                <Text style={{ textAlign: "center", fontSize: 14, fontWeight: "500", color: Colors.gray[600] }}>
                  {fromSettings ? fp("back") : fp("backToLogin")}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
