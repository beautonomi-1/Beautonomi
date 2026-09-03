import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Platform, ScrollView, Modal, Pressable, FlatList, InteractionManager, Linking } from "react-native";
import { AppKeyboardAvoidingView as KeyboardAvoidingView } from "@/components/AppKeyboardAvoidingView";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { Colors } from "@/constants/colors";
import { BeautonomiLogo } from "@/components/ui/BeautonomiLogo";
import { useResponsive } from "@/hooks/useResponsive";
import { useAuth, type OAuthProvider } from "@/providers/AuthProvider";
import {
  normalizeSupabaseAuthPhone,
  normalizeSupabaseSmsOtpToken,
  isCompleteOtpForLength,
  isCompleteSupabaseSmsOtp,
  SUPABASE_AUTH_OTP_LENGTH,
  SUPABASE_EMAIL_OTP_RESEND_COOLDOWN_SECONDS,
  SUPABASE_SMS_OTP_RESEND_COOLDOWN_SECONDS,
} from "@/lib/supabase-sms-otp";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { DEFAULT_AUTH } from "@/lib/config-bundle";
import {
  COUNTRY_CODES,
  stripLeadingZero,
  validateNationalPhoneDigits,
} from "@/lib/phone-country-codes";
import { getDeviceDefaultCountryDial } from "@/lib/phone";
import { OtpDigitRow } from "@/components/OtpDigitRow";
import { AppleAuthButton } from "@/components/auth/AppleAuthButton";
import { trackSignUp, trackSignUpStart } from "@/lib/analytics";
import { verticalFlatListPerf } from "@/lib/flatListPerformance";
import { supabase } from "@/lib/supabase/client";
import { logLoginSuccessBreadcrumb } from "@/lib/sentry";
import { webPartnerEulaUrl, webPrivacyPolicyUrl } from "@/lib/legal-web";
import { getSocialAuthConfig } from "@/lib/third-party-config";
import {
  applyPendingSignupPreferences,
  persistProviderSignupSource,
} from "@/features/auth/pending-signup-preferences";
import { writeSignupPhoneHandoff } from "@/lib/auth/signup-phone-handoff";
import { useTranslation } from "@beautonomi/i18n";
import { api } from "@/lib/api-client";

const PRIMARY = Colors.primary;
const PRIMARY_LIGHT = "rgba(255,0,119,0.06)";

async function goToAppRoot(
  router: { replace: (href: string) => void },
  method: string,
  redirectPath?: string,
  marketingConsent?: boolean,
) {
  await applyPendingSignupPreferences();
  try {
    await api.post("/api/auth/consent", { marketing_consent: marketingConsent === true });
  } catch {
    /* non-blocking */
  }
  await supabase.auth.getSession();
  logLoginSuccessBreadcrumb(method);
  router.replace(redirectPath ?? "/");
}

function prefillPhoneFromE164(value: string | undefined) {
  if (!value) return { cc: null as string | null, digits: "" };
  const e164 = value.trim();
  if (!e164.startsWith("+")) return { cc: null, digits: e164.replace(/\D/g, "") };
  const digits = e164.replace(/\D/g, "");
  const match = COUNTRY_CODES.find((c) => digits.startsWith(c.code.replace("+", "")));
  if (!match) return { cc: null, digits };
  return {
    cc: match.code,
    digits: digits.slice(match.code.replace("+", "").length),
  };
}

type SignupMode = "phone" | "email";

function getPasswordStrength(pw: string): { score: number; labelKey: string; color: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { score, labelKey: "auth.passwordWeak", color: "#EF4444" };
  if (score <= 2) return { score, labelKey: "auth.passwordFair", color: "#F59E0B" };
  if (score <= 3) return { score, labelKey: "auth.passwordGood", color: "#3B82F6" };
  return { score, labelKey: "auth.passwordStrong", color: "#22C55E" };
}

export default function SignupScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string; phone?: string; joinToken?: string }>();
  const postLoginPath = useMemo(() => {
    const token = typeof params.joinToken === "string" ? params.joinToken.trim() : "";
    return token ? `/join?token=${encodeURIComponent(token)}` : undefined;
  }, [params.joinToken]);
  const { contentMaxWidth, isTablet, screenPadding } = useResponsive();
  const {
    signInWithOtp,
    verifyOtp,
    signUpWithEmail,
    verifySignupEmailOtp,
    resendSignupConfirmationEmail,
    signInWithOAuth,
  } = useAuth();
  const { bundle: configBundle } = useConfigBundle();
  const auth = configBundle?.auth ?? DEFAULT_AUTH;
  const smsOtpLen = auth.sms_otp_length;
  const smsOtpExpiryMin = Math.max(1, Math.round(auth.sms_otp_expiration_seconds / 60));
  const formNarrow = isTablet || Platform.OS === "web";
  const formStyle = formNarrow ? { width: "100%" as const, maxWidth: Math.min(420, contentMaxWidth), alignSelf: "center" as const } : undefined;
  const scrollContentStyle = {
    flexGrow: 1,
    justifyContent: "center" as const,
    backgroundColor: "#ffffff",
    paddingHorizontal: screenPadding,
    paddingVertical: 48,
    ...(formNarrow ? { alignItems: "center" as const } : {}),
  };

  const initialPhone = prefillPhoneFromE164(typeof params.phone === "string" ? params.phone : undefined);

  const [mode, setMode] = useState<SignupMode>(
    typeof params.email === "string" && params.email.trim()
      ? "email"
      : auth.phone_provider_enabled
        ? "phone"
        : "email",
  );
  const [countryCode, setCountryCode] = useState(initialPhone.cc ?? getDeviceDefaultCountryDial);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [phone, setPhone] = useState(initialPhone.digits);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [pendingPhone, setPendingPhone] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState(typeof params.email === "string" ? params.email.trim() : "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const { t } = useTranslation();
  const [smsResendCooldown, setSmsResendCooldown] = useState(0);
  const [resendingSms, setResendingSms] = useState(false);
  const [socialAuth, setSocialAuth] = useState<{ google: boolean; apple: boolean }>({
    google: true,
    apple: true,
  });
  const [awaitingSignupVerification, setAwaitingSignupVerification] = useState(false);
  const [signupOtpCode, setSignupOtpCode] = useState("");
  const [verifyingSignupOtp, setVerifyingSignupOtp] = useState(false);
  const [resendingSignupOtp, setResendingSignupOtp] = useState(false);
  const [signupOtpResendCooldown, setSignupOtpResendCooldown] = useState(0);
  const [signupOtpError, setSignupOtpError] = useState<string | null>(null);

  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  useEffect(() => {
    trackSignUpStart();
  }, []);

  useEffect(() => {
    if (smsResendCooldown <= 0) return;
    const id = setInterval(() => setSmsResendCooldown((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [smsResendCooldown]);

  useEffect(() => {
    if (signupOtpResendCooldown <= 0) return;
    const id = setInterval(() => setSignupOtpResendCooldown((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [signupOtpResendCooldown]);

  useEffect(() => {
    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;
      void getSocialAuthConfig()
        .then((cfg) => {
          if (!cancelled) setSocialAuth(cfg);
        })
        .catch(() => {
          if (!cancelled) setSocialAuth({ google: true, apple: true });
        });
    });
    return () => {
      cancelled = true;
      task.cancel?.();
    };
  }, []);

  const fullPhone = `${countryCode}${stripLeadingZero(phone.replace(/\D/g, ""))}`.trim();
  const hasSocialAuth = socialAuth.google || socialAuth.apple;
  const filteredCountries = useMemo(() => {
    if (!countrySearch) return COUNTRY_CODES;
    const q = countrySearch.toLowerCase();
    return COUNTRY_CODES.filter((c) => c.label.toLowerCase().includes(q));
  }, [countrySearch]);
  const selectedCountry = COUNTRY_CODES.find((c) => c.code === countryCode);

  const goToLogin = useCallback(() => {
    const token = typeof params.joinToken === "string" ? params.joinToken.trim() : "";
    const emailPrefill = typeof params.email === "string" ? params.email.trim() : "";
    const qs = new URLSearchParams();
    if (token) qs.set("joinToken", token);
    if (emailPrefill) qs.set("email", emailPrefill);
    const href = qs.toString() ? `/(auth)/login?${qs.toString()}` : "/(auth)/login";
    router.replace(href as never);
  }, [router, params.joinToken, params.email]);

  function handlePhoneChange(text: string) {
    const digits = text.replace(/[^\d\s]/g, "");
    setPhone(digits);
    if (digits.replace(/\s/g, "").length > 0) {
      setPhoneError(validateNationalPhoneDigits(digits, countryCode));
    } else {
      setPhoneError(null);
    }
  }

  async function handleSendOtp() {
    if (!agreedToTerms) {
      setFormError("Please agree to the Terms of Service and Privacy Policy to continue.");
      return;
    }
    if (!auth.phone_provider_enabled) {
      setFormError("Phone sign-up is not enabled for this platform.");
      return;
    }
    setFormError(null);
    setFormSuccess(null);
    if (!phone.trim()) {
      setFormError("Please enter your phone number");
      return;
    }
    const err = validateNationalPhoneDigits(phone, countryCode);
    if (err) {
      setFormError(err);
      return;
    }
    const raw = fullPhone.startsWith("+") ? fullPhone : `+${fullPhone}`;
    const e164 = normalizeSupabaseAuthPhone(raw);
    setLoading(true);
    try {
      await persistProviderSignupSource();
      const { error } = await signInWithOtp(e164);
      if (error) {
        setFormError(error.message);
        return;
      }
      setPendingPhone(e164);
      setOtpSent(true);
      setSmsResendCooldown(SUPABASE_SMS_OTP_RESEND_COOLDOWN_SECONDS);
      setFormSuccess(
        `We sent a ${smsOtpLen}-digit code. Check your phone (valid about ${smsOtpExpiryMin} ${
          smsOtpExpiryMin === 1 ? "minute" : "minutes"
        }).`,
      );
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResendPhoneOtp() {
    if (smsResendCooldown > 0 || resendingSms) return;
    if (!pendingPhone) return;
    setFormError(null);
    setResendingSms(true);
    try {
      const { error } = await signInWithOtp(pendingPhone);
      if (error) {
        setFormError(error.message);
        return;
      }
      setToken("");
      setSmsResendCooldown(SUPABASE_SMS_OTP_RESEND_COOLDOWN_SECONDS);
      setFormSuccess("A new verification code has been sent.");
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Failed to resend code.");
    } finally {
      setResendingSms(false);
    }
  }

  async function handleVerifyOtp(otpOverride?: string) {
    setFormError(null);
    const otpToken = normalizeSupabaseSmsOtpToken(otpOverride ?? token);
    if (!isCompleteOtpForLength(otpToken, smsOtpLen)) {
      setFormError(`Enter the ${smsOtpLen}-digit code from your SMS`);
      return;
    }
    const phoneToVerify = pendingPhone || fullPhone;
    const raw = phoneToVerify.startsWith("+") ? phoneToVerify : `+${phoneToVerify}`;
    const e164 = normalizeSupabaseAuthPhone(raw);
    setLoading(true);
    try {
      const { error } = await verifyOtp(e164, otpToken);
      if (error) {
        setFormError(error.message);
        return;
      }
      trackSignUp("phone");
      await writeSignupPhoneHandoff(e164);
      await goToAppRoot(router, "phone_otp_signup", postLoginPath, marketingConsent);
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Verification failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleEmailSignup() {
    if (!agreedToTerms) {
      setFormError("Please agree to the Terms of Service and Privacy Policy to continue.");
      return;
    }
    setFormError(null);
    setFormSuccess(null);
    if (!fullName.trim()) {
      setFormError("Please enter your full name");
      return;
    }
    if (!email.trim()) {
      setFormError("Please enter your email");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setFormError("Please enter a valid email address");
      return;
    }
    if (!password || password.length < 8) {
      setFormError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      setFormError("Passwords don't match");
      return;
    }
    const raw = fullPhone.startsWith("+") ? fullPhone : phone.trim() ? `+${fullPhone}` : "";
    const e164 = raw ? normalizeSupabaseAuthPhone(raw) : undefined;
    setLoading(true);
    try {
      await persistProviderSignupSource();
      const result = await signUpWithEmail(email.trim(), password, {
        full_name: fullName.trim(),
        phone: e164,
      });
      if (result.error) {
        setFormError(result.error.message);
        return;
      }
      if (result.requiresConfirmation) {
        trackSignUp("email");
        setSignupOtpCode("");
        setSignupOtpError(null);
        setSignupOtpResendCooldown(SUPABASE_EMAIL_OTP_RESEND_COOLDOWN_SECONDS);
        setAwaitingSignupVerification(true);
        return;
      }
      trackSignUp("email");
      await goToAppRoot(router, "email_signup", postLoginPath, marketingConsent);
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Sign up failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifySignupOtp(codeOverride?: string) {
    const otpToken = normalizeSupabaseSmsOtpToken(codeOverride ?? signupOtpCode);
    if (!isCompleteSupabaseSmsOtp(otpToken)) return;
    setVerifyingSignupOtp(true);
    setSignupOtpError(null);
    try {
      const { error } = await verifySignupEmailOtp(email.trim(), otpToken);
      if (error) {
        setSignupOtpError(error.message);
        return;
      }
      trackSignUp("email");
      await goToAppRoot(router, "email_signup", postLoginPath, marketingConsent);
    } catch (e: unknown) {
      setSignupOtpError(e instanceof Error ? e.message : "Verification failed.");
    } finally {
      setVerifyingSignupOtp(false);
    }
  }

  async function handleResendSignupOtp() {
    if (signupOtpResendCooldown > 0 || resendingSignupOtp) return;
    setResendingSignupOtp(true);
    setSignupOtpError(null);
    try {
      await resendSignupConfirmationEmail(email.trim());
      setSignupOtpCode("");
      setSignupOtpResendCooldown(SUPABASE_EMAIL_OTP_RESEND_COOLDOWN_SECONDS);
    } catch (e: unknown) {
      setSignupOtpError(e instanceof Error ? e.message : "Failed to resend code.");
    } finally {
      setResendingSignupOtp(false);
    }
  }

  async function handleSocialOAuth(provider: OAuthProvider) {
    if (!agreedToTerms) {
      setFormError("Please agree to the Terms of Service and Privacy Policy to continue.");
      return;
    }
    setFormError(null);
    setLoading(true);
    try {
      await persistProviderSignupSource();
      const { error } = await signInWithOAuth(provider);
      if (error) {
        setFormError(
          error.message +
            (error.message.includes("not enabled")
              ? " Enable this provider in Supabase Dashboard → Authentication → Providers."
              : ""),
        );
        return;
      }
      trackSignUp(provider === "google" ? "email" : "email");
      await goToAppRoot(router, `oauth_${provider}`, postLoginPath, marketingConsent);
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "OAuth sign-up failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (awaitingSignupVerification) {
    return (
      <ScreenContainer edges={["top"]} scrollable={false} keyboardAvoiding={false} reserveTabBarSpace={false} noPadding>
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: "#ffffff" }} behavior="padding">
          <ScrollView style={{ flex: 1 }} contentContainerStyle={scrollContentStyle} keyboardShouldPersistTaps="handled">
            <View style={formStyle}>
              <TouchableOpacity onPress={goToLogin} style={{ marginBottom: 16 }} accessibilityRole="button" accessibilityLabel="Back to login">
                <Text style={{ fontSize: 14, color: PRIMARY, fontWeight: "600" }}>← Back to log in</Text>
              </TouchableOpacity>
              <View style={{ borderWidth: 1, borderColor: "#A7F3D0", backgroundColor: "#ECFDF5", borderRadius: 16, padding: 20 }}>
                <Text style={{ textAlign: "center", fontSize: 18, fontWeight: "700", color: "#111827", marginBottom: 6 }}>
                  Verify your email
                </Text>
                <Text style={{ textAlign: "center", fontSize: 13, color: "#4B5563", marginBottom: 4 }}>
                  We sent a {SUPABASE_AUTH_OTP_LENGTH}-digit verification code to:
                </Text>
                <Text style={{ textAlign: "center", fontSize: 14, fontWeight: "600", color: "#111827", marginBottom: 16 }}>
                  {email.trim()}
                </Text>
                <OtpDigitRow
                  value={signupOtpCode}
                  onChange={(v) => {
                    setSignupOtpCode(v);
                    if (signupOtpError) setSignupOtpError(null);
                  }}
                  onComplete={(code) => {
                    if (!verifyingSignupOtp && isCompleteSupabaseSmsOtp(code)) void handleVerifySignupOtp(code);
                  }}
                  disabled={verifyingSignupOtp}
                  autoFocus
                  accessibilityLabelPrefix="Signup verification code"
                />
                {signupOtpError ? (
                  <Text style={{ marginTop: 12, textAlign: "center", fontSize: 12, color: "#EF4444" }}>{signupOtpError}</Text>
                ) : null}
                <TouchableOpacity
                  onPress={() => void handleVerifySignupOtp()}
                  disabled={verifyingSignupOtp || !isCompleteSupabaseSmsOtp(signupOtpCode)}
                  style={{
                    marginTop: 16,
                    backgroundColor: PRIMARY,
                    borderRadius: 12,
                    paddingVertical: 14,
                    alignItems: "center",
                    opacity: verifyingSignupOtp || !isCompleteSupabaseSmsOtp(signupOtpCode) ? 0.6 : 1,
                  }}
                >
                  {verifyingSignupOtp ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>Verify & continue</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => void handleResendSignupOtp()}
                  disabled={resendingSignupOtp || signupOtpResendCooldown > 0}
                  style={{ marginTop: 10, paddingVertical: 12, alignItems: "center", opacity: resendingSignupOtp || signupOtpResendCooldown > 0 ? 0.6 : 1 }}
                >
                  <Text style={{ color: "#374151", fontSize: 14, fontWeight: "600" }}>
                    {resendingSignupOtp
                      ? "Resending..."
                      : signupOtpResendCooldown > 0
                        ? `Resend code in ${signupOtpResendCooldown}s`
                        : "Resend verification code"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={["top"]} scrollable={false} keyboardAvoiding={false} reserveTabBarSpace={false} noPadding>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: "#ffffff" }}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        <ScrollView style={{ flex: 1, backgroundColor: "#ffffff" }} contentContainerStyle={scrollContentStyle} keyboardShouldPersistTaps="handled">
          <View style={formStyle}>
            <View style={{ alignItems: "center", marginBottom: 8 }}>
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  backgroundColor: PRIMARY_LIGHT,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <BeautonomiLogo size={28} color={PRIMARY} />
              </View>
            </View>

            <Text style={{ textAlign: "center", fontSize: 28, fontWeight: "800", color: "#111827", marginBottom: 6, letterSpacing: -0.3 }} accessibilityRole="header">
              {t("auth.createYourAccount")}
            </Text>
            <Text style={{ textAlign: "center", fontSize: 15, color: "#6B7280", lineHeight: 22, marginBottom: 24 }}>
              Join Beautonomi for service pros — manage bookings, clients, and payments.
            </Text>

            <TouchableOpacity
              onPress={() => {
                setAgreedToTerms(!agreedToTerms);
                if (formError?.includes("agree")) setFormError(null);
              }}
              style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 16 }}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: agreedToTerms }}
            >
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  borderWidth: 2,
                  borderColor: agreedToTerms ? PRIMARY : "#9CA3AF",
                  backgroundColor: agreedToTerms ? PRIMARY : "#fff",
                  alignItems: "center",
                  justifyContent: "center",
                  marginTop: 2,
                }}
              >
                {agreedToTerms && <Ionicons name="checkmark" size={14} color="#fff" />}
              </View>
              <Text style={{ marginLeft: 10, flex: 1, fontSize: 13, color: "#6B7280", lineHeight: 20 }}>
                I agree to the{" "}
                <Text style={{ fontWeight: "600", color: "#111827", textDecorationLine: "underline" }} onPress={() => Linking.openURL(webPartnerEulaUrl()).catch(() => {})}>
                  Partner EULA
                </Text>{" "}
                and{" "}
                <Text style={{ fontWeight: "600", color: "#111827", textDecorationLine: "underline" }} onPress={() => Linking.openURL(webPrivacyPolicyUrl()).catch(() => {})}>
                  Privacy Policy
                </Text>
                .
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setMarketingConsent(!marketingConsent)}
              style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 16 }}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: marketingConsent }}
            >
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  borderWidth: 2,
                  borderColor: marketingConsent ? PRIMARY : "#9CA3AF",
                  backgroundColor: marketingConsent ? PRIMARY : "#fff",
                  alignItems: "center",
                  justifyContent: "center",
                  marginTop: 2,
                }}
              >
                {marketingConsent ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
              </View>
              <Text style={{ marginLeft: 10, flex: 1, fontSize: 13, color: "#6B7280", lineHeight: 20 }}>
                {t("auth.marketingConsent")}
              </Text>
            </TouchableOpacity>

            {formError ? (
              <View style={{ backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FECACA", borderRadius: 12, padding: 14, marginBottom: 16, flexDirection: "row", alignItems: "flex-start" }}>
                <Ionicons name="alert-circle" size={20} color="#DC2626" style={{ marginTop: 1, marginRight: 10 }} />
                <Text style={{ flex: 1, fontSize: 14, color: "#991B1B", lineHeight: 20 }}>{formError}</Text>
              </View>
            ) : null}
            {formSuccess ? (
              <View style={{ backgroundColor: "#F0FDF4", borderWidth: 1, borderColor: "#BBF7D0", borderRadius: 12, padding: 14, marginBottom: 16, flexDirection: "row", alignItems: "flex-start" }}>
                <Ionicons name="checkmark-circle" size={20} color="#16A34A" style={{ marginTop: 1, marginRight: 10 }} />
                <Text style={{ flex: 1, fontSize: 14, color: "#166534", lineHeight: 20 }}>{formSuccess}</Text>
              </View>
            ) : null}

            {auth.email_provider_enabled && auth.phone_provider_enabled ? (
              <View style={{ flexDirection: "row", borderRadius: 14, backgroundColor: "#F3F4F6", padding: 4, marginBottom: 24 }} accessibilityRole="tablist">
                {(["phone", "email"] as const).map((m) => (
                  <TouchableOpacity
                    key={m}
                    onPress={() => {
                      setMode(m);
                      setFormError(null);
                      setFormSuccess(null);
                      if (m === "phone") {
                        setOtpSent(false);
                        setToken("");
                        setPendingPhone("");
                      }
                    }}
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      borderRadius: 11,
                      backgroundColor: mode === m ? "#fff" : "transparent",
                    }}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: mode === m }}
                  >
                    <Text style={{ textAlign: "center", fontSize: 14, fontWeight: mode === m ? "700" : "500", color: mode === m ? PRIMARY : "#6B7280" }}>
                      {m === "phone" ? "Phone" : "Email"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            {mode === "phone" && auth.phone_provider_enabled ? (
              <>
                {otpSent ? (
                  <>
                    <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 8 }}>Verification code</Text>
                    <OtpDigitRow
                      length={smsOtpLen}
                      value={token}
                      onChange={setToken}
                      onComplete={(code) => {
                        if (!loading && isCompleteOtpForLength(code, smsOtpLen)) void handleVerifyOtp(code);
                      }}
                      disabled={loading}
                      autoFocus
                      smsAutofill
                      accessibilityLabelPrefix="Signup verification code"
                    />
                    <TouchableOpacity onPress={() => void handleResendPhoneOtp()} disabled={smsResendCooldown > 0 || resendingSms || loading} style={{ alignSelf: "flex-end", marginTop: 8, marginBottom: 12 }}>
                      <Text style={{ fontSize: 13, fontWeight: "600", color: PRIMARY }}>
                        {resendingSms ? "Resending..." : smsResendCooldown > 0 ? `Resend in ${smsResendCooldown}s` : "Resend code"}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => void handleVerifyOtp()} disabled={loading || !isCompleteOtpForLength(token, smsOtpLen)} style={{ backgroundColor: PRIMARY, borderRadius: 12, paddingVertical: 16, alignItems: "center", opacity: loading ? 0.7 : 1 }}>
                      {loading ? <ActivityIndicator color="white" /> : <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>Verify</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => { setOtpSent(false); setToken(""); setPendingPhone(""); setFormSuccess(null); }} style={{ paddingVertical: 12 }}>
                      <Text style={{ textAlign: "center", fontSize: 14, color: "#6B7280" }}>Use different number</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 }}>Phone number</Text>
                    <View style={{ flexDirection: "row", borderWidth: 1.5, borderColor: phoneError ? "#EF4444" : "#E5E7EB", borderRadius: 12, overflow: "hidden", marginBottom: phoneError ? 4 : 16 }}>
                      <TouchableOpacity onPress={() => { setShowCountryPicker(true); setCountrySearch(""); }} style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#F3F4F6", paddingHorizontal: 12, borderRightWidth: 1, borderRightColor: "#E5E7EB" }}>
                        <Text style={{ fontSize: 18, marginRight: 4 }}>{selectedCountry?.flag ?? "🌍"}</Text>
                        <Text style={{ fontSize: 15, fontWeight: "600", color: "#111827", marginRight: 4 }}>{countryCode}</Text>
                        <Ionicons name="chevron-down" size={14} color="#6B7280" />
                      </TouchableOpacity>
                      <TextInput
                        style={{ flex: 1, backgroundColor: "#FAFAFA", paddingHorizontal: 14, paddingVertical: 14, fontSize: 15, color: "#111827" }}
                        placeholder="71 234 5678"
                        placeholderTextColor="#9CA3AF"
                        value={phone}
                        onChangeText={handlePhoneChange}
                        keyboardType="phone-pad"
                        accessibilityLabel="Phone number"
                      />
                    </View>
                    {phoneError ? <Text style={{ fontSize: 12, color: "#EF4444", marginBottom: 12 }}>{phoneError}</Text> : null}
                    <TouchableOpacity onPress={handleSendOtp} disabled={loading} style={{ backgroundColor: PRIMARY, borderRadius: 12, paddingVertical: 16, alignItems: "center", opacity: loading ? 0.7 : 1, marginBottom: 16 }}>
                      {loading ? <ActivityIndicator color="white" /> : <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>Send code</Text>}
                    </TouchableOpacity>
                  </>
                )}
              </>
            ) : auth.email_provider_enabled ? (
              <>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 }}>{t("auth.fullName")}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: "#E5E7EB", borderRadius: 12, backgroundColor: "#FAFAFA", paddingHorizontal: 14, marginBottom: 16 }}>
                  <Ionicons name="person-outline" size={18} color="#9CA3AF" />
                  <TextInput style={{ flex: 1, paddingVertical: 14, paddingHorizontal: 10, fontSize: 15, color: "#111827" }} placeholder="Your full name" placeholderTextColor="#9CA3AF" value={fullName} onChangeText={setFullName} autoCapitalize="words" />
                </View>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 }}>{t("auth.email")}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: "#E5E7EB", borderRadius: 12, backgroundColor: "#FAFAFA", paddingHorizontal: 14, marginBottom: 16 }}>
                  <Ionicons name="mail-outline" size={18} color="#9CA3AF" />
                  <TextInput style={{ flex: 1, paddingVertical: 14, paddingHorizontal: 10, fontSize: 15, color: "#111827" }} placeholder="you@example.com" placeholderTextColor="#9CA3AF" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" returnKeyType="next" onSubmitEditing={() => passwordRef.current?.focus()} />
                </View>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 }}>{t("auth.password")}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: "#E5E7EB", borderRadius: 12, backgroundColor: "#FAFAFA", paddingHorizontal: 14, marginBottom: 8 }}>
                  <Ionicons name="lock-closed-outline" size={18} color="#9CA3AF" />
                  <TextInput ref={passwordRef} style={{ flex: 1, paddingVertical: 14, paddingHorizontal: 10, fontSize: 15, color: "#111827" }} placeholder="At least 8 characters" placeholderTextColor="#9CA3AF" value={password} onChangeText={setPassword} secureTextEntry={!showPassword} returnKeyType="next" onSubmitEditing={() => confirmRef.current?.focus()} />
                  <TouchableOpacity onPress={() => setShowPassword((v) => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#6B7280" />
                  </TouchableOpacity>
                </View>
                {password.length > 0 ? (
                  <View style={{ marginBottom: 16 }}>
                    <View style={{ flexDirection: "row", gap: 4 }}>
                      {[1, 2, 3, 4, 5].map((i) => (
                        <View
                          key={i}
                          style={{
                            height: 4,
                            flex: 1,
                            borderRadius: 999,
                            backgroundColor: i <= getPasswordStrength(password).score ? getPasswordStrength(password).color : "#E5E7EB",
                          }}
                        />
                      ))}
                    </View>
                    <Text style={{ marginTop: 4, fontSize: 12, color: "#6B7280" }}>
                      {t("auth.passwordStrength")}: {t(getPasswordStrength(password).labelKey)}
                    </Text>
                  </View>
                ) : (
                  <View style={{ marginBottom: 8 }} />
                )}
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 }}>{t("auth.confirmPassword")}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: "#E5E7EB", borderRadius: 12, backgroundColor: "#FAFAFA", paddingHorizontal: 14, marginBottom: 20 }}>
                  <Ionicons name="lock-closed-outline" size={18} color="#9CA3AF" />
                  <TextInput ref={confirmRef} style={{ flex: 1, paddingVertical: 14, paddingHorizontal: 10, fontSize: 15, color: "#111827" }} placeholder="Repeat password" placeholderTextColor="#9CA3AF" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry={!showPassword} returnKeyType="done" onSubmitEditing={handleEmailSignup} />
                </View>
                <TouchableOpacity onPress={handleEmailSignup} disabled={loading} style={{ backgroundColor: PRIMARY, borderRadius: 12, paddingVertical: 16, alignItems: "center", opacity: loading ? 0.7 : 1, marginBottom: 16 }}>
                  {loading ? <ActivityIndicator color="white" /> : <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>{t("auth.createAccount")}</Text>}
                </TouchableOpacity>
              </>
            ) : null}

            {hasSocialAuth && (mode === "phone" ? !otpSent : true) ? (
              <>
                <View style={{ flexDirection: "row", alignItems: "center", marginVertical: 20 }}>
                  <View style={{ flex: 1, height: 1, backgroundColor: "#E5E7EB" }} />
                  <Text style={{ marginHorizontal: 16, fontSize: 13, color: "#9CA3AF" }}>or</Text>
                  <View style={{ flex: 1, height: 1, backgroundColor: "#E5E7EB" }} />
                </View>
                {socialAuth.google && (
                  <TouchableOpacity onPress={() => void handleSocialOAuth("google")} disabled={loading} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "#E5E7EB", borderRadius: 12, paddingVertical: 14, marginBottom: 12, backgroundColor: "#fff" }}>
                    <Ionicons name="logo-google" size={20} color="#4285F4" style={{ marginRight: 10 }} />
                    <Text style={{ fontSize: 15, color: "#111827", fontWeight: "500" }}>{t("auth.continueWithGoogle")}</Text>
                  </TouchableOpacity>
                )}
                {socialAuth.apple && Platform.OS === "ios" ? (
                  <AppleAuthButton onPress={() => void handleSocialOAuth("apple")} disabled={loading} />
                ) : socialAuth.apple ? (
                  <TouchableOpacity onPress={() => void handleSocialOAuth("apple")} disabled={loading} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "#E5E7EB", borderRadius: 12, paddingVertical: 14, marginBottom: 12, backgroundColor: "#fff" }}>
                    <Ionicons name="logo-apple" size={20} color="#000" style={{ marginRight: 10 }} />
                    <Text style={{ fontSize: 15, color: "#111827", fontWeight: "500" }}>{t("auth.continueWithApple")}</Text>
                  </TouchableOpacity>
                ) : null}
              </>
            ) : null}

            <TouchableOpacity onPress={goToLogin} style={{ marginTop: 20, paddingVertical: 8 }} accessibilityRole="link">
              <Text style={{ textAlign: "center", fontSize: 14, color: "#6B7280" }}>
                {t("auth.alreadyHaveAccount")} <Text style={{ fontWeight: "700", color: PRIMARY }}>{t("auth.login")}</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        <Modal visible={showCountryPicker} transparent animationType="slide" onRequestClose={() => setShowCountryPicker(false)}>
          <Pressable style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" }} onPress={() => setShowCountryPicker(false)}>
            <Pressable style={{ backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "70%" }} onPress={(e) => e.stopPropagation()}>
              <View style={{ paddingHorizontal: screenPadding, paddingVertical: 12, borderBottomWidth: 1, borderColor: "#F3F4F6" }}>
                <Text style={{ textAlign: "center", fontWeight: "700", fontSize: 17, color: "#111827", marginBottom: 12 }}>Select country</Text>
                <TextInput style={{ backgroundColor: "#F3F4F6", borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, fontSize: 15 }} placeholder="Search country..." placeholderTextColor="#9CA3AF" value={countrySearch} onChangeText={setCountrySearch} />
              </View>
              <FlatList
                {...verticalFlatListPerf}
                data={filteredCountries}
                keyExtractor={(c: { code: string }) => c.code}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item: c }: { item: { code: string; flag: string; label: string } }) => (
                  <TouchableOpacity
                    onPress={() => {
                      setCountryCode(c.code);
                      setShowCountryPicker(false);
                      setPhoneError(phone.trim() ? validateNationalPhoneDigits(phone, c.code) : null);
                    }}
                    style={{ flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: screenPadding, borderBottomWidth: 1, borderColor: "#F9FAFB" }}
                  >
                    <Text style={{ fontSize: 20, marginRight: 12 }}>{c.flag}</Text>
                    <Text style={{ flex: 1, fontSize: 15, color: countryCode === c.code ? PRIMARY : "#111827", fontWeight: countryCode === c.code ? "700" : "400" }}>{c.label}</Text>
                    {countryCode === c.code && <Ionicons name="checkmark-circle" size={20} color={PRIMARY} />}
                  </TouchableOpacity>
                )}
              />
            </Pressable>
          </Pressable>
        </Modal>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
