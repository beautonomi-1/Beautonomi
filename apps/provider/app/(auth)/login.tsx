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
import { api } from "@/lib/api-client";
import {
  normalizeSupabaseAuthPhone,
  normalizeSupabaseSmsOtpToken,
  isCompleteOtpForLength,
  SUPABASE_AUTH_OTP_LENGTH,
  SUPABASE_EMAIL_OTP_RESEND_COOLDOWN_SECONDS,
  SUPABASE_SMS_OTP_RESEND_COOLDOWN_SECONDS,
  isCompleteSupabaseSmsOtp,
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
import { trackLogin, trackSignUp } from "@/lib/analytics";
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
import {
  completeAppReviewDemoSignIn,
  isAppReviewDemoEmail,
  isAppReviewDemoPhone,
} from "@/lib/auth/app-review-demo";
import { useTranslation } from "@beautonomi/i18n";

const PRIMARY = Colors.primary;

/** Wait for session storage so root `/` portal + profile checks see a valid Bearer token on iOS. */
async function goToAppRoot(
  router: { replace: (href: string) => void },
  method: string,
  redirectPath?: string,
) {
  await supabase.auth.getSession();
  logLoginSuccessBreadcrumb(method);
  router.replace(redirectPath ?? "/");
}

const PRIMARY_LIGHT = "rgba(255,0,119,0.06)";

type LoginMode = "phone" | "email";

export default function LoginScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    deactivated?: string;
    suspended?: string;
    deletion_scheduled?: string;
    joinToken?: string;
    email?: string;
  }>();
  const postLoginPath = useMemo(() => {
    const token = typeof params.joinToken === "string" ? params.joinToken.trim() : "";
    return token ? `/join?token=${encodeURIComponent(token)}` : undefined;
  }, [params.joinToken]);
  const { contentMaxWidth, isTablet, screenPadding } = useResponsive();
  const { t } = useTranslation();
  const al = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.authLogin.${key}`, opts) as string,
    [t],
  );
  const {
    signInWithOtp,
    verifyOtp,
    signInWithOtpEmail,
    verifyOtpEmail,
    signInWithEmail,
    signUpWithEmail,
    verifySignupEmailOtp,
    resendSignupConfirmationEmail,
    signInWithOAuth,
  } = useAuth();
  const { bundle: configBundle } = useConfigBundle();
  const auth = configBundle?.auth ?? DEFAULT_AUTH;
  const emailOtpLen = auth.email_otp_length;
  const emailOtpExpiryMin = Math.max(1, Math.round(auth.email_otp_expiration_seconds / 60));
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

  const joinEmailPrefill =
    typeof params.email === "string" ? params.email.trim() : "";
  const [mode, setMode] = useState<LoginMode>(joinEmailPrefill ? "email" : "phone");
  const statusMessage =
    params.suspended === "1"
      ? al("accountSuspended")
      : params.deletion_scheduled === "1"
        ? al("accountDeletionScheduled")
        : params.deactivated === "1"
          ? al("accountDeactivated")
          : null;
  const [countryCode, setCountryCode] = useState(getDeviceDefaultCountryDial);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [pendingPhone, setPendingPhone] = useState("");
  const [email, setEmail] = useState(joinEmailPrefill);
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [isSignup, setIsSignup] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [awaitingSignupVerification, setAwaitingSignupVerification] = useState(false);
  const [signupOtpCode, setSignupOtpCode] = useState("");
  const [verifyingSignupOtp, setVerifyingSignupOtp] = useState(false);
  const [resendingSignupOtp, setResendingSignupOtp] = useState(false);
  const [signupOtpResendCooldown, setSignupOtpResendCooldown] = useState(0);
  const [signupOtpError, setSignupOtpError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");

  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);
  const [emailOtpMode, setEmailOtpMode] = useState(false);
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [emailOtpCode, setEmailOtpCode] = useState("");
  const [pendingEmailOtp, setPendingEmailOtp] = useState("");
  /** Cooldown timers (seconds) prevent users from spamming Supabase rate-limits during OTP resend. */
  const [smsResendCooldown, setSmsResendCooldown] = useState(0);
  const [emailResendCooldown, setEmailResendCooldown] = useState(0);
  const [resendingSms, setResendingSms] = useState(false);
  const [resendingEmail, setResendingEmail] = useState(false);
  const [socialAuth, setSocialAuth] = useState<{ google: boolean; apple: boolean }>({
    google: true,
    apple: true,
  });

  useEffect(() => {
    if (smsResendCooldown <= 0) return;
    const id = setInterval(() => setSmsResendCooldown((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [smsResendCooldown]);

  useEffect(() => {
    if (emailResendCooldown <= 0) return;
    const id = setInterval(() => setEmailResendCooldown((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [emailResendCooldown]);

  useEffect(() => {
    if (signupOtpResendCooldown <= 0) return;
    const id = setInterval(() => setSignupOtpResendCooldown((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [signupOtpResendCooldown]);

  const goToSignup = useCallback(() => {
    const token = typeof params.joinToken === "string" ? params.joinToken.trim() : "";
    const qs = new URLSearchParams();
    if (token) qs.set("joinToken", token);
    if (joinEmailPrefill) qs.set("email", joinEmailPrefill);
    const href = qs.toString() ? `/(auth)/signup?${qs.toString()}` : "/(auth)/signup";
    router.push(href as never);
  }, [router, params.joinToken, joinEmailPrefill]);

  const fullPhone = `${countryCode}${stripLeadingZero(phone.replace(/\D/g, ""))}`.trim();
  const hasSocialAuth = socialAuth.google || socialAuth.apple;
  const showPhoneLoginBlock =
    auth.phone_provider_enabled && (mode === "phone" || !auth.email_provider_enabled);
  const showEmailLoginBlock =
    auth.email_provider_enabled && (mode === "email" || !auth.phone_provider_enabled);
  const filteredCountries = useMemo(() => {
    if (!countrySearch) return COUNTRY_CODES;
    const q = countrySearch.toLowerCase();
    return COUNTRY_CODES.filter((c) => c.label.toLowerCase().includes(q));
  }, [countrySearch]);
  const selectedCountry = COUNTRY_CODES.find((c) => c.code === countryCode);

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

  useEffect(() => {
    if (auth.email_provider_enabled) return;
    if (mode !== "email") return;
    setMode("phone");
    setEmailOtpMode(false);
    setEmailOtpSent(false);
    setEmailOtpCode("");
    setPendingEmailOtp("");
  }, [auth.email_provider_enabled, mode]);

  useEffect(() => {
    if (auth.phone_provider_enabled) return;
    if (mode !== "phone") return;
    setMode("email");
  }, [auth.phone_provider_enabled, mode]);

  useEffect(() => {
    if (auth.phone_provider_enabled) return;
    setOtpSent(false);
    setToken("");
    setPendingPhone("");
  }, [auth.phone_provider_enabled]);

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
    if (!auth.phone_provider_enabled) {
      setFormError(al("phoneSignInDisabled"));
      return;
    }
    setFormError(null);
    setFormSuccess(null);
    if (!phone.trim()) {
      setFormError(al("enterPhone"));
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
      if (isAppReviewDemoPhone(e164)) {
        setPendingPhone(e164);
        setOtpSent(true);
        setSmsResendCooldown(SUPABASE_SMS_OTP_RESEND_COOLDOWN_SECONDS);
        setFormSuccess(al("appReviewDemoHint"));
        return;
      }
      const { error } = await signInWithOtp(e164);
      if (error) {
        setFormError(error.message);
        return;
      }
      setPendingPhone(e164);
      setOtpSent(true);
      setSmsResendCooldown(SUPABASE_SMS_OTP_RESEND_COOLDOWN_SECONDS);
      setFormSuccess(
        al("smsCodeSent", {
          digits: smsOtpLen,
          minutes: smsOtpExpiryMin,
          minuteWord: smsOtpExpiryMin === 1 ? al("minuteSingular") : al("minutePlural"),
        }),
      );
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : al("genericError"));
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
      if (isAppReviewDemoPhone(pendingPhone)) {
        setToken("");
        setSmsResendCooldown(SUPABASE_SMS_OTP_RESEND_COOLDOWN_SECONDS);
        setFormSuccess(al("appReviewDemoHint"));
        return;
      }
      const { error } = await signInWithOtp(pendingPhone);
      if (error) {
        setFormError(error.message);
        return;
      }
      setToken("");
      setSmsResendCooldown(SUPABASE_SMS_OTP_RESEND_COOLDOWN_SECONDS);
      setFormSuccess(al("codeResent"));
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : al("resendFailed"));
    } finally {
      setResendingSms(false);
    }
  }

  async function handleResendEmailOtp() {
    if (emailResendCooldown > 0 || resendingEmail) return;
    const addr = pendingEmailOtp || email.trim();
    if (!addr) return;
    setFormError(null);
    setResendingEmail(true);
    try {
      if (isAppReviewDemoEmail(addr)) {
        setEmailOtpCode("");
        setEmailResendCooldown(SUPABASE_EMAIL_OTP_RESEND_COOLDOWN_SECONDS);
        setFormSuccess(al("appReviewDemoHint"));
        return;
      }
      const { error } = await signInWithOtpEmail(addr);
      if (error) {
        setFormError(error.message);
        return;
      }
      setEmailOtpCode("");
      setEmailResendCooldown(SUPABASE_EMAIL_OTP_RESEND_COOLDOWN_SECONDS);
      setFormSuccess(al("codeResent"));
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : al("resendFailed"));
    } finally {
      setResendingEmail(false);
    }
  }

  async function handleVerifyOtp(otpOverride?: string) {
    if (!auth.phone_provider_enabled) {
      setFormError(al("phoneSignInDisabled"));
      return;
    }
    setFormError(null);
    const otpToken = normalizeSupabaseSmsOtpToken(otpOverride ?? token);
    if (!isCompleteOtpForLength(otpToken, smsOtpLen)) {
      setFormError(al("enterSmsOtp", { digits: smsOtpLen }));
      return;
    }
    const phoneToVerify = pendingPhone || fullPhone;
    const raw = phoneToVerify.startsWith("+") ? phoneToVerify : `+${phoneToVerify}`;
    const e164 = normalizeSupabaseAuthPhone(raw);
    setLoading(true);
    try {
      if (isAppReviewDemoPhone(e164)) {
        await completeAppReviewDemoSignIn({ phone: e164, otp: otpToken });
        await writeSignupPhoneHandoff(e164);
        await applyPendingSignupPreferences();
        await goToAppRoot(router, "phone_otp_app_review", postLoginPath);
        return;
      }
      const { error } = await verifyOtp(e164, otpToken);
      if (error) {
        setFormError(error.message);
        return;
      }
      await writeSignupPhoneHandoff(e164);
      await applyPendingSignupPreferences();
      await goToAppRoot(router, "phone_otp", postLoginPath);
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : al("verificationFailed"));
    } finally {
      setLoading(false);
    }
  }

  async function handleSocialOAuth(provider: OAuthProvider) {
    setFormError(null);
    setLoading(true);
    try {
      const { error } = await signInWithOAuth(provider);
      if (error) {
        setFormError(
          error.message +
            (error.message.includes("not enabled")
              ? al("oauthEnableHint")
              : ""),
        );
        return;
      }
      await applyPendingSignupPreferences();
      await goToAppRoot(router, `oauth_${provider}`, postLoginPath);
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : al("oauthFailed"));
    } finally {
      setLoading(false);
    }
  }

  async function handleEmailSubmit() {
    setFormError(null);
    if (!email.trim()) {
      setFormError(al("enterEmail"));
      return;
    }
    if (!password) {
      setFormError(al("enterPassword"));
      return;
    }
    if (password.length < 8) {
      setFormError(al("passwordMin8"));
      return;
    }
    if (isSignup && !fullName.trim()) {
      setFormError(al("enterFullName"));
      return;
    }
    setLoading(true);
    try {
      if (isSignup) {
        await persistProviderSignupSource();
        const result = await signUpWithEmail(email.trim(), password, { full_name: fullName.trim() });
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
      } else {
        const result = await signInWithEmail(email.trim(), password);
        if (result.error) {
          setFormError(result.error.message);
          return;
        }
        trackLogin("email");
      }
      await applyPendingSignupPreferences();
      await goToAppRoot(router, isSignup ? "email_signup" : "email_password", postLoginPath);
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : al("genericError"));
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
      await applyPendingSignupPreferences();
      await goToAppRoot(router, "email_signup", postLoginPath);
    } catch (e: unknown) {
      setSignupOtpError(e instanceof Error ? e.message : al("verificationFailedShort"));
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
      setSignupOtpError(e instanceof Error ? e.message : al("resendFailed"));
    } finally {
      setResendingSignupOtp(false);
    }
  }

  async function handleSendEmailOtp() {
    if (!auth.email_provider_enabled) {
      setFormError(al("emailSignInDisabled"));
      return;
    }
    setFormError(null);
    setFormSuccess(null);
    const trimmed = email.trim();
    if (!trimmed) {
      setFormError(al("enterEmail"));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setFormError(al("validEmail"));
      return;
    }
    setLoading(true);
    try {
      if (isAppReviewDemoEmail(trimmed)) {
        setPendingEmailOtp(trimmed);
        setEmailOtpSent(true);
        setEmailOtpCode("");
        setEmailResendCooldown(SUPABASE_EMAIL_OTP_RESEND_COOLDOWN_SECONDS);
        setFormSuccess(al("appReviewDemoHint"));
        return;
      }
      const { error } = await signInWithOtpEmail(trimmed);
      if (error) {
        setFormError(error.message);
        return;
      }
      setPendingEmailOtp(trimmed);
      setEmailOtpSent(true);
      setEmailOtpCode("");
      setEmailResendCooldown(SUPABASE_EMAIL_OTP_RESEND_COOLDOWN_SECONDS);
      setFormSuccess(
        al("emailCodeSent", { digits: emailOtpLen, minutes: emailOtpExpiryMin }),
      );
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : al("sendCodeFailed"));
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyEmailOtp(otpOverride?: string) {
    setFormError(null);
    const otpToken = normalizeSupabaseSmsOtpToken(otpOverride ?? emailOtpCode);
    if (!isCompleteOtpForLength(otpToken, emailOtpLen)) {
      setFormError(al("enterEmailOtp", { digits: emailOtpLen }));
      return;
    }
    const addr = pendingEmailOtp || email.trim();
    setLoading(true);
    try {
      if (isAppReviewDemoEmail(addr)) {
        await completeAppReviewDemoSignIn({ email: addr, otp: otpToken });
        trackLogin("email");
        await applyPendingSignupPreferences();
        await goToAppRoot(router, "email_otp_app_review", postLoginPath);
        return;
      }
      const { error } = await verifyOtpEmail(addr, otpToken);
      if (error) {
        setFormError(error.message);
        return;
      }
      trackLogin("email");
      await applyPendingSignupPreferences();
      await goToAppRoot(router, "email_otp", postLoginPath);
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : al("verificationFailedShort"));
    } finally {
      setLoading(false);
    }
  }

  if (awaitingSignupVerification) {
    return (
      <ScreenContainer edges={["top"]} scrollable={false} keyboardAvoiding={false} reserveTabBarSpace={false} noPadding>
        <KeyboardAvoidingView
          style={{ flex: 1, backgroundColor: "#ffffff" }}
          behavior="padding"
        >
          <ScrollView
            style={{ flex: 1, backgroundColor: "#ffffff" }}
            contentContainerStyle={scrollContentStyle}
            keyboardShouldPersistTaps="handled"
          >
            <View style={formStyle}>
              <View
                style={{
                  borderWidth: 1,
                  borderColor: "#A7F3D0",
                  backgroundColor: "#ECFDF5",
                  borderRadius: 16,
                  padding: 20,
                }}
              >
                <View
                  style={{
                    alignSelf: "center",
                    width: 52,
                    height: 52,
                    borderRadius: 26,
                    backgroundColor: "#D1FAE5",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 14,
                  }}
                >
                  <Ionicons name="checkmark-circle" size={28} color="#059669" />
                </View>
                <Text style={{ textAlign: "center", fontSize: 18, fontWeight: "700", color: "#111827", marginBottom: 6 }}>
                  {al("verifyYourEmail")}
                </Text>
                <Text style={{ textAlign: "center", fontSize: 13, color: "#4B5563", marginBottom: 4 }}>
                  {al("signupOtpSentPrefix", { digits: SUPABASE_AUTH_OTP_LENGTH })}
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
                    if (!verifyingSignupOtp && isCompleteSupabaseSmsOtp(code)) {
                      void handleVerifySignupOtp(code);
                    }
                  }}
                  disabled={verifyingSignupOtp}
                  autoFocus
                  accessibilityLabelPrefix={al("signupVerificationCodeA11y")}
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
                  accessibilityRole="button"
                  accessibilityLabel={al("verifyAndContinueA11y")}
                >
                  {verifyingSignupOtp ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>{al("verifyAndContinue")}</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => void handleResendSignupOtp()}
                  disabled={resendingSignupOtp || signupOtpResendCooldown > 0}
                  style={{
                    marginTop: 10,
                    borderWidth: 1,
                    borderColor: "#A7F3D0",
                    borderRadius: 12,
                    paddingVertical: 12,
                    alignItems: "center",
                    opacity: resendingSignupOtp || signupOtpResendCooldown > 0 ? 0.6 : 1,
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={al("resendVerificationCode")}
                >
                  {resendingSignupOtp ? (
                    <ActivityIndicator color={PRIMARY} />
                  ) : signupOtpResendCooldown > 0 ? (
                    <Text style={{ color: "#374151", fontSize: 14, fontWeight: "600" }}>
                      {al("resendCodeInSeconds", { seconds: signupOtpResendCooldown })}
                    </Text>
                  ) : (
                    <Text style={{ color: "#374151", fontSize: 14, fontWeight: "600" }}>{al("resendVerificationCode")}</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setAwaitingSignupVerification(false);
                    setSignupOtpCode("");
                    setSignupOtpError(null);
                  }}
                  style={{ marginTop: 14, alignItems: "center" }}
                  accessibilityRole="button"
                  accessibilityLabel={al("goBackEditSignupA11y")}
                >
                  <Text style={{ color: "#6B7280", fontSize: 13 }}>{al("wrongEmailGoBack")}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </ScreenContainer>
    );
  }

  return (
    // §provider-setup-seamless-ux 2026-05: wrap the auth form in the shared
    // `ScreenContainer` so the brand background, safe-area handling, and
    // tablet content-max-width clamp are identical to every other in-app
    // screen. We keep the inner `KeyboardAvoidingView` + `ScrollView` (the
    // existing offset and `scrollContentStyle` are tuned for this specific
    // form) and disable the outer KAV/scroller on `ScreenContainer`.
    <ScreenContainer
      edges={["top"]}
      scrollable={false}
      keyboardAvoiding={false}
      reserveTabBarSpace={false}
      noPadding
    >
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#ffffff" }}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      <ScrollView
        style={{ flex: 1, backgroundColor: "#ffffff" }}
        contentContainerStyle={scrollContentStyle}
        keyboardShouldPersistTaps="handled"
      >
        <View style={formStyle}>
        {/* Logo accent */}
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

        <Text
          style={{ textAlign: "center", fontSize: 28, fontWeight: "800", color: "#111827", marginBottom: 6, letterSpacing: -0.3 }}
          accessibilityRole="header"
        >
          {t("auth.welcome")}
        </Text>
        <Text style={{ textAlign: "center", fontSize: 15, color: "#6B7280", lineHeight: 22, marginBottom: 28 }}>
          {al("subtitle")}
        </Text>

        <Text style={{ textAlign: "center", fontSize: 12, color: "#6B7280", marginBottom: 18 }}>
          {al("continueWithPhoneEmailSocial")}
        </Text>

        {/* Account status message (deactivated/suspended redirect) */}
        {statusMessage ? (
          <View
            style={{
              backgroundColor: params.suspended === "1" ? "#FEF2F2" : "#FFFBEB",
              borderWidth: 1,
              borderColor: params.suspended === "1" ? "#FECACA" : "#FDE68A",
              borderRadius: 12,
              padding: 14,
              marginBottom: 16,
              flexDirection: "row",
              alignItems: "flex-start",
            }}
          >
            <Ionicons name="information-circle" size={20} color={params.suspended === "1" ? "#DC2626" : "#D97706"} style={{ marginTop: 1, marginEnd: 10 }} />
            <Text style={{ flex: 1, fontSize: 14, color: params.suspended === "1" ? "#991B1B" : "#92400E", lineHeight: 20 }}>{statusMessage}</Text>
          </View>
        ) : null}
        {/* Inline error / success feedback */}
        {formError ? (
          <View
            style={{
              backgroundColor: "#FEF2F2",
              borderWidth: 1,
              borderColor: "#FECACA",
              borderRadius: 12,
              padding: 14,
              marginBottom: 16,
              flexDirection: "row",
              alignItems: "flex-start",
            }}
          >
            <Ionicons name="alert-circle" size={20} color="#DC2626" style={{ marginTop: 1, marginEnd: 10 }} />
            <Text style={{ flex: 1, fontSize: 14, color: "#991B1B", lineHeight: 20 }}>{formError}</Text>
          </View>
        ) : null}
        {formSuccess ? (
          <View
            style={{
              backgroundColor: "#F0FDF4",
              borderWidth: 1,
              borderColor: "#BBF7D0",
              borderRadius: 12,
              padding: 14,
              marginBottom: 16,
              flexDirection: "row",
              alignItems: "flex-start",
            }}
          >
            <Ionicons name="checkmark-circle" size={20} color="#16A34A" style={{ marginTop: 1, marginEnd: 10 }} />
            <Text style={{ flex: 1, fontSize: 14, color: "#166534", lineHeight: 20 }}>{formSuccess}</Text>
          </View>
        ) : null}

        {/* Mode toggle when both phone and email sign-in are enabled */}
        {auth.email_provider_enabled && auth.phone_provider_enabled ? (
          <View
            style={{
              flexDirection: "row",
              borderRadius: 14,
              backgroundColor: "#F3F4F6",
              padding: 4,
              marginBottom: 24,
            }}
            accessibilityRole="tablist"
            accessibilityLabel={al("loginMethodSelectionA11y")}
          >
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
                  if (m === "email") {
                    setEmailOtpMode(true);
                    setEmailOtpSent(false);
                    setEmailOtpCode("");
                    setPendingEmailOtp("");
                  }
                }}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 11,
                  backgroundColor: mode === m ? "#fff" : "transparent",
                  ...(mode === m
                    ? Platform.select({
                        web: { boxShadow: "0 1px 3px rgba(0,0,0,0.08)" },
                        default: { shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
                      })
                    : {}),
                }}
                accessibilityRole="tab"
                accessibilityState={{ selected: mode === m }}
                accessibilityLabel={m === "phone" ? al("methodPhone") : al("methodEmail")}
              >
                <Text
                  style={{
                    textAlign: "center",
                    fontSize: 14,
                    fontWeight: mode === m ? "700" : "500",
                    color: mode === m ? PRIMARY : "#6B7280",
                  }}
                >
                  {m === "phone" ? al("methodPhone") : al("methodEmail")}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {showPhoneLoginBlock ? (
          <>
            {otpSent && auth.phone_provider_enabled ? (
              <>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 8 }}>
                  {al("verificationCodeLabel")}
                </Text>
                <Text style={{ fontSize: 12, color: "#6B7280", marginBottom: 12 }}>
                  {al("enterSmsOtp", { digits: smsOtpLen })}
                </Text>
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
                  accessibilityLabelPrefix={al("loginVerificationCodeA11y")}
                />
                <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 8, marginBottom: 8 }}>
                  <TouchableOpacity
                    onPress={() => void handleResendPhoneOtp()}
                    disabled={smsResendCooldown > 0 || resendingSms || loading}
                    accessibilityRole="button"
                    accessibilityLabel={al("resendSmsCodeA11y")}
                    style={{ opacity: smsResendCooldown > 0 || resendingSms || loading ? 0.5 : 1 }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "600", color: PRIMARY }}>
                      {resendingSms
                        ? al("resending")
                        : smsResendCooldown > 0
                          ? al("resendCountdown", { seconds: smsResendCooldown })
                          : al("resendCode")}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 }}>
                  {al("phoneNumberLabel")}
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    borderWidth: 1.5,
                    borderColor: phoneError ? "#EF4444" : "#E5E7EB",
                    borderRadius: 12,
                    overflow: "hidden",
                    marginBottom: phoneError ? 4 : 16,
                  }}
                >
                  <TouchableOpacity
                    onPress={() => { setShowCountryPicker(true); setCountrySearch(""); }}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: "#F3F4F6",
                      paddingHorizontal: 12,
                      borderRightWidth: 1,
                      borderRightColor: "#E5E7EB",
                    }}
                    accessibilityLabel={al("selectCountryCodeA11y")}
                    accessibilityRole="button"
                  >
                    <Text style={{ fontSize: 18, marginEnd: 4 }}>{selectedCountry?.flag ?? "🌍"}</Text>
                    <Text style={{ fontSize: 15, fontWeight: "600", color: "#111827", marginEnd: 4 }}>{countryCode}</Text>
                    <Ionicons name="chevron-down" size={14} color="#6B7280" />
                  </TouchableOpacity>
                  <TextInput
                    style={{
                      flex: 1,
                      backgroundColor: "#FAFAFA",
                      paddingHorizontal: 14,
                      paddingVertical: 14,
                      fontSize: 15,
                      color: "#111827",
                    }}
                    placeholder={al("nationalPhonePlaceholder")}
                    placeholderTextColor="#9CA3AF"
                    value={phone}
                    onChangeText={handlePhoneChange}
                    keyboardType="phone-pad"
                    textContentType="telephoneNumber"
                    autoComplete="tel-national"
                    importantForAutofill="yes"
                    accessibilityLabel={al("phoneA11y")}
                  />
                </View>
                {phoneError ? (
                  <Text style={{ fontSize: 12, color: "#EF4444", marginBottom: 12 }}>{phoneError}</Text>
                ) : null}
                <Text style={{ fontSize: 12, color: "#6B7280", marginBottom: 10, lineHeight: 18 }}>
                  {al("nationalNumberHint")}
                </Text>
                <Text style={{ fontSize: 12, color: "#6B7280", marginBottom: 20, lineHeight: 18 }}>
                  {al("smsDisclaimer", {
                    digits: smsOtpLen,
                    minutes: smsOtpExpiryMin,
                    minuteWord: smsOtpExpiryMin === 1 ? al("minuteSingular") : al("minutePlural"),
                  })}{" "}
                  <Text
                    style={{ fontWeight: "600", color: "#111827", textDecorationLine: "underline" }}
                    onPress={() => Linking.openURL(webPartnerEulaUrl()).catch(() => {})}
                  >
                    {al("partnerEula")}
                  </Text>
                  {al("legalDotSeparator")}
                  <Text
                    style={{ fontWeight: "600", color: "#111827", textDecorationLine: "underline" }}
                    onPress={() => Linking.openURL(webPrivacyPolicyUrl()).catch(() => {})}
                  >
                    {al("privacyPolicy")}
                  </Text>
                </Text>
              </>
            )}

            {otpSent && auth.phone_provider_enabled ? (
              <View>
                <TouchableOpacity
                  onPress={() => void handleVerifyOtp()}
                  disabled={loading || !isCompleteOtpForLength(token, smsOtpLen)}
                  style={{
                    backgroundColor: PRIMARY,
                    borderRadius: 12,
                    paddingVertical: 16,
                    alignItems: "center",
                    opacity: loading ? 0.7 : 1,
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={al("verifyCodeA11y")}
                >
                  {loading ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>{al("verifyButton")}</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { setOtpSent(false); setToken(""); setPendingPhone(""); setFormSuccess(null); }}
                  disabled={loading}
                  style={{ paddingVertical: 8, marginTop: 12 }}
                  accessibilityLabel={al("useDifferentNumberA11y")}
                  accessibilityRole="button"
                >
                  <Text style={{ textAlign: "center", fontSize: 14, color: "#6B7280" }}>
                    {al("useDifferentNumber")}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <TouchableOpacity
                  onPress={handleSendOtp}
                  disabled={loading}
                  style={{
                    backgroundColor: PRIMARY,
                    borderRadius: 12,
                    paddingVertical: 16,
                    alignItems: "center",
                    opacity: loading ? 0.7 : 1,
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={al("sendVerificationCodeA11y")}
                >
                  {loading ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>{al("sendCode")}</Text>
                  )}
                </TouchableOpacity>
                {auth.email_provider_enabled && auth.phone_provider_enabled ? (
                  <TouchableOpacity
                    onPress={() => {
                      setMode("email");
                      setEmailOtpMode(true);
                      setEmailOtpSent(false);
                      setEmailOtpCode("");
                      setPendingEmailOtp("");
                      setFormError(null);
                    }}
                    disabled={loading}
                    style={{
                      marginTop: 14,
                      borderWidth: 1.5,
                      borderColor: "#E5E7EB",
                      borderRadius: 12,
                      paddingVertical: 14,
                      alignItems: "center",
                      backgroundColor: "#fff",
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={al("continueEmailA11y")}
                  >
                    <Text style={{ fontSize: 15, color: "#111827", fontWeight: "600" }}>{al("continueEmail")}</Text>
                  </TouchableOpacity>
                ) : null}
              </>
            )}
          </>
        ) : showEmailLoginBlock ? (
          <>
            {auth.email_provider_enabled && auth.phone_provider_enabled ? (
              <TouchableOpacity
                onPress={() => {
                  setMode("phone");
                  setFormError(null);
                  setFormSuccess(null);
                }}
                style={{ marginBottom: 16 }}
                accessibilityRole="button"
                accessibilityLabel={al("continuePhoneA11y")}
              >
                <Text style={{ fontSize: 14, color: PRIMARY, fontWeight: "600" }}>{al("continuePhone")}</Text>
              </TouchableOpacity>
            ) : null}
            {isSignup ? (
              <Text style={{ textAlign: "center", fontSize: 18, fontWeight: "700", color: "#111827", marginBottom: 20 }}>
                {al("createAccountTitle")}
              </Text>
            ) : null}
            {isSignup && (
              <>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 }}>
                  {al("fullNameLabel")}
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    borderWidth: 1.5,
                    borderColor: "#E5E7EB",
                    borderRadius: 12,
                    backgroundColor: "#FAFAFA",
                    paddingHorizontal: 14,
                    marginBottom: 16,
                  }}
                >
                  <Ionicons name="person-outline" size={18} color="#9CA3AF" />
                  <TextInput
                    style={{ flex: 1, paddingVertical: 14, paddingHorizontal: 10, fontSize: 15, color: "#111827" }}
                    placeholder={al("namePlaceholder")}
                    placeholderTextColor="#9CA3AF"
                    value={fullName}
                    onChangeText={setFullName}
                    autoCapitalize="words"
                    accessibilityLabel={al("fullNameA11y")}
                  />
                </View>
              </>
            )}
            {/* Email */}
            <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 }}>
              {al("emailLabel")}
            </Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                borderWidth: 1.5,
                borderColor: "#E5E7EB",
                borderRadius: 12,
                backgroundColor: "#FAFAFA",
                paddingHorizontal: 14,
                marginBottom: 16,
              }}
            >
              <Ionicons name="mail-outline" size={18} color="#9CA3AF" />
              <TextInput
                style={{ flex: 1, paddingVertical: 14, paddingHorizontal: 10, fontSize: 15, color: "#111827" }}
                placeholder={al("emailPlaceholder")}
                placeholderTextColor="#9CA3AF"
                value={email}
                onChangeText={(t) => {
                  setEmail(t);
                  if (isAppReviewDemoEmail(t)) {
                    setMode("email");
                    setEmailOtpMode(false);
                    setEmailOtpSent(false);
                  }
                }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
              />
            </View>

            {(isSignup || !emailOtpMode) && (
              <>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 }}>
                  {t("auth.password")}
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    borderWidth: 1.5,
                    borderColor: "#E5E7EB",
                    borderRadius: 12,
                    backgroundColor: "#FAFAFA",
                    paddingHorizontal: 14,
                    marginBottom: 20,
                  }}
                >
                  <Ionicons name="lock-closed-outline" size={18} color="#9CA3AF" />
                  <TextInput
                    ref={passwordRef}
                    style={{ flex: 1, paddingVertical: 14, paddingHorizontal: 10, fontSize: 15, color: "#111827" }}
                    placeholder={al("passwordPlaceholder")}
                    placeholderTextColor="#9CA3AF"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    returnKeyType="done"
                    onSubmitEditing={handleEmailSubmit}
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword((v) => !v)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityLabel={showPassword ? al("hidePasswordA11y") : al("showPasswordA11y")}
                    accessibilityRole="button"
                  >
                    <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#6B7280" />
                  </TouchableOpacity>
                </View>
              </>
            )}

            {!isSignup && emailOtpMode && emailOtpSent && (
              <>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 8 }}>
                  {al("verificationCodeLabelShort")}
                </Text>
                <Text style={{ fontSize: 12, color: "#6B7280", marginBottom: 12 }}>
                  {al("emailOtpSentLead", { digits: emailOtpLen, email: pendingEmailOtp || email.trim() })}
                  {al("emailOtpValidFor", { minutes: emailOtpExpiryMin })}
                </Text>
                <OtpDigitRow
                  length={emailOtpLen}
                  value={emailOtpCode}
                  onChange={setEmailOtpCode}
                  onComplete={(code) => {
                    if (!loading && isCompleteOtpForLength(code, emailOtpLen)) void handleVerifyEmailOtp(code);
                  }}
                  disabled={loading}
                  autoFocus
                  accessibilityLabelPrefix={al("emailVerificationCodeA11y")}
                />
                <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 8 }}>
                  <TouchableOpacity
                    onPress={() => void handleResendEmailOtp()}
                    disabled={emailResendCooldown > 0 || resendingEmail || loading}
                    accessibilityRole="button"
                    accessibilityLabel={al("resendEmailCodeA11y")}
                    style={{ opacity: emailResendCooldown > 0 || resendingEmail || loading ? 0.5 : 1 }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "600", color: PRIMARY }}>
                      {resendingEmail
                        ? al("resending")
                        : emailResendCooldown > 0
                          ? al("resendCountdown", { seconds: emailResendCooldown })
                          : al("resendCode")}
                    </Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  onPress={() => void handleVerifyEmailOtp()}
                  disabled={loading || !isCompleteOtpForLength(emailOtpCode, emailOtpLen)}
                  style={{
                    backgroundColor: PRIMARY,
                    borderRadius: 12,
                    paddingVertical: 16,
                    alignItems: "center",
                    opacity: loading ? 0.7 : 1,
                    marginTop: 8,
                    marginBottom: 12,
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={al("verifyEmailCodeA11y")}
                >
                  {loading ? <ActivityIndicator color="white" /> : <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>{al("verifyButton")}</Text>}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setEmailOtpSent(false);
                    setEmailOtpCode("");
                    setPendingEmailOtp("");
                    setFormSuccess(null);
                  }}
                  disabled={loading}
                  style={{ paddingVertical: 8 }}
                >
                  <Text style={{ textAlign: "center", fontSize: 14, color: "#6B7280" }}>{al("useDifferentEmail")}</Text>
                </TouchableOpacity>
              </>
            )}

            {!isSignup && emailOtpMode && !emailOtpSent && (
              <>
                <Text style={{ fontSize: 12, color: "#6B7280", marginBottom: 12 }}>
                  {al("emailOtpIntro", {
                    digits: emailOtpLen,
                    minutes: emailOtpExpiryMin,
                    minuteWord: emailOtpExpiryMin === 1 ? al("minuteSingular") : al("minutePlural"),
                  })}
                </Text>
                <TouchableOpacity
                  onPress={handleSendEmailOtp}
                  disabled={loading}
                  style={{
                    backgroundColor: PRIMARY,
                    borderRadius: 12,
                    paddingVertical: 16,
                    alignItems: "center",
                    opacity: loading ? 0.7 : 1,
                    marginBottom: 12,
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={al("sendEmailCodeA11y")}
                >
                  {loading ? <ActivityIndicator color="white" /> : <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>{t("auth.sendCode")}</Text>}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setEmailOtpMode(false);
                    setEmailOtpSent(false);
                    setEmailOtpCode("");
                    setPendingEmailOtp("");
                    setFormSuccess(null);
                  }}
                  disabled={loading}
                  style={{ paddingVertical: 8 }}
                >
                  <Text style={{ textAlign: "center", fontSize: 14, color: "#6B7280" }}>{al("usePasswordInstead")}</Text>
                </TouchableOpacity>
              </>
            )}

            {(isSignup || !emailOtpMode) && (
              <TouchableOpacity
                onPress={handleEmailSubmit}
                disabled={loading}
                style={{
                  backgroundColor: PRIMARY,
                  borderRadius: 12,
                  paddingVertical: 16,
                  alignItems: "center",
                  opacity: loading ? 0.7 : 1,
                }}
                accessibilityRole="button"
                accessibilityLabel={isSignup ? al("signUpWithEmailA11y") : al("signInWithEmailA11y")}
              >
                {loading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>
                    {isSignup ? t("auth.signup") : t("auth.login")}
                  </Text>
                )}
              </TouchableOpacity>
            )}

            <TouchableOpacity
              onPress={() => {
                setIsSignup(!isSignup);
                setEmailOtpMode(false);
                setEmailOtpSent(false);
                setEmailOtpCode("");
                setPendingEmailOtp("");
                setFormError(null);
                setFormSuccess(null);
              }}
              disabled={loading}
              style={{ marginTop: 12, paddingVertical: 8 }}
              accessibilityRole="button"
            >
              <Text style={{ textAlign: "center", fontSize: 14, color: "#6B7280" }}>
                {isSignup ? `${t("auth.alreadyHaveAccount")} ` : `${t("auth.dontHaveAccount")} `}
                <Text style={{ fontWeight: "700", color: PRIMARY }}>{isSignup ? t("auth.login") : t("auth.signup")}</Text>
              </Text>
            </TouchableOpacity>

            {!isSignup && !emailOtpMode && (
              <>
                <TouchableOpacity
                  onPress={() => router.push("/(auth)/forgot-password" as never)}
                  style={{ marginTop: 12 }}
                  accessibilityRole="link"
                  accessibilityLabel={al("forgotPasswordA11y")}
                >
                  <Text style={{ textAlign: "center", fontSize: 14, color: "#6B7280" }}>
                    {t("auth.forgotPassword")}{" "}
                    <Text style={{ fontWeight: "700", color: PRIMARY }}>{t("auth.resetPassword")}</Text>
                  </Text>
                </TouchableOpacity>
                {auth.email_provider_enabled && (
                  <TouchableOpacity
                    onPress={() => {
                      setEmailOtpMode(true);
                      setPassword("");
                      setEmailOtpSent(false);
                      setEmailOtpCode("");
                      setPendingEmailOtp("");
                      setFormError(null);
                      setFormSuccess(null);
                    }}
                    disabled={loading}
                    style={{ marginTop: 8 }}
                  >
                    <Text style={{ textAlign: "center", fontSize: 14, color: "#6B7280" }}>
                      {al("signInWithEmailCodeLead")}<Text style={{ fontWeight: "700", color: PRIMARY }}>{al("emailCodeHighlight")}</Text>{al("signInWithEmailCodeTrail")}
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </>
        ) : (
          <Text
            style={{
              textAlign: "center",
              color: "#6B7280",
              fontSize: 14,
              marginBottom: 8,
              lineHeight: 20,
            }}
          >
            {al("providersDisabled")}
          </Text>
        )}

        <Text
          style={{
            fontSize: 12,
            color: "#6B7280",
            textAlign: "center",
            lineHeight: 18,
            marginTop: 20,
            marginBottom: hasSocialAuth ? 8 : 20,
          }}
        >
          {al("legalPrefix")}
          <Text
            style={{ fontWeight: "600", color: "#111827", textDecorationLine: "underline" }}
            onPress={() => Linking.openURL(webPartnerEulaUrl()).catch(() => {})}
          >
            {al("partnerEula")}
          </Text>
          {al("legalAnd")}
          <Text
            style={{ fontWeight: "600", color: "#111827", textDecorationLine: "underline" }}
            onPress={() => Linking.openURL(webPrivacyPolicyUrl()).catch(() => {})}
          >
            {al("privacyPolicy")}
          </Text>
          {al("legalPeriod")}
        </Text>

        {hasSocialAuth && (
          <>
            {/* OAuth separator */}
            <View style={{ flexDirection: "row", alignItems: "center", marginVertical: 24 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: "#E5E7EB" }} />
              <Text style={{ marginHorizontal: 16, fontSize: 13, color: "#9CA3AF" }}>{al("orDivider")}</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: "#E5E7EB" }} />
            </View>

            {/* OAuth buttons */}
            {socialAuth.google && (
              <TouchableOpacity
                onPress={() => void handleSocialOAuth("google")}
                disabled={loading}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1.5,
                  borderColor: "#E5E7EB",
                  borderRadius: 12,
                  paddingVertical: 14,
                  marginBottom: 12,
                  backgroundColor: "#fff",
                }}
                accessibilityRole="button"
                accessibilityLabel={t("auth.continueWithGoogle")}
              >
                <Ionicons name="logo-google" size={20} color="#4285F4" style={{ marginEnd: 10 }} />
                <Text style={{ fontSize: 15, color: "#111827", fontWeight: "500" }}>{t("auth.continueWithGoogle")}</Text>
              </TouchableOpacity>
            )}

            {socialAuth.apple && Platform.OS === "ios" ? (
              <AppleAuthButton
                onPress={() => void handleSocialOAuth("apple")}
                disabled={loading}
              />
            ) : socialAuth.apple ? (
              <TouchableOpacity
                onPress={() => void handleSocialOAuth("apple")}
                disabled={loading}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1.5,
                  borderColor: "#E5E7EB",
                  borderRadius: 12,
                  paddingVertical: 14,
                  marginBottom: 12,
                  backgroundColor: "#fff",
                }}
                accessibilityRole="button"
                accessibilityLabel={t("auth.continueWithApple")}
              >
                <Ionicons name="logo-apple" size={20} color="#000" style={{ marginEnd: 10 }} />
                <Text style={{ fontSize: 15, color: "#111827", fontWeight: "500" }}>{t("auth.continueWithApple")}</Text>
              </TouchableOpacity>
            ) : null}
          </>
        )}

        {showPhoneLoginBlock && !otpSent ? (
          <View style={{ marginTop: 20 }}>
            <TouchableOpacity onPress={goToSignup} accessibilityRole="link" accessibilityLabel={t("auth.signup")}>
              <Text style={{ textAlign: "center", fontSize: 14, color: "#6B7280" }}>
                {t("auth.dontHaveAccount")}{" "}
                <Text style={{ fontWeight: "700", color: PRIMARY }}>{t("auth.signup")}</Text>
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}
        </View>
      </ScrollView>

      {/* Country code picker modal */}
      <Modal
        visible={showCountryPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCountryPicker(false)}
      >
        <Pressable
          style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" }}
          onPress={() => setShowCountryPicker(false)}
          accessibilityLabel={al("closeCountryPickerA11y")}
          accessibilityRole="button"
        >
          <Pressable
            style={{ backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "70%" }}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={{ alignItems: "center", paddingTop: 12, paddingBottom: 4 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: "#D1D5DB" }} />
            </View>
            <View style={{ paddingHorizontal: screenPadding, paddingVertical: 12, borderBottomWidth: 1, borderColor: "#F3F4F6" }}>
              <Text style={{ textAlign: "center", fontWeight: "700", fontSize: 17, color: "#111827", marginBottom: 12 }}>
                {al("selectCountryTitle")}
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: "#F3F4F6",
                  borderRadius: 10,
                  paddingHorizontal: 12,
                }}
              >
                <Ionicons name="search" size={16} color="#9CA3AF" />
                <TextInput
                  style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 8, fontSize: 15, color: "#111827" }}
                  placeholder={al("searchCountryPlaceholder")}
                  placeholderTextColor="#9CA3AF"
                  value={countrySearch}
                  onChangeText={setCountrySearch}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>
            <FlatList
              {...verticalFlatListPerf}
              data={filteredCountries}
              keyExtractor={(c: { code: string }) => c.code}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item: c }: { item: { code: string; flag: string; label: string; phoneLen?: number } }) => (
                <TouchableOpacity
                  onPress={() => {
                    setCountryCode(c.code);
                    setShowCountryPicker(false);
                    setPhoneError(phone.trim() ? validateNationalPhoneDigits(phone, c.code) : null);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 14,
                    paddingHorizontal: screenPadding,
                    borderBottomWidth: 1,
                    borderColor: "#F9FAFB",
                  }}
                  accessibilityLabel={c.label}
                  accessibilityRole="button"
                >
                  <Text style={{ fontSize: 20, marginEnd: 12 }}>{c.flag}</Text>
                  <Text
                    style={{
                      flex: 1,
                      fontSize: 15,
                      color: countryCode === c.code ? PRIMARY : "#111827",
                      fontWeight: countryCode === c.code ? "700" : "400",
                    }}
                  >
                    {c.label}
                  </Text>
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
