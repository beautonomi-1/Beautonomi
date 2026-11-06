import { useState, useCallback, useRef } from "react";
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator, Platform, ScrollView } from "react-native";
import { AppKeyboardAvoidingView as KeyboardAvoidingView } from "@/components/AppKeyboardAvoidingView";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useResponsive } from "@/hooks/useResponsive";
import { supabase } from "@/lib/supabase/client";
import { api } from "@/lib/api-client";
import { APP_URL } from "@/config/public-env";
import { Colors } from "@/constants/colors";
import { useTranslation } from "@beautonomi/i18n";
import { DirectionalIcon } from "@/components/ui/DirectionalIcon";
import { OtpDigitRow } from "@/components/OtpDigitRow";
import { NewPasswordFields } from "@/components/auth/NewPasswordFields";
import { isCompleteOtpForLength, normalizeSupabaseSmsOtpToken } from "@/lib/supabase-sms-otp";
import { DEFAULT_AUTH } from "@/lib/config-bundle";
import { resolvePostLoginHref } from "@/lib/post-login-href";
import { getNewPasswordIssue, type NewPasswordIssue } from "@/lib/auth/password-recovery";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { useAuth } from "@/providers/AuthProvider";

const RESET_NS = "customer.mobile.screens.resetPassword";

/**
 * Forgot password: one email carries a code and a link. The code is entered here together with the
 * new password (verifyOtp `recovery` → updateUser). The link opens the web reset page instead.
 * Also opened from Login & security while signed in (`(auth)/_layout` allows it); the email is then locked.
 */
export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const fp = useCallback(
    (key: string, opts?: Record<string, unknown>) => t(`customer.mobile.screens.forgotPassword.${key}`, opts),
    [t],
  );
  const rp = useCallback((key: string, opts?: Record<string, unknown>) => t(`${RESET_NS}.${key}`, opts), [t]);
  const router = useRouter();
  const { contentPadding, contentMaxWidth, isTablet } = useResponsive();
  const { bundle: configBundle } = useConfigBundle();
  const policy = configBundle?.auth ?? DEFAULT_AUTH;
  const codeLength = policy.email_otp_length;
  const { session } = useAuth();
  // Captured once: a signed-out reset creates a session mid-flow and must not flip this screen to "settings" mode.
  const [accountEmail] = useState(() => session?.user?.email?.trim().toLowerCase() || null);
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
  const formNarrow = isTablet || Platform.OS === "web";
  const containerStyle = formNarrow
    ? { width: "100%" as const, maxWidth: Math.min(420, contentMaxWidth), alignSelf: "center" as const }
    : { width: "100%" as const };

  const sendResetEmail = async (trimmed: string): Promise<boolean> => {
    const base = (APP_URL ?? "").replace(/\/$/, "");
    if (!base) {
      Alert.alert(fp("configErrorTitle"), fp("configErrorBody"));
      return false;
    }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: `${base}/auth/callback`,
      });
      if (error) {
        Alert.alert(t("customer.mobile.screens.authLogin.errorTitle"), error.message);
        return false;
      }
      return true;
    } catch {
      Alert.alert(t("customer.mobile.screens.authLogin.errorTitle"), fp("genericErrorBody"));
      return false;
    }
  };

  const handleReset = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      Alert.alert(fp("emailRequiredTitle"), fp("emailRequiredBody"));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      Alert.alert(fp("invalidEmailTitle"), fp("invalidEmailBody"));
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
  };

  const handleResend = async () => {
    if (resending || submitting) return;
    setResending(true);
    try {
      if (await sendResetEmail(email.trim().toLowerCase())) setCode("");
    } finally {
      setResending(false);
    }
  };

  const issueMessage = (issue: NewPasswordIssue): string => {
    if (issue === "minLength") return rp("minLength", { count: policy.minimum_password_length });
    if (issue === "policy") return rp("policyMix");
    return rp("mismatch");
  };

  const handleSubmit = async () => {
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
          email: email.trim().toLowerCase(),
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
        else router.replace("/(app)/account-settings/login-and-security" as never);
      } else {
        router.replace(resolvePostLoginHref(undefined));
      }
    } catch {
      Alert.alert(t("customer.mobile.screens.authLogin.errorTitle"), fp("genericErrorBody"));
    } finally {
      setSubmitting(false);
    }
  };

  const codeReady = codeVerified || isCompleteOtpForLength(code, codeLength);
  const canSubmit = codeReady && newPassword.length > 0 && confirmPassword.length > 0 && !submitting;

  return (
    // §UI-audit 2026-04: replaced the hardcoded `paddingTop: 60` with
    // a real top safe-area edge so the back button lives below the
    // notch on every device size.
    <SafeAreaView edges={["top", "left", "right"]} style={{ flex: 1, backgroundColor: Colors.white }}>
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.white }}
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === "ios" ? 56 : 0}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: contentPadding,
          paddingTop: 24,
          paddingBottom: 220,
          ...(formNarrow ? { alignItems: "center" as const } : {}),
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={containerStyle}>
        <TouchableOpacity
          onPress={() => router.back()}
          disabled={submitting}
          style={{ marginBottom: 24, width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.gray[100], alignItems: "center", justifyContent: "center" }}
          accessibilityRole="button"
          accessibilityLabel={fp("goBackA11y")}
        >
          <DirectionalIcon name="arrow-back" size={20} color={Colors.gray[900]} />
        </TouchableOpacity>

        {sent ? (
          <View>
            <View style={{ flexDirection: "row", alignItems: "flex-start", borderRadius: 14, borderWidth: 1, borderColor: "#BBF7D0", backgroundColor: "#F0FDF4", padding: 14, marginBottom: 24 }}>
              <Ionicons name="mail-open-outline" size={24} color="#059669" style={{ marginEnd: 10, marginTop: 1 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: "700", color: "#065F46" }}>{fp("checkEmailTitle")}</Text>
                <Text style={{ marginTop: 2, fontSize: 14, color: "#047857", lineHeight: 20 }}>
                  {fp("sentLead")} <Text style={{ fontWeight: "700" }}>{email.trim().toLowerCase()}</Text>
                </Text>
              </View>
            </View>

            <Text style={{ fontSize: 15, fontWeight: "700", color: Colors.gray[900], marginBottom: 10 }}>
              {fp("stepCode", { digits: codeLength })}
            </Text>
            {codeVerified ? (
              <View style={{ flexDirection: "row", alignItems: "center", borderRadius: 12, backgroundColor: "#F0FDF4", paddingHorizontal: 14, paddingVertical: 12 }}>
                <Ionicons name="checkmark-circle" size={18} color="#16A34A" />
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
                accessibilityRole="button"
                accessibilityLabel={fp("resendA11y")}
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
              style={{ marginTop: 12, borderRadius: 12, paddingVertical: 15, backgroundColor: Colors.primary, opacity: canSubmit ? 1 : 0.5 }}
              onPress={() => void handleSubmit()}
              disabled={!canSubmit}
              accessibilityRole="button"
              accessibilityLabel={submitting ? fp("submittingA11y") : fp("submit")}
              accessibilityState={{ disabled: !canSubmit, busy: submitting }}
            >
              {submitting ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={{ textAlign: "center", fontSize: 16, fontWeight: "700", color: Colors.white }}>{fp("submit")}</Text>
              )}
            </TouchableOpacity>

            <View style={{ flexDirection: "row", alignItems: "flex-start", marginTop: 20, borderRadius: 12, backgroundColor: Colors.gray[50], padding: 12 }}>
              <Ionicons name="link-outline" size={16} color={Colors.gray[500]} style={{ marginEnd: 8, marginTop: 1 }} />
              <Text style={{ flex: 1, fontSize: 13, color: Colors.gray[600], lineHeight: 18 }}>{fp("linkAlternative")}</Text>
            </View>

            <View style={{ marginTop: 20, alignItems: "center" }}>
              {fromSettings ? (
                <TouchableOpacity onPress={() => router.back()} disabled={submitting} accessibilityRole="button" accessibilityLabel={fp("goBackA11y")}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[600] }}>{fp("back")}</Text>
                </TouchableOpacity>
              ) : codeVerified ? null : (
                <TouchableOpacity
                  onPress={() => { setSent(false); setEmail(""); setCode(""); }}
                  disabled={submitting}
                  accessibilityRole="button"
                  accessibilityLabel={fp("tryDifferentEmailA11y")}
                >
                  <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[600] }}>{fp("tryDifferentEmail")}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ) : (
          <>
            <View style={{ marginBottom: 32 }}>
              <Text style={{ fontSize: 24, fontWeight: "700", color: Colors.gray[900], marginBottom: 8 }}>{fp("resetTitle")}</Text>
              <Text style={{ fontSize: 16, color: Colors.gray[500], lineHeight: 24 }}>
                {fromSettings ? fp("signedInIntro") : fp("resetSubtitle")}
              </Text>
            </View>

            <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>{fp("emailLabel")}</Text>
            <TextInput
              style={{ marginBottom: 24, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[300], backgroundColor: fromSettings ? Colors.gray[100] : Colors.white, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
              placeholder={fp("emailPlaceholder")}
              placeholderTextColor={Colors.gray[400]}
              value={email}
              onChangeText={setEmail}
              editable={!fromSettings}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              importantForAutofill="yes"
              returnKeyType="done"
              onSubmitEditing={handleReset}
              accessibilityLabel={fp("emailInputA11y")}
            />

            <TouchableOpacity
              style={{ borderRadius: 12, paddingVertical: 14, backgroundColor: Colors.primary }}
              onPress={handleReset}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel={fp("sendResetLinkA11y")}
              accessibilityState={{ disabled: loading }}
            >
              {loading ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={{ textAlign: "center", fontSize: 16, fontWeight: "600", color: Colors.white }}>{fp("sendResetLink")}</Text>
              )}
            </TouchableOpacity>

            {!fromSettings ? (
              <View style={{ marginTop: 32 }}>
                <TouchableOpacity onPress={() => router.back()} accessibilityRole="link" accessibilityLabel={fp("backToLoginA11y")}>
                  <Text style={{ textAlign: "center", fontSize: 14, color: Colors.gray[500] }}>
                    {fp("rememberPasswordLead")}{" "}
                    <Text style={{ color: Colors.primary, fontWeight: "600" }}>{t("auth.login")}</Text>
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </>
        )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
