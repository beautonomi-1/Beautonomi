import { useState, useRef, useCallback, useEffect } from "react";
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator, ScrollView, Platform, Linking, Modal, Pressable, FlatList } from "react-native";
import { AppKeyboardAvoidingView as KeyboardAvoidingView } from "@/components/AppKeyboardAvoidingView";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { useResponsive } from "@/hooks/useResponsive";
import { Colors } from "@/constants/colors";
import { RADIUS_INPUT, RADIUS_BUTTON } from "@/constants/layout";
import { webCookiePolicyUrl, webCustomerEulaUrl, webPrivacyPolicyUrl } from "@/lib/legal-web";
import { haptic } from "@/lib/haptics";
import { api } from "@/lib/api-client";
import { navigateAfterNewCustomerSignup } from "@/lib/customer-auth-routing";
import { trackSignUp } from "@/lib/analytics";
import { useTranslation, supportedLanguages, SIGNUP_SOURCE_OPTIONS } from "@beautonomi/i18n";
import { changeLanguage } from "@/lib/i18n";
import * as Localization from "expo-localization";
import { getDeviceDefaultCountryDial } from "@/lib/device-default-country-dial";
import { verticalFlatListPerf } from "@/lib/flatListPerformance";
import { getSocialAuthConfig } from "@/lib/third-party-config";
import { OtpDigitRow } from "@/components/OtpDigitRow";
import { AppleAuthButton } from "@/components/auth/AppleAuthButton";
import {
  isCompleteSupabaseSmsOtp,
  normalizeSupabaseSmsOtpToken,
  SUPABASE_AUTH_OTP_LENGTH,
  SUPABASE_EMAIL_OTP_RESEND_COOLDOWN_SECONDS,
} from "@/lib/supabase-sms-otp";

const REFERRAL_REF_KEY = "referral_ref";

function resolveSignupReferralCode(fromLink: string | null, manual: string): string | null {
  const linked = fromLink?.trim();
  if (linked) return linked;
  const typed = manual.trim();
  return typed || null;
}
const PENDING_SIGNUP_SOURCE_KEY = "beautonomi_pending_signup_source";
const PENDING_PREFERRED_LANGUAGE_KEY = "beautonomi_pending_preferred_language";

function getDefaultLanguage(): string {
  const deviceCode = Localization.getLocales()[0]?.languageCode?.split("-")[0] || "en";
  return supportedLanguages.some((l) => l.code === deviceCode) ? deviceCode : "en";
}

const PRIMARY = Colors.primary;

const COUNTRY_CODES = [
  { code: "+27", flag: "🇿🇦", label: "South Africa (+27)", phoneLen: 9 },
  { code: "+254", flag: "🇰🇪", label: "Kenya (+254)", phoneLen: 9 },
  { code: "+233", flag: "🇬🇭", label: "Ghana (+233)", phoneLen: 9 },
  { code: "+234", flag: "🇳🇬", label: "Nigeria (+234)", phoneLen: 10 },
  { code: "+20", flag: "🇪🇬", label: "Egypt (+20)", phoneLen: 10 },
  { code: "+255", flag: "🇹🇿", label: "Tanzania (+255)", phoneLen: 9 },
  { code: "+256", flag: "🇺🇬", label: "Uganda (+256)", phoneLen: 9 },
  { code: "+260", flag: "🇿🇲", label: "Zambia (+260)", phoneLen: 9 },
  { code: "+263", flag: "🇿🇼", label: "Zimbabwe (+263)", phoneLen: 9 },
  { code: "+267", flag: "🇧🇼", label: "Botswana (+267)", phoneLen: 7 },
  { code: "+258", flag: "🇲🇿", label: "Mozambique (+258)", phoneLen: 9 },
  { code: "+264", flag: "🇳🇦", label: "Namibia (+264)", phoneLen: 8 },
  { code: "+212", flag: "🇲🇦", label: "Morocco (+212)", phoneLen: 9 },
  { code: "+216", flag: "🇹🇳", label: "Tunisia (+216)", phoneLen: 8 },
  { code: "+1", flag: "🇺🇸", label: "USA (+1)", phoneLen: 10 },
  { code: "+44", flag: "🇬🇧", label: "UK (+44)", phoneLen: 10 },
  { code: "+91", flag: "🇮🇳", label: "India (+91)", phoneLen: 10 },
  { code: "+971", flag: "🇦🇪", label: "UAE (+971)", phoneLen: 9 },
  { code: "+966", flag: "🇸🇦", label: "Saudi Arabia (+966)", phoneLen: 9 },
  { code: "+61", flag: "🇦🇺", label: "Australia (+61)", phoneLen: 9 },
  { code: "+49", flag: "🇩🇪", label: "Germany (+49)", phoneLen: 11 },
  { code: "+33", flag: "🇫🇷", label: "France (+33)", phoneLen: 9 },
  { code: "+351", flag: "🇵🇹", label: "Portugal (+351)", phoneLen: 9 },
  { code: "+55", flag: "🇧🇷", label: "Brazil (+55)", phoneLen: 11 },
];

function getPasswordStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;

  if (score <= 1) return { score, label: "Weak", color: "#EF4444" };
  if (score <= 2) return { score, label: "Fair", color: "#F59E0B" };
  if (score <= 3) return { score, label: "Good", color: "#3B82F6" };
  return { score, label: "Strong", color: "#22C55E" };
}

function stripLeadingZero(digits: string): string {
  return digits.replace(/^0+/, "");
}

function validatePhone(digits: string, countryCode: string): string | null {
  const raw = digits.replace(/\D/g, "");
  if (!raw) return null;
  const clean = stripLeadingZero(raw);
  const country = COUNTRY_CODES.find((c) => c.code === countryCode);
  const expectedLen = country?.phoneLen ?? 9;
  if (clean.length < expectedLen - 1 || clean.length > expectedLen) {
    return `Phone should be ${expectedLen} digits for ${country?.flag ?? ""} ${countryCode} (leading 0 is optional)`;
  }
  return null;
}

function parseRefFromUrl(url: string): string | null {
  try {
    const q = url.includes("?") ? url.slice(url.indexOf("?") + 1) : "";
    const ref = new URLSearchParams(q).get("ref");
    return ref?.trim() || null;
  } catch {
    return null;
  }
}

export default function SignupScreen() {
  useScreenTracking("Signup");
  const { t } = useTranslation();
  const as = useCallback((key: string) => t(`customer.mobile.screens.authSignup.${key}`), [t]);
  const { signUpWithEmail, signInWithOAuth, verifySignupEmailOtp, resendSignupConfirmationEmail } = useAuth();
  const params = useLocalSearchParams<{
    ref?: string;
    return_to?: string;
    /** §Release-audit 2026-04: optional prefill passed from the login
     *  screen when a user attempts OTP login with an unknown email/phone. */
    email?: string;
    phone?: string;
  }>();

  // §Release-audit 2026-04: if login redirected here because the phone had
  // no account, try to split the E.164 into country dial code + local
  // digits. Falls back to device default if we can't match a known dial.
  const prefillPhoneFromE164 = (value: string | undefined) => {
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
  };
  const initialPhonePrefill = prefillPhoneFromE164(
    typeof params.phone === "string" ? params.phone : undefined,
  );

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState(
    typeof params.email === "string" ? params.email.trim() : "",
  );
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState(initialPhonePrefill.digits);
  const [countryCode, setCountryCode] = useState(
    initialPhonePrefill.cc ?? getDeviceDefaultCountryDial(),
  );
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const [socialAuth, setSocialAuth] = useState<{ google: boolean; apple: boolean }>({
    google: true,
    apple: true,
  });
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [referralCode, setReferralCode] = useState<string | null>(params.ref?.trim() ?? null);
  const [manualReferralCode, setManualReferralCode] = useState("");
  const [showReferralInput, setShowReferralInput] = useState(Boolean(params.ref?.trim()));
  const [preferredLanguage, setPreferredLanguage] = useState(getDefaultLanguage);
  const [signupSource, setSignupSource] = useState<string | null>(null);
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [showSignupSourcePicker, setShowSignupSourcePicker] = useState(false);
  /** When true, replace the form with the email confirmation OTP step (after successful signup). */
  const [awaitingSignupVerification, setAwaitingSignupVerification] = useState(false);
  const [signupOtpCode, setSignupOtpCode] = useState("");
  const [verifyingSignupOtp, setVerifyingSignupOtp] = useState(false);
  const [resendingSignupOtp, setResendingSignupOtp] = useState(false);
  const [signupOtpResendCooldown, setSignupOtpResendCooldown] = useState(0);
  const [signupOtpError, setSignupOtpError] = useState<string | null>(null);
  /** Captured at signup time so verification step can persist them after the session lands. */
  const pendingProfileRef = useRef<{
    fullPhone: string;
    signupSource: string | null;
    preferredLanguage: string;
    referralCode: string | null;
  } | null>(null);

  useEffect(() => {
    if (signupOtpResendCooldown <= 0) return;
    const id = setInterval(() => setSignupOtpResendCooldown((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [signupOtpResendCooldown]);

  // Capture ref from route params, the cold-start URL, AND warm deep-link
  // events (user tapping a referral link while the app is in the foreground).
  // §Final-audit 2026-04: previously only cold-start URLs were captured —
  // any warm link delivered via `Linking.addEventListener("url", …)` was
  // dropped and the referrer lost their credit.
  useEffect(() => {
    let cancelled = false;
    const captureRef = (candidate: string | null | undefined) => {
      const trimmed = candidate?.trim();
      if (!trimmed) return false;
      if (cancelled) return false;
      setReferralCode(trimmed);
      AsyncStorage.setItem(REFERRAL_REF_KEY, trimmed).catch(() => {});
      return true;
    };

    if (captureRef(params.ref)) return;

    Linking.getInitialURL().then((url) => {
      if (!url || cancelled) return;
      captureRef(parseRefFromUrl(url));
    });

    const sub = Linking.addEventListener("url", (ev) => {
      if (!ev?.url || cancelled) return;
      captureRef(parseRefFromUrl(ev.url));
    });

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [params.ref]);

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);

  const selectedCountry = COUNTRY_CODES.find((c) => c.code === countryCode);
  const filteredCountries = countrySearch
    ? COUNTRY_CODES.filter((c) => c.label.toLowerCase().includes(countrySearch.toLowerCase()))
    : COUNTRY_CODES;
  const hasSocialAuth = socialAuth.google || socialAuth.apple;

  useEffect(() => {
    getSocialAuthConfig().then(setSocialAuth).catch(() => {
      setSocialAuth({ google: true, apple: true });
    });
  }, []);
  const strength = getPasswordStrength(password);

  const handlePhoneChange = useCallback(
    (text: string) => {
      const digits = text.replace(/[^\d\s]/g, "");
      setPhone(digits);
      if (digits.replace(/\s/g, "").length > 0) {
        setPhoneError(validatePhone(digits, countryCode));
      } else {
        setPhoneError(null);
      }
    },
    [countryCode],
  );

  function validate(): boolean {
    const newErrors: Record<string, string> = {};
    if (!fullName.trim()) newErrors.fullName = "Full name is required";
    if (!email.trim()) newErrors.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) newErrors.email = "Invalid email address";
    if (!password) newErrors.password = "Password is required";
    else if (password.length < 8) newErrors.password = "Password must be at least 8 characters";
    if (password !== confirmPassword) newErrors.confirmPassword = "Passwords don't match";
    if (!agreedToTerms) {
      newErrors.terms =
        "Confirm you agree to the End User License Agreement, Privacy Policy, and Cookie Policy (including product analytics while signed in).";
    }
    if (phone.trim()) {
      const pErr = validatePhone(phone, countryCode);
      if (pErr) newErrors.phone = pErr;
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function finalizeSignedUpProfile() {
    const pending = pendingProfileRef.current;
    if (!pending) return;
    const profilePayload: { phone?: string; signup_source?: string; preferred_language?: string } = {};
    if (pending.fullPhone) profilePayload.phone = pending.fullPhone;
    if (pending.signupSource) profilePayload.signup_source = pending.signupSource;
    profilePayload.preferred_language = pending.preferredLanguage;
    try {
      await api.patch("/api/me/profile", profilePayload);
    } catch {
      if (pending.signupSource) {
        await AsyncStorage.setItem(PENDING_SIGNUP_SOURCE_KEY, pending.signupSource).catch(() => {});
      }
      await AsyncStorage.setItem(PENDING_PREFERRED_LANGUAGE_KEY, pending.preferredLanguage).catch(() => {});
    }
    try {
      await changeLanguage(pending.preferredLanguage);
    } catch {
      // Non-blocking
    }
    const ref = pending.referralCode?.trim() || (await AsyncStorage.getItem(REFERRAL_REF_KEY));
    if (ref?.trim()) {
      try {
        await api.post("/api/me/referrals/attach", { referral_code: ref.trim() });
      } catch {
        // Non-blocking
      }
      await AsyncStorage.removeItem(REFERRAL_REF_KEY);
    }
    pendingProfileRef.current = null;
  }

  async function handleSignup() {
    if (!validate()) return;
    haptic.medium();
    setLoading(true);
    try {
      const result = await signUpWithEmail(email.trim(), password.trim(), fullName.trim());
      if (result.error) {
        const msg = result.error.message ?? "";
        const lower = msg.toLowerCase();
        if (
          lower.includes("already registered") ||
          lower.includes("user already") ||
          lower.includes("already exists")
        ) {
          try {
            await api.post("/api/auth/claim/start", { email: email.trim() });
            Alert.alert(
              as("signUpFailedTitle"),
              "We found bookings under this email. Check your inbox to claim your account.",
            );
          } catch {
            Alert.alert(as("signUpFailedTitle"), msg);
          }
        } else {
          Alert.alert(as("signUpFailedTitle"), msg);
        }
        return;
      }

      const fullPhone =
        phone.trim() ? `${countryCode}${stripLeadingZero(phone.replace(/\D/g, ""))}`.trim() : "";
      pendingProfileRef.current = {
        fullPhone,
        signupSource,
        preferredLanguage,
        referralCode: resolveSignupReferralCode(referralCode, manualReferralCode),
      };

      if (result.requiresConfirmation) {
        haptic.success();
        trackSignUp("email");
        if (signupSource) AsyncStorage.setItem(PENDING_SIGNUP_SOURCE_KEY, signupSource).catch(() => {});
        AsyncStorage.setItem(PENDING_PREFERRED_LANGUAGE_KEY, preferredLanguage).catch(() => {});
        setSignupOtpCode("");
        setSignupOtpError(null);
        setSignupOtpResendCooldown(SUPABASE_EMAIL_OTP_RESEND_COOLDOWN_SECONDS);
        setAwaitingSignupVerification(true);
        return;
      }
      // Session is available immediately (Supabase email confirmation off):
      // persist phone, signup source, language, and attach referral.
      trackSignUp("email");
      await finalizeSignedUpProfile();
      haptic.success();
      await navigateAfterNewCustomerSignup(params.return_to);
    } catch (e) {
      Alert.alert(t("customer.mobile.screens.authLogin.errorTitle"), e instanceof Error ? e.message : as("genericError"));
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifySignupOtp(codeOverride?: string) {
    const token = normalizeSupabaseSmsOtpToken(codeOverride ?? signupOtpCode);
    if (!isCompleteSupabaseSmsOtp(token)) return;
    setVerifyingSignupOtp(true);
    setSignupOtpError(null);
    try {
      const { error } = await verifySignupEmailOtp(email.trim(), token);
      if (error) {
        setSignupOtpError(error.message);
        haptic.warning();
        return;
      }
      haptic.success();
      try {
        await finalizeSignedUpProfile();
      } catch {
        // Non-blocking
      }
      await navigateAfterNewCustomerSignup(params.return_to);
    } catch (e) {
      setSignupOtpError(e instanceof Error ? e.message : as("genericError"));
    } finally {
      setVerifyingSignupOtp(false);
    }
  }

  async function handleResendSignupOtp() {
    if (signupOtpResendCooldown > 0 || resendingSignupOtp) return;
    setResendingSignupOtp(true);
    setSignupOtpError(null);
    try {
      const { error } = await resendSignupConfirmationEmail(email.trim());
      if (error) {
        setSignupOtpError(error.message);
        return;
      }
      setSignupOtpCode("");
      setSignupOtpResendCooldown(SUPABASE_EMAIL_OTP_RESEND_COOLDOWN_SECONDS);
    } catch (e) {
      setSignupOtpError(e instanceof Error ? e.message : as("genericError"));
    } finally {
      setResendingSignupOtp(false);
    }
  }

  async function handleSocialOAuth(provider: "google" | "apple") {
    if (!agreedToTerms) {
      setErrors((p) => ({
        ...p,
        terms:
          "Confirm you agree to the Terms of Service, Privacy Policy, and Cookie Policy (including product analytics while signed in).",
      }));
      return;
    }
    haptic.light();
    setLoading(true);
    try {
      const { error } = await signInWithOAuth(provider);
      if (error) {
        if (!error.message.toLowerCase().includes("cancel")) {
          Alert.alert(as("signUpFailedTitle"), error.message);
        }
      } else {
        trackSignUp(provider);
        const fullPhone =
          phone.trim() ? `${countryCode}${stripLeadingZero(phone.replace(/\D/g, ""))}`.trim() : "";
        const profilePayload: { phone?: string; signup_source?: string; preferred_language: string } = {
          preferred_language: preferredLanguage,
        };
        if (fullPhone) profilePayload.phone = fullPhone;
        if (signupSource) profilePayload.signup_source = signupSource;
        try {
          await api.patch("/api/me/profile", profilePayload);
        } catch {
          if (signupSource) {
            await AsyncStorage.setItem(PENDING_SIGNUP_SOURCE_KEY, signupSource).catch(() => {});
          }
          await AsyncStorage.setItem(PENDING_PREFERRED_LANGUAGE_KEY, preferredLanguage).catch(() => {});
        }
        await changeLanguage(preferredLanguage);
        const refToAttach =
          resolveSignupReferralCode(referralCode, manualReferralCode) ??
          (await AsyncStorage.getItem(REFERRAL_REF_KEY));
        if (refToAttach?.trim()) {
          try {
            await api.post("/api/me/referrals/attach", { referral_code: refToAttach.trim() });
          } catch {
            // Non-blocking
          }
          await AsyncStorage.removeItem(REFERRAL_REF_KEY);
        }
        await navigateAfterNewCustomerSignup(params.return_to);
      }
    } catch {
      Alert.alert(as("signUpFailedTitle"), as("oauthGenericError"));
    } finally {
      setLoading(false);
    }
  }

  const { contentPadding, contentMaxWidth, isTablet } = useResponsive();
  const formNarrow = isTablet || Platform.OS === "web";
  const formStyle = {
    width: "100%" as const,
    ...(formNarrow ? { maxWidth: Math.min(420, contentMaxWidth), alignSelf: "center" as const } : {}),
  };
  const scrollContentStyle = {
    padding: contentPadding,
    paddingBottom: 48,
    ...(formNarrow ? { alignItems: "center" as const } : {}),
  };

  if (awaitingSignupVerification) {
    return (
      <SafeAreaView edges={["top", "left", "right"]} style={{ flex: 1, backgroundColor: Colors.gray[50] }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior="padding"
        >
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={scrollContentStyle}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={formStyle}>
              <TouchableOpacity
                onPress={() => {
                  setAwaitingSignupVerification(false);
                  setSignupOtpCode("");
                  setSignupOtpError(null);
                }}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: Colors.white,
                  borderWidth: 1,
                  borderColor: Colors.gray[200],
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 20,
                }}
                accessibilityRole="button"
                accessibilityLabel="Go back to edit signup details"
              >
                <Ionicons name="arrow-back" size={20} color="#111827" />
              </TouchableOpacity>

              <View
                style={{
                  borderWidth: 1,
                  borderColor: "#A7F3D0",
                  backgroundColor: "#ECFDF5",
                  borderRadius: 16,
                  padding: 20,
                  marginBottom: 16,
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
                  Verify your email
                </Text>
                <Text style={{ textAlign: "center", fontSize: 13, color: "#4B5563", marginBottom: 6 }}>
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
                    if (!verifyingSignupOtp && isCompleteSupabaseSmsOtp(code)) {
                      void handleVerifySignupOtp(code);
                    }
                  }}
                  disabled={verifyingSignupOtp}
                  autoFocus
                  accessibilityLabelPrefix="Signup verification code"
                />

                {signupOtpError ? (
                  <Text style={{ marginTop: 12, textAlign: "center", fontSize: 12, color: "#EF4444" }}>
                    {signupOtpError}
                  </Text>
                ) : null}

                <TouchableOpacity
                  onPress={() => void handleVerifySignupOtp()}
                  disabled={verifyingSignupOtp || !isCompleteSupabaseSmsOtp(signupOtpCode)}
                  style={{
                    marginTop: 16,
                    backgroundColor: PRIMARY,
                    borderRadius: RADIUS_BUTTON,
                    paddingVertical: 14,
                    alignItems: "center",
                    opacity: verifyingSignupOtp || !isCompleteSupabaseSmsOtp(signupOtpCode) ? 0.6 : 1,
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Verify and continue"
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
                  style={{
                    marginTop: 10,
                    backgroundColor: "#fff",
                    borderRadius: RADIUS_BUTTON,
                    borderWidth: 1,
                    borderColor: "#A7F3D0",
                    paddingVertical: 12,
                    alignItems: "center",
                    opacity: resendingSignupOtp || signupOtpResendCooldown > 0 ? 0.6 : 1,
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Resend verification code"
                >
                  {resendingSignupOtp ? (
                    <ActivityIndicator color={PRIMARY} />
                  ) : signupOtpResendCooldown > 0 ? (
                    <Text style={{ color: "#374151", fontSize: 14, fontWeight: "600" }}>
                      Resend code in {signupOtpResendCooldown}s
                    </Text>
                  ) : (
                    <Text style={{ color: "#374151", fontSize: 14, fontWeight: "600" }}>
                      Resend verification code
                    </Text>
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
                  accessibilityLabel="Go back to edit signup details"
                >
                  <Text style={{ color: "#6B7280", fontSize: 13 }}>Wrong email? Go back and edit</Text>
                </TouchableOpacity>
              </View>

              <Text style={{ fontSize: 11, color: "#9CA3AF", textAlign: "center" }}>
                No code in your inbox? The Supabase &quot;Confirm signup&quot; template must include {"{{ .Token }}"}.
                You can also tap the confirmation link in the email — both work.
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={{ flex: 1, backgroundColor: Colors.gray[50] }}
    >
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.gray[50] }}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={scrollContentStyle}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={formStyle}>
        {/* Back button */}
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: Colors.white,
            borderWidth: 1,
            borderColor: Colors.gray[200],
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 20,
          }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={20} color="#111827" />
        </TouchableOpacity>

        {/* Header */}
        <Text style={{ fontSize: 26, fontWeight: "800", color: Colors.gray[900], marginBottom: 6 }}>
          Create Your Account
        </Text>
        <Text style={{ fontSize: 15, color: Colors.gray[600], marginBottom: 16 }}>
          Join Beautonomi and discover the best beauty services near you
        </Text>

        {(showReferralInput || manualReferralCode || referralCode) ? (
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: Colors.gray[700], marginBottom: 6 }}>
              Referral code <Text style={{ fontWeight: "400", color: Colors.gray[500] }}>(optional)</Text>
            </Text>
            <TextInput
              value={manualReferralCode || referralCode || ""}
              onChangeText={(text) => {
                const next = text.toUpperCase().replace(/\s/g, "");
                setManualReferralCode(next);
                if (next) AsyncStorage.setItem(REFERRAL_REF_KEY, next).catch(() => {});
              }}
              placeholder="Enter a friend's code"
              autoCapitalize="characters"
              autoCorrect={false}
              style={{
                borderWidth: 1,
                borderColor: Colors.gray[200],
                borderRadius: RADIUS_INPUT,
                paddingHorizontal: 14,
                paddingVertical: 12,
                fontSize: 15,
                backgroundColor: Colors.white,
              }}
            />
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => setShowReferralInput(true)}
            style={{ marginBottom: 16 }}
            accessibilityRole="button"
          >
            <Text style={{ fontSize: 14, fontWeight: "600", color: PRIMARY }}>Have a referral code?</Text>
          </TouchableOpacity>
        )}

        {/* Terms — above social + email so OAuth is never ahead of consent */}
        {hasSocialAuth && !agreedToTerms ? (
          <Text style={{ fontSize: 12, color: "#6B7280", marginBottom: 10 }} accessibilityLiveRegion="polite">
            Tick the box below to continue with Google, Apple, or email sign up.
          </Text>
        ) : null}
        <TouchableOpacity
          onPress={() => { setAgreedToTerms(!agreedToTerms); setErrors((p) => ({ ...p, terms: "" })); }}
          style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 16 }}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: agreedToTerms }}
        >
          <View
            style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              borderWidth: 2,
              borderColor: agreedToTerms ? PRIMARY : errors.terms ? "#EF4444" : "#9CA3AF",
              backgroundColor: agreedToTerms ? PRIMARY : "#fff",
              alignItems: "center",
              justifyContent: "center",
              marginTop: 1,
            }}
          >
            {agreedToTerms && <Ionicons name="checkmark" size={14} color="#fff" />}
          </View>
          <Text style={{ marginLeft: 10, flex: 1, fontSize: 13, color: "#6B7280", lineHeight: 20 }}>
            I have read and agree to the{" "}
            <Text
              style={{ fontWeight: "600", color: "#111827", textDecorationLine: "underline" }}
              onPress={() => Linking.openURL(webCustomerEulaUrl()).catch(() => {})}
            >
              End User License Agreement
            </Text>{" "}
            and{" "}
            <Text
              style={{ fontWeight: "600", color: "#111827", textDecorationLine: "underline" }}
              onPress={() => Linking.openURL(webPrivacyPolicyUrl()).catch(() => {})}
            >
              Privacy Policy
            </Text>
            , and{" "}
            <Text
              style={{ fontWeight: "600", color: "#111827", textDecorationLine: "underline" }}
              onPress={() => Linking.openURL(webCookiePolicyUrl()).catch(() => {})}
            >
              Cookie Policy
            </Text>
            . I understand Beautonomi may use cookies and similar technologies, process data as described in the Privacy Policy and Cookie Policy, and (while signed in) use product analytics. I can update analytics preferences in my account privacy settings.
          </Text>
        </TouchableOpacity>
        {errors.terms ? <Text style={{ fontSize: 12, color: "#EF4444", marginTop: -8, marginBottom: 12 }}>{errors.terms}</Text> : null}

        {hasSocialAuth && (
          <>
            {/* Social signup */}
            {socialAuth.google && (
              <TouchableOpacity
                onPress={() => void handleSocialOAuth("google")}
                disabled={loading || !agreedToTerms}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: Colors.gray[200],
                  borderRadius: RADIUS_INPUT,
                  paddingVertical: 14,
                  marginBottom: 12,
                  backgroundColor: Colors.white,
                }}
                accessibilityRole="button"
                accessibilityLabel="Continue with Google"
              >
                <Ionicons name="logo-google" size={20} color="#4285F4" style={{ marginRight: 10 }} />
                <Text style={{ fontSize: 15, color: "#111827", fontWeight: "500" }}>Continue with Google</Text>
              </TouchableOpacity>
            )}

            {socialAuth.apple && Platform.OS === "ios" ? (
              <AppleAuthButton
                onPress={() => void handleSocialOAuth("apple")}
                disabled={loading || !agreedToTerms}
              />
            ) : socialAuth.apple ? (
              <TouchableOpacity
                onPress={() => void handleSocialOAuth("apple")}
                disabled={loading || !agreedToTerms}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: Colors.gray[200],
                  borderRadius: RADIUS_INPUT,
                  paddingVertical: 14,
                  marginBottom: 12,
                  backgroundColor: Colors.white,
                }}
                accessibilityRole="button"
                accessibilityLabel="Continue with Apple"
              >
                <Ionicons name="logo-apple" size={20} color="#000" style={{ marginRight: 10 }} />
                <Text style={{ fontSize: 15, color: "#111827", fontWeight: "500" }}>Continue with Apple</Text>
              </TouchableOpacity>
            ) : null}

            {/* Divider */}
            <View style={{ flexDirection: "row", alignItems: "center", marginVertical: 20 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: "#E5E7EB" }} />
              <Text style={{ marginHorizontal: contentPadding, fontSize: 13, color: "#9CA3AF" }}>or sign up with email</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: "#E5E7EB" }} />
            </View>
          </>
        )}

        {/* Preferred language (early) */}
        <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 }}>
          {t("auth.preferredLanguage")}
        </Text>
        <TouchableOpacity
          onPress={() => setShowLanguagePicker(true)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            borderWidth: 1,
            borderColor: Colors.gray[200],
            borderRadius: RADIUS_INPUT,
            backgroundColor: "#FAFAFA",
            paddingHorizontal: 14,
            paddingVertical: 14,
            marginBottom: 16,
          }}
          accessibilityRole="button"
          accessibilityLabel={t("auth.preferredLanguage")}
        >
          <Text style={{ fontSize: 15, color: "#111827" }}>
            {supportedLanguages.find((l) => l.code === preferredLanguage)?.nativeName ?? supportedLanguages[0].nativeName}
          </Text>
          <Ionicons name="chevron-down" size={18} color="#6B7280" />
        </TouchableOpacity>

        {/* Full Name */}
        <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 }}>
          Full Name
        </Text>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            borderWidth: 1,
            borderColor: errors.fullName ? Colors.error : Colors.gray[200],
            borderRadius: RADIUS_INPUT,
            backgroundColor: "#FAFAFA",
            paddingHorizontal: 14,
            marginBottom: errors.fullName ? 4 : 16,
          }}
        >
          <Ionicons name="person-outline" size={18} color="#9CA3AF" />
          <TextInput
            style={{ flex: 1, paddingVertical: 14, paddingHorizontal: 10, fontSize: 15, color: "#111827" }}
            placeholder={as("namePlaceholder")}
            placeholderTextColor="#9CA3AF"
            value={fullName}
            onChangeText={(v) => { setFullName(v); setErrors((p) => ({ ...p, fullName: "" })); }}
            autoCapitalize="words"
            returnKeyType="next"
            onSubmitEditing={() => emailRef.current?.focus()}
            accessibilityLabel="Full name"
          />
        </View>
        {errors.fullName ? <Text style={{ fontSize: 12, color: "#EF4444", marginBottom: 12 }}>{errors.fullName}</Text> : null}

        {/* Email */}
        <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 }}>
          Email
        </Text>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            borderWidth: 1,
            borderColor: errors.email ? Colors.error : Colors.gray[200],
            borderRadius: RADIUS_INPUT,
            backgroundColor: "#FAFAFA",
            paddingHorizontal: 14,
            marginBottom: errors.email ? 4 : 16,
          }}
        >
          <Ionicons name="mail-outline" size={18} color="#9CA3AF" />
          <TextInput
            ref={emailRef}
            style={{ flex: 1, paddingVertical: 14, paddingHorizontal: 10, fontSize: 15, color: "#111827" }}
            placeholder={as("emailPlaceholder")}
            placeholderTextColor="#9CA3AF"
            value={email}
            onChangeText={(v) => { setEmail(v); setErrors((p) => ({ ...p, email: "" })); }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            importantForAutofill="yes"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            accessibilityLabel="Email address"
          />
        </View>
        {errors.email ? <Text style={{ fontSize: 12, color: "#EF4444", marginBottom: 12 }}>{errors.email}</Text> : null}

        {/* Password */}
        <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 }}>
          Password
        </Text>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            borderWidth: 1,
            borderColor: errors.password ? Colors.error : Colors.gray[200],
            borderRadius: RADIUS_INPUT,
            backgroundColor: "#FAFAFA",
            paddingHorizontal: 14,
            marginBottom: 4,
          }}
        >
          <Ionicons name="lock-closed-outline" size={18} color="#9CA3AF" />
          <TextInput
            ref={passwordRef}
            style={{ flex: 1, paddingVertical: 14, paddingHorizontal: 10, fontSize: 15, color: "#111827" }}
            placeholder={as("passwordPlaceholder")}
            placeholderTextColor="#9CA3AF"
            value={password}
            onChangeText={(v) => { setPassword(v); setErrors((p) => ({ ...p, password: "" })); }}
            secureTextEntry={!showPassword}
            autoComplete="new-password"
            textContentType="newPassword"
            passwordRules="minlength: 8;"
            returnKeyType="next"
            onSubmitEditing={() => confirmRef.current?.focus()}
            accessibilityLabel="Password"
          />
          <TouchableOpacity
            onPress={() => setShowPassword((v) => !v)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#6B7280" />
          </TouchableOpacity>
        </View>
        {errors.password ? <Text style={{ fontSize: 12, color: "#EF4444", marginBottom: 4 }}>{errors.password}</Text> : null}

        {/* Password strength */}
        {password.length > 0 && (
          <View style={{ marginBottom: 12, marginTop: 4 }}>
            <View style={{ flexDirection: "row", marginBottom: 4 }}>
              {[1, 2, 3, 4].map((i) => (
                <View
                  key={i}
                  style={{
                    flex: 1,
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: strength.score >= i ? strength.color : "#E5E7EB",
                    marginRight: i < 4 ? 4 : 0,
                  }}
                />
              ))}
            </View>
            <Text style={{ fontSize: 12, color: strength.color, fontWeight: "500" }}>
              {strength.label}
              {strength.score < 3 && (
                <Text style={{ color: "#9CA3AF" }}>
                  {" — "}
                  {password.length < 8
                    ? "Need 8+ characters"
                    : !/[A-Z]/.test(password)
                      ? "Add an uppercase letter"
                      : !/[0-9]/.test(password)
                        ? "Add a number"
                        : "Add a special character"}
                </Text>
              )}
            </Text>
          </View>
        )}
        {password.length === 0 && !errors.password && <View style={{ height: 12 }} />}

        {/* Confirm Password */}
        <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 }}>
          Confirm Password
        </Text>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            borderWidth: 1,
            borderColor: errors.confirmPassword ? Colors.error : Colors.gray[200],
            borderRadius: RADIUS_INPUT,
            backgroundColor: "#FAFAFA",
            paddingHorizontal: 14,
            marginBottom: errors.confirmPassword ? 4 : 16,
          }}
        >
          <Ionicons name="lock-closed-outline" size={18} color="#9CA3AF" />
          <TextInput
            ref={confirmRef}
            style={{ flex: 1, paddingVertical: 14, paddingHorizontal: 10, fontSize: 15, color: "#111827" }}
            placeholder={as("repeatPasswordPlaceholder")}
            placeholderTextColor="#9CA3AF"
            value={confirmPassword}
            onChangeText={(v) => { setConfirmPassword(v); setErrors((p) => ({ ...p, confirmPassword: "" })); }}
            secureTextEntry={!showPassword}
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="next"
            onSubmitEditing={() => phoneRef.current?.focus()}
            accessibilityLabel="Confirm password"
          />
        </View>
        {errors.confirmPassword ? <Text style={{ fontSize: 12, color: "#EF4444", marginBottom: 12 }}>{errors.confirmPassword}</Text> : null}

        {/* Phone (optional) */}
        <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 }}>
          Phone Number <Text style={{ fontWeight: "400", color: "#9CA3AF" }}>(optional)</Text>
        </Text>
        <View
          style={{
            flexDirection: "row",
            borderWidth: 1,
            borderColor: phoneError || errors.phone ? Colors.error : Colors.gray[200],
            borderRadius: RADIUS_INPUT,
            overflow: "hidden",
            marginBottom: (phoneError || errors.phone) ? 4 : 16,
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
          >
            <Text style={{ fontSize: 18, marginRight: 4 }}>{selectedCountry?.flag ?? "🌍"}</Text>
            <Text style={{ fontSize: 15, fontWeight: "600", color: "#111827", marginRight: 4 }}>{countryCode}</Text>
            <Ionicons name="chevron-down" size={14} color="#6B7280" />
          </TouchableOpacity>
          <TextInput
            ref={phoneRef}
            style={{
              flex: 1,
              backgroundColor: "#FAFAFA",
              paddingHorizontal: 14,
              paddingVertical: 14,
              fontSize: 15,
              color: "#111827",
            }}
            placeholder={as("nationalPhonePlaceholder")}
            placeholderTextColor="#9CA3AF"
            value={phone}
            onChangeText={handlePhoneChange}
            keyboardType="phone-pad"
            returnKeyType="done"
            accessibilityLabel="Phone number, optional"
            textContentType="telephoneNumber"
            autoComplete="tel-national"
            importantForAutofill="yes"
          />
        </View>
        {(phoneError || errors.phone) ? (
          <Text style={{ fontSize: 12, color: "#EF4444", marginBottom: 12 }}>{phoneError || errors.phone}</Text>
        ) : null}

        {/* How did you hear about us? (optional) */}
        <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 }}>
          {t("auth.howHearAboutUs")} <Text style={{ fontWeight: "400", color: "#9CA3AF" }}>(optional)</Text>
        </Text>
        <TouchableOpacity
          onPress={() => setShowSignupSourcePicker(true)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            borderWidth: 1,
            borderColor: Colors.gray[200],
            borderRadius: RADIUS_INPUT,
            backgroundColor: "#FAFAFA",
            paddingHorizontal: 14,
            paddingVertical: 14,
            marginBottom: 16,
          }}
          accessibilityRole="button"
          accessibilityLabel={t("auth.howHearAboutUs")}
        >
          <Text style={{ fontSize: 15, color: signupSource ? "#111827" : "#9CA3AF" }}>
            {signupSource
              ? t(SIGNUP_SOURCE_OPTIONS.find((o) => o.value === signupSource)?.labelKey ?? "auth.signupSourceOther")
              : t("auth.signupSourceSkip")}
          </Text>
          <Ionicons name="chevron-down" size={18} color="#6B7280" />
        </TouchableOpacity>

        {/* Submit */}
        <TouchableOpacity
          onPress={handleSignup}
          disabled={loading}
          style={{
            backgroundColor: PRIMARY,
            borderRadius: RADIUS_BUTTON,
            paddingVertical: 16,
            alignItems: "center",
            opacity: loading ? 0.7 : 1,
            marginBottom: 16,
          }}
          accessibilityRole="button"
          accessibilityLabel="Create account"
          accessibilityState={{ disabled: loading }}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>Create Account</Text>
          )}
        </TouchableOpacity>

        {/* Login link */}
        <TouchableOpacity
          onPress={() => router.replace("/(auth)/login")}
          style={{ paddingVertical: 8 }}
          accessibilityRole="link"
        >
          <Text style={{ textAlign: "center", fontSize: 14, color: "#6B7280" }}>
            Already have an account?{" "}
            <Text style={{ fontWeight: "700", color: PRIMARY }}>Log in</Text>
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.replace("/(app)/(tabs)/home" as never)}
          style={{ marginTop: 12, paddingVertical: 8 }}
          accessibilityRole="link"
        >
          <Text style={{ textAlign: "center", fontSize: 14, fontWeight: "600", color: "#6B7280" }}>
            Browse without an account
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push("/(auth)/safety-and-age" as never)}
          style={{ marginTop: 4, paddingVertical: 8 }}
          accessibilityRole="link"
          accessibilityLabel={t("customer.mobile.screens.authSafetyAndAge.linkLabel")}
        >
          <Text style={{ textAlign: "center", fontSize: 14, fontWeight: "600", color: PRIMARY }}>
            {t("customer.mobile.screens.authSafetyAndAge.linkLabel")}
          </Text>
        </TouchableOpacity>
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
        >
          <Pressable
            style={{ backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "70%" }}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={{ alignItems: "center", paddingTop: 12, paddingBottom: 4 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: "#D1D5DB" }} />
            </View>
            <View style={{ paddingHorizontal: contentPadding, paddingVertical: 12, borderBottomWidth: 1, borderColor: "#F3F4F6" }}>
              <Text style={{ textAlign: "center", fontWeight: "700", fontSize: 17, color: "#111827", marginBottom: 12 }}>
                {t("customer.mobile.components.phoneInput.selectCountryTitle")}
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
                  placeholder={t("customer.mobile.components.phoneInput.searchCountry")}
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
              keyExtractor={(c) => c.code}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item: c }) => (
                <TouchableOpacity
                  onPress={() => {
                    setCountryCode(c.code);
                    setShowCountryPicker(false);
                    setPhoneError(phone.trim() ? validatePhone(phone, c.code) : null);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 14,
                    paddingHorizontal: contentPadding,
                    borderBottomWidth: 1,
                    borderColor: "#F9FAFB",
                  }}
                >
                  <Text style={{ fontSize: 20, marginRight: 12 }}>{c.flag}</Text>
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

      {/* Language picker modal */}
      <Modal
        visible={showLanguagePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowLanguagePicker(false)}
      >
        <Pressable
          style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" }}
          onPress={() => setShowLanguagePicker(false)}
        >
          <Pressable
            style={{ backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "70%" }}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={{ alignItems: "center", paddingTop: 12, paddingBottom: 4 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: "#D1D5DB" }} />
            </View>
            <Text style={{ textAlign: "center", fontWeight: "700", fontSize: 17, color: "#111827", marginBottom: 12, marginTop: 8 }}>
              {t("auth.preferredLanguage")}
            </Text>
            <FlatList
              {...verticalFlatListPerf}
              data={[...supportedLanguages]}
              keyExtractor={(l) => l.code}
              renderItem={({ item: lang }) => (
                <TouchableOpacity
                  onPress={() => {
                    setPreferredLanguage(lang.code);
                    setShowLanguagePicker(false);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 14,
                    paddingHorizontal: contentPadding,
                    borderBottomWidth: 1,
                    borderColor: "#F9FAFB",
                  }}
                >
                  <Text
                    style={{
                      flex: 1,
                      fontSize: 15,
                      color: preferredLanguage === lang.code ? PRIMARY : "#111827",
                      fontWeight: preferredLanguage === lang.code ? "700" : "400",
                    }}
                  >
                    {lang.nativeName}
                  </Text>
                  {preferredLanguage === lang.code && <Ionicons name="checkmark-circle" size={20} color={PRIMARY} />}
                </TouchableOpacity>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* How did you hear about us modal */}
      <Modal
        visible={showSignupSourcePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSignupSourcePicker(false)}
      >
        <Pressable
          style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" }}
          onPress={() => setShowSignupSourcePicker(false)}
        >
          <Pressable
            style={{ backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "70%" }}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={{ alignItems: "center", paddingTop: 12, paddingBottom: 4 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: "#D1D5DB" }} />
            </View>
            <Text style={{ textAlign: "center", fontWeight: "700", fontSize: 17, color: "#111827", marginBottom: 12, marginTop: 8 }}>
              {t("auth.howHearAboutUs")}
            </Text>
            <TouchableOpacity
              onPress={() => {
                setSignupSource(null);
                setShowSignupSourcePicker(false);
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 14,
                paddingHorizontal: contentPadding,
                borderBottomWidth: 1,
                borderColor: "#F9FAFB",
              }}
            >
              <Text style={{ flex: 1, fontSize: 15, color: !signupSource ? PRIMARY : "#111827", fontWeight: !signupSource ? "700" : "400" }}>
                {t("auth.signupSourceSkip")}
              </Text>
              {!signupSource && <Ionicons name="checkmark-circle" size={20} color={PRIMARY} />}
            </TouchableOpacity>
            <FlatList
              {...verticalFlatListPerf}
              data={SIGNUP_SOURCE_OPTIONS}
              keyExtractor={(o) => o.value}
              renderItem={({ item: opt }) => (
                <TouchableOpacity
                  onPress={() => {
                    setSignupSource(opt.value);
                    setShowSignupSourcePicker(false);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 14,
                    paddingHorizontal: contentPadding,
                    borderBottomWidth: 1,
                    borderColor: "#F9FAFB",
                  }}
                >
                  <Text
                    style={{
                      flex: 1,
                      fontSize: 15,
                      color: signupSource === opt.value ? PRIMARY : "#111827",
                      fontWeight: signupSource === opt.value ? "700" : "400",
                    }}
                  >
                    {t(opt.labelKey)}
                  </Text>
                  {signupSource === opt.value && <Ionicons name="checkmark-circle" size={20} color={PRIMARY} />}
                </TouchableOpacity>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
