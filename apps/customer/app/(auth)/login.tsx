import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  ScrollView,
  Pressable,
  FlatList,
  Linking,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/providers/AuthProvider";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { useResponsive } from "@/hooks/useResponsive";
import { useTranslation } from "@beautonomi/i18n";
import { Colors } from "@/constants/colors";
import { RADIUS_INPUT, RADIUS_BUTTON } from "@/constants/layout";
import { BeautonomiWordmark } from "@/components/BeautonomiWordmark";
import { webCookiePolicyUrl, webPrivacyPolicyUrl, webTermsOfServiceUrl } from "@/lib/legal-web";
import { api } from "@/lib/api-client";
import { haptic } from "@/lib/haptics";
import { verticalFlatListPerf } from "@/lib/flatListPerformance";
import { trackLogin, trackSignUp } from "@/lib/analytics";
import { changeLanguage } from "@/lib/i18n";
import {
  normalizeSupabaseAuthPhone,
  normalizeSupabaseSmsOtpToken,
  isCompleteOtpForLength,
} from "@/lib/supabase-sms-otp";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { DEFAULT_AUTH } from "@/lib/config-bundle";
import { OtpDigitRow } from "@/components/OtpDigitRow";
import { getDeviceDefaultCountryDial } from "@/lib/device-default-country-dial";
import { navigateAfterCustomerAuth, navigateAfterNewCustomerSignup } from "@/lib/customer-auth-routing";
import { logLoginSuccessBreadcrumb } from "@/lib/sentry";
import { getSocialAuthConfig } from "@/lib/third-party-config";

const PRIMARY = Colors.primary;
const PRIMARY_LIGHT = "rgba(255,0,119,0.06)";
const PENDING_SIGNUP_SOURCE_KEY = "beautonomi_pending_signup_source";
const PENDING_PREFERRED_LANGUAGE_KEY = "beautonomi_pending_preferred_language";

async function applyPendingSignupPreferences() {
  const [pendingSource, pendingLang] = await Promise.all([
    AsyncStorage.getItem(PENDING_SIGNUP_SOURCE_KEY),
    AsyncStorage.getItem(PENDING_PREFERRED_LANGUAGE_KEY),
  ]);
  if (!pendingSource && !pendingLang) return;
  const payload: { signup_source?: string; preferred_language?: string } = {};
  if (pendingSource) payload.signup_source = pendingSource;
  if (pendingLang) payload.preferred_language = pendingLang;
  try {
    await api.patch("/api/me/profile", payload);
    if (pendingLang) await changeLanguage(pendingLang);
  } catch {
    // Non-blocking
  }
  await Promise.all([
    pendingSource ? AsyncStorage.removeItem(PENDING_SIGNUP_SOURCE_KEY) : Promise.resolve(),
    pendingLang ? AsyncStorage.removeItem(PENDING_PREFERRED_LANGUAGE_KEY) : Promise.resolve(),
  ]);
}

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

function stripLeadingZero(digits: string): string {
  return digits.replace(/^0+/, "");
}

function validatePhoneDigits(digits: string, countryCode: string): string | null {
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

/**
 * §Release-audit 2026-04: Supabase returns one of several messages when a
 * signInWithOtp call is made with `shouldCreateUser: false` and the user
 * doesn't yet exist. Normalise the check so both phone and email login
 * flows can funnel new users to signup instead of a terse red error.
 */
function isUserNotFoundOtpError(message: string | undefined | null): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("user not found") ||
    m.includes("signups not allowed") ||
    m.includes("signup is disabled") ||
    m.includes("otp is disabled") ||
    (m.includes("should_create_user") && m.includes("false"))
  );
}

export default function LoginScreen() {
  useScreenTracking("Login");
  const params = useLocalSearchParams<{
    deactivated?: string;
    suspended?: string;
    return_to?: string;
    ref?: string;
  }>();
  const statusMessage =
    params.suspended === "1"
      ? "Your account has been suspended. Contact support if you believe this is an error."
      : params.deactivated === "1"
        ? "You deactivated your account. Log in again to reactivate."
        : null;
  const { t } = useTranslation();
  const {
    signInWithOtp,
    verifyOtp,
    signInWithOtpEmail,
    verifyOtpEmail,
    signInWithOAuth,
    signInWithEmail,
    signUpWithEmail,
  } = useAuth();

  const { bundle: configBundle } = useConfigBundle();
  const auth = configBundle?.auth ?? DEFAULT_AUTH;
  const emailOtpLen = auth.email_otp_length;
  const emailOtpExpiryMin = Math.max(1, Math.round(auth.email_otp_expiration_seconds / 60));
  const smsOtpLen = auth.sms_otp_length;
  const smsOtpExpiryMin = Math.max(1, Math.round(auth.sms_otp_expiration_seconds / 60));

  // Referral: `/login?ref=` (web query or universal link) → signup with ref
  useEffect(() => {
    const raw = params.ref;
    const ref = (Array.isArray(raw) ? raw[0] : raw)?.trim();
    if (ref) {
      router.replace({ pathname: "/(auth)/signup", params: { ref } } as never);
    }
  }, [params.ref]);

  // Deep link: if app opened with signup?ref=, go to signup with ref (native cold start)
  useEffect(() => {
    if (Platform.OS === "web") return;
    Linking.getInitialURL().then((url) => {
      if (!url) return;
      const path = url.includes("?") ? url.slice(0, url.indexOf("?")) : url;
      const query = url.includes("?") ? url.slice(url.indexOf("?") + 1) : "";
      const ref = new URLSearchParams(query).get("ref")?.trim();
      if ((path.endsWith("signup") || path.includes("/signup")) && ref) {
        router.replace({ pathname: "/(auth)/signup", params: { ref } } as never);
      }
    });
  }, []);

  const [countryCode, setCountryCode] = useState(getDeviceDefaultCountryDial);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [pendingPhone, setPendingPhone] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState("");
  const [emailOtpMode, setEmailOtpMode] = useState(false);
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [emailOtpCode, setEmailOtpCode] = useState("");
  const [pendingEmailOtp, setPendingEmailOtp] = useState("");
  const [socialAuth, setSocialAuth] = useState<{ google: boolean; apple: boolean }>({
    google: true,
    apple: true,
  });

  // §UX-audit 2026-04: inline "code sent" feedback + resend cooldown so
  // users who miss the SMS don't have to restart the flow with a fresh
  // number. Cooldown is a simple seconds counter ticked in useEffect.
  const [otpResendIn, setOtpResendIn] = useState(0); // seconds remaining
  const [emailOtpResendIn, setEmailOtpResendIn] = useState(0);
  const [resendingOtp, setResendingOtp] = useState(false);
  const [resendingEmailOtp, setResendingEmailOtp] = useState(false);

  useEffect(() => {
    if (otpResendIn <= 0) return;
    const id = setInterval(() => setOtpResendIn((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [otpResendIn]);

  useEffect(() => {
    if (emailOtpResendIn <= 0) return;
    const id = setInterval(() => setEmailOtpResendIn((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [emailOtpResendIn]);

  useEffect(() => {
    getSocialAuthConfig().then(setSocialAuth).catch(() => {
      setSocialAuth({ google: true, apple: true });
    });
  }, []);

  const fullPhone = `${countryCode}${stripLeadingZero(phoneNumber.replace(/\D/g, ""))}`.trim();
  const hasSocialAuth = socialAuth.google || socialAuth.apple;
  const showAltAfterPhone =
    hasSocialAuth || (!auth.phone_provider_enabled && auth.email_provider_enabled);
  const selectedCountry = COUNTRY_CODES.find((c) => c.code === countryCode);

  useEffect(() => {
    if (auth.email_provider_enabled) return;
    if (!showEmailForm) return;
    setShowEmailForm(false);
    setEmailOtpMode(false);
    setEmailOtpSent(false);
    setEmailOtpCode("");
    setPendingEmailOtp("");
  }, [auth.email_provider_enabled, showEmailForm]);

  useEffect(() => {
    if (auth.phone_provider_enabled) return;
    if (!otpSent) return;
    if (showEmailForm) return;
    setOtpSent(false);
    setToken("");
    setPendingPhone("");
  }, [auth.phone_provider_enabled, otpSent, showEmailForm]);

  useEffect(() => {
    if (auth.phone_provider_enabled || !auth.email_provider_enabled) return;
    setShowEmailForm(true);
  }, [auth.email_provider_enabled, auth.phone_provider_enabled]);

  const filteredCountries = countrySearch
    ? COUNTRY_CODES.filter((c) => c.label.toLowerCase().includes(countrySearch.toLowerCase()))
    : COUNTRY_CODES;

  function handlePhoneChange(text: string) {
    const digits = text.replace(/[^\d\s]/g, "");
    setPhoneNumber(digits);
    if (digits.replace(/\s/g, "").length > 0) {
      setPhoneError(validatePhoneDigits(digits, countryCode));
    } else {
      setPhoneError(null);
    }
  }

  async function handleSendOtp() {
    if (!auth.phone_provider_enabled) {
      Alert.alert("Not available", "Phone sign-in is not enabled for this platform.");
      return;
    }
    if (!phoneNumber.trim()) {
      Alert.alert("Error", "Please enter your phone number");
      return;
    }
    const err = validatePhoneDigits(phoneNumber, countryCode);
    if (err) {
      Alert.alert("Invalid Phone", err);
      return;
    }
    const raw = fullPhone.startsWith("+") ? fullPhone : `+${fullPhone}`;
    const e164 = normalizeSupabaseAuthPhone(raw);
    setLoading(true);
    try {
      const { error } = await signInWithOtp(e164);
      if (error) {
        // §Release-audit 2026-04: Supabase signInWithOtp uses
        // `shouldCreateUser: false` on the login screen, so "user not
        // found" / "signups not allowed" are the expected error when a
        // new customer tries to sign in by phone. Offer a path to signup
        // instead of a blanket red Alert that dead-ends them.
        if (isUserNotFoundOtpError(error.message)) {
          const refParam = typeof params.ref === "string" ? params.ref.trim() : undefined;
          Alert.alert(
            "No account for this number",
            "We couldn't find a customer account linked to this phone. Would you like to create one?",
            [
              { text: "Try another number", style: "cancel" },
              {
                text: "Sign up",
                onPress: () =>
                  router.push({
                    pathname: "/(auth)/signup",
                    params: refParam ? { ref: refParam, phone: e164 } : { phone: e164 },
                  } as never),
              },
            ],
          );
          return;
        }
        Alert.alert("Error", error.message);
        return;
      }
      setPendingPhone(e164);
      setOtpSent(true);
      setToken("");
      // §UX-audit 2026-04: replaced the blocking "Check your phone" Alert
      // with an inline success state (banner above the OTP input) and
      // start the 30s resend cooldown. Less jarring, faster to act on.
      setOtpResendIn(30);
      haptic.success();
    } finally {
      setLoading(false);
    }
  }

  async function handleResendOtp() {
    if (otpResendIn > 0 || resendingOtp) return;
    const phoneToSend = pendingPhone || fullPhone;
    if (!phoneToSend) return;
    setResendingOtp(true);
    try {
      const { error } = await signInWithOtp(phoneToSend);
      if (error) {
        Alert.alert("Couldn't resend", error.message);
        return;
      }
      setOtpResendIn(30);
      haptic.light();
    } finally {
      setResendingOtp(false);
    }
  }

  async function handleResendEmailOtp() {
    if (emailOtpResendIn > 0 || resendingEmailOtp) return;
    const emailToSend = pendingEmailOtp || email.trim();
    if (!emailToSend) return;
    setResendingEmailOtp(true);
    try {
      const { error } = await signInWithOtpEmail(emailToSend);
      if (error) {
        Alert.alert("Couldn't resend", error.message);
        return;
      }
      setEmailOtpResendIn(30);
      haptic.light();
    } finally {
      setResendingEmailOtp(false);
    }
  }

  async function handleVerifyOtp(otpOverride?: string) {
    const otpToken = normalizeSupabaseSmsOtpToken(otpOverride ?? token);
    if (!isCompleteOtpForLength(otpToken, smsOtpLen)) {
      Alert.alert("Error", `Enter the ${smsOtpLen}-digit code from your SMS`);
      return;
    }
    const phoneToVerify = pendingPhone || fullPhone;
    const raw = phoneToVerify.startsWith("+") ? phoneToVerify : `+${phoneToVerify}`;
    const e164 = normalizeSupabaseAuthPhone(raw);
    setLoading(true);
    try {
      const { error } = await verifyOtp(e164, otpToken);
      if (error) {
        Alert.alert("Error", error.message);
        return;
      }
      trackLogin("phone");
      await applyPendingSignupPreferences();
      logLoginSuccessBreadcrumb("phone_otp");
      await navigateAfterCustomerAuth(params.return_to);
    } finally {
      setLoading(false);
    }
  }

  async function handleSendEmailOtp() {
    if (!auth.email_provider_enabled) {
      Alert.alert("Not available", "Email sign-in is not enabled for this platform.");
      return;
    }
    const trimmed = email.trim();
    if (!trimmed) {
      Alert.alert("Error", "Please enter your email");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      Alert.alert("Error", "Please enter a valid email address");
      return;
    }
    setLoading(true);
    try {
      const { error } = await signInWithOtpEmail(trimmed);
      if (error) {
        // §Release-audit 2026-04: same UX as phone — email OTP also uses
        // `shouldCreateUser: false`, so convert the "no user" response
        // into a "Create account?" prompt that keeps the typed email.
        if (isUserNotFoundOtpError(error.message)) {
          const refParam = typeof params.ref === "string" ? params.ref.trim() : undefined;
          Alert.alert(
            "No account for this email",
            "We couldn't find a customer account for this email. Would you like to create one?",
            [
              { text: "Try another email", style: "cancel" },
              {
                text: "Sign up",
                onPress: () =>
                  router.push({
                    pathname: "/(auth)/signup",
                    params: refParam ? { ref: refParam, email: trimmed } : { email: trimmed },
                  } as never),
              },
            ],
          );
          return;
        }
        Alert.alert("Error", error.message);
        return;
      }
      setPendingEmailOtp(trimmed);
      setEmailOtpSent(true);
      setEmailOtpCode("");
      // §UX-audit 2026-04: inline banner + resend cooldown instead of
      // blocking "Check your email" alert.
      setEmailOtpResendIn(30);
      haptic.success();
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyEmailOtp(otpOverride?: string) {
    const otpToken = normalizeSupabaseSmsOtpToken(otpOverride ?? emailOtpCode);
    if (!isCompleteOtpForLength(otpToken, emailOtpLen)) {
      Alert.alert("Error", `Enter the ${emailOtpLen}-digit code from your email`);
      return;
    }
    const addr = pendingEmailOtp || email.trim();
    setLoading(true);
    try {
      const { error } = await verifyOtpEmail(addr, otpToken);
      if (error) {
        Alert.alert("Error", error.message);
        return;
      }
      trackLogin("email");
      await applyPendingSignupPreferences();
      logLoginSuccessBreadcrumb("email_otp");
      await navigateAfterCustomerAuth(params.return_to);
    } finally {
      setLoading(false);
    }
  }

  async function handleSocialOAuth(provider: "google" | "apple") {
    setLoading(true);
    try {
      const { error } = await signInWithOAuth(provider);
      if (error) {
        Alert.alert(
          "Sign in failed",
          error.message +
            (error.message.includes("not enabled")
              ? " Enable this provider in Supabase Dashboard → Authentication → Providers."
              : ""),
        );
        return;
      }
      trackLogin(provider);
      await applyPendingSignupPreferences();
      logLoginSuccessBreadcrumb(`oauth_${provider}`);
      await navigateAfterCustomerAuth(params.return_to);
    } catch {
      Alert.alert("Sign in failed", "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleEmailSubmit() {
    if (!email.trim()) {
      Alert.alert("Error", "Please enter your email");
      return;
    }
    if (!password.trim()) {
      Alert.alert("Error", "Please enter your password");
      return;
    }
    if (password.length < 8) {
      Alert.alert("Error", "Password must be at least 8 characters");
      return;
    }
    if (isSignup && !fullName.trim()) {
      Alert.alert("Error", "Please enter your full name");
      return;
    }
    setLoading(true);
    try {
      const result = isSignup
        ? await signUpWithEmail(email.trim(), password.trim(), fullName.trim())
        : await signInWithEmail(email.trim(), password.trim());
      if (result.error) {
        Alert.alert("Error", result.error.message);
        return;
      }
      if (result.requiresConfirmation) {
        setIsSignup(false);
        if (isSignup) trackSignUp("email");
        Alert.alert(
          "Check your email",
          "We sent you a confirmation link. Click it to activate your account, then log in below.",
          [{ text: "OK" }],
        );
        return;
      }
      if (isSignup) trackSignUp("email");
      else trackLogin("email");
      await applyPendingSignupPreferences();
      if (isSignup) {
        logLoginSuccessBreadcrumb("email_signup");
        await navigateAfterNewCustomerSignup(params.return_to);
      } else {
        logLoginSuccessBreadcrumb("email_password");
        await navigateAfterCustomerAuth(params.return_to);
      }
    } catch {
      Alert.alert("Error", "Something went wrong. Please try again.");
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
    flexGrow: 1,
    justifyContent: "center" as const,
    paddingHorizontal: contentPadding,
    paddingVertical: 48,
    ...(formNarrow ? { alignItems: "center" as const } : {}),
  };

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={{ flex: 1, backgroundColor: Colors.white }}
    >
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.white }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
    >
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.white }}
        contentContainerStyle={scrollContentStyle}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
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
            <BeautonomiWordmark size={28} color={PRIMARY} showText={false} />
          </View>
        </View>

        <Text
          style={{ textAlign: "center", fontSize: 28, fontWeight: "800", color: "#111827", marginBottom: 6, letterSpacing: -0.3 }}
          accessibilityRole="header"
        >
          Welcome back
        </Text>
        <Text style={{ textAlign: "center", fontSize: 15, color: "#6B7280", lineHeight: 22, marginBottom: 28 }}>
          {t("auth.login")} to book beauty and wellness, manage appointments, and shop with Beautonomi.
        </Text>

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
            <Ionicons
              name="information-circle"
              size={20}
              color={params.suspended === "1" ? "#DC2626" : "#D97706"}
              style={{ marginTop: 1, marginRight: 10 }}
            />
            <Text
              style={{
                flex: 1,
                fontSize: 14,
                color: params.suspended === "1" ? "#991B1B" : "#92400E",
                lineHeight: 20,
              }}
            >
              {statusMessage}
            </Text>
          </View>
        ) : null}

        {auth.email_provider_enabled && auth.phone_provider_enabled && !otpSent && !isSignup ? (
          <View
            style={{
              flexDirection: "row",
              borderRadius: 14,
              backgroundColor: "#F3F4F6",
              padding: 4,
              marginBottom: 24,
            }}
            accessibilityRole="tablist"
            accessibilityLabel="Login method selection"
          >
            {([
              { key: "phone", label: "Phone" },
              { key: "email", label: "Email" },
            ] as const).map((item) => {
              const selected = item.key === "email" ? showEmailForm : !showEmailForm;
              return (
                <TouchableOpacity
                  key={item.key}
                  onPress={() => {
                    setShowEmailForm(item.key === "email");
                    setEmailOtpMode(false);
                    setEmailOtpSent(false);
                    setEmailOtpCode("");
                    setPendingEmailOtp("");
                    setPhoneError(null);
                  }}
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    borderRadius: 11,
                    backgroundColor: selected ? Colors.white : "transparent",
                    ...(selected
                      ? Platform.select({
                          web: { boxShadow: "0 1px 3px rgba(0,0,0,0.08)" },
                          default: {
                            shadowColor: "#000",
                            shadowOpacity: 0.08,
                            shadowRadius: 3,
                            shadowOffset: { width: 0, height: 1 },
                            elevation: 1,
                          },
                        })
                      : {}),
                  }}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  accessibilityLabel={item.label}
                >
                  <Text
                    style={{
                      textAlign: "center",
                      fontSize: 14,
                      fontWeight: selected ? "700" : "500",
                      color: selected ? PRIMARY : "#6B7280",
                    }}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}

        {otpSent && auth.phone_provider_enabled ? (
          <>
            <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 8 }}>
              {t("auth.verifyCode")}
            </Text>
            <Text style={{ fontSize: 12, color: Colors.gray[500], marginBottom: 12 }}>
              Enter the {smsOtpLen}-digit code sent to{" "}
              <Text style={{ fontWeight: "600", color: Colors.gray[700] }}>{pendingPhone}</Text>
            </Text>
            {/* §UX-audit 2026-04: inline success banner — replaces the Alert.alert. */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                backgroundColor: "#ECFDF5",
                borderColor: "#A7F3D0",
                borderWidth: 1,
                borderRadius: 12,
                paddingVertical: 10,
                paddingHorizontal: 12,
                marginBottom: 12,
              }}
              accessibilityRole="alert"
              accessibilityLabel={`We sent a ${smsOtpLen}-digit code to ${pendingPhone}`}
            >
              <Ionicons name="checkmark-circle" size={18} color="#059669" />
              <Text style={{ flex: 1, color: "#065F46", fontSize: 13, lineHeight: 18 }}>
                Code sent. Valid for about {smsOtpExpiryMin} min.
              </Text>
            </View>
            <OtpDigitRow
              length={smsOtpLen}
              value={token}
              onChange={setToken}
              onComplete={(code) => {
                if (!loading && isCompleteOtpForLength(code, smsOtpLen)) void handleVerifyOtp(code);
              }}
              disabled={loading}
              autoFocus
              accessibilityLabelPrefix="Login verification code"
            />

            <TouchableOpacity
              onPress={() => void handleVerifyOtp()}
              disabled={loading || !isCompleteOtpForLength(token, smsOtpLen)}
              style={{
                backgroundColor: PRIMARY,
                borderRadius: RADIUS_BUTTON,
                paddingVertical: 16,
                alignItems: "center",
                opacity: loading ? 0.7 : 1,
                marginBottom: 12,
              }}
              accessibilityRole="button"
              accessibilityLabel="Verify code"
              accessibilityState={{ disabled: loading }}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>Verify</Text>
              )}
            </TouchableOpacity>

            {/* §UX-audit 2026-04: resend + cooldown row. */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 4 }}>
              <TouchableOpacity
                onPress={() => void handleResendOtp()}
                disabled={loading || resendingOtp || otpResendIn > 0}
                style={{ paddingVertical: 8, minHeight: 44, justifyContent: "center" }}
                accessibilityRole="button"
                accessibilityLabel={
                  otpResendIn > 0
                    ? `Resend code in ${otpResendIn} seconds`
                    : "Resend verification code"
                }
                accessibilityState={{ disabled: loading || resendingOtp || otpResendIn > 0 }}
              >
                {resendingOtp ? (
                  <ActivityIndicator size="small" color={Colors.gray[500]} />
                ) : (
                  <Text style={{ fontSize: 14, color: otpResendIn > 0 ? Colors.gray[400] : PRIMARY, fontWeight: "600" }}>
                    {otpResendIn > 0 ? `Resend in ${otpResendIn}s` : "Resend code"}
                  </Text>
                )}
              </TouchableOpacity>
              <Text style={{ color: Colors.gray[300] }}>·</Text>
              <TouchableOpacity
                onPress={() => { setOtpSent(false); setToken(""); setPendingPhone(""); setOtpResendIn(0); }}
                disabled={loading}
                style={{ paddingVertical: 8, minHeight: 44, justifyContent: "center" }}
                accessibilityRole="button"
                accessibilityLabel="Use different number"
              >
                <Text style={{ fontSize: 14, color: Colors.gray[600] }}>
                  Use different number
                </Text>
              </TouchableOpacity>
            </View>
          </>
        ) : showEmailForm ? (
          <>
            {isSignup ? (
              <Text style={{ textAlign: "center", fontSize: 18, fontWeight: "700", color: "#111827", marginBottom: 20 }}>
                Create account
              </Text>
            ) : null}

            {isSignup && (
              <>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 }}>
                  Full Name
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor: Colors.gray[200],
                    borderRadius: RADIUS_INPUT,
                    backgroundColor: Colors.gray[50],
                    paddingHorizontal: 16,
                    marginBottom: 16,
                  }}
                >
                  <Ionicons name="person-outline" size={18} color={Colors.gray[400]} />
                  <TextInput
                    style={{ flex: 1, paddingVertical: 14, paddingHorizontal: 10, fontSize: 15, color: "#111827" }}
                    placeholder="Your full name"
                    placeholderTextColor="#9CA3AF"
                    value={fullName}
                    onChangeText={setFullName}
                    autoCapitalize="words"
                    accessibilityLabel="Full name"
                  />
                </View>
              </>
            )}

            <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 }}>
              Email
            </Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                borderWidth: 1,
                borderColor: Colors.gray[200],
                borderRadius: RADIUS_INPUT,
                backgroundColor: Colors.gray[50],
                paddingHorizontal: 16,
                marginBottom: 16,
              }}
            >
              <Ionicons name="mail-outline" size={18} color={Colors.gray[400]} />
              <TextInput
                style={{ flex: 1, paddingVertical: 14, paddingHorizontal: 10, fontSize: 15, color: Colors.gray[900] }}
                placeholder="you@example.com"
                placeholderTextColor="#9CA3AF"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
                importantForAutofill="yes"
                accessibilityLabel="Email address"
              />
            </View>

            {(isSignup || !emailOtpMode) && (
              <>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 }}>
                  Password
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor: Colors.gray[200],
                    borderRadius: RADIUS_INPUT,
                    backgroundColor: Colors.gray[50],
                    paddingHorizontal: 16,
                    marginBottom: 20,
                  }}
                >
                  <Ionicons name="lock-closed-outline" size={18} color={Colors.gray[400]} />
                  <TextInput
                    style={{ flex: 1, paddingVertical: 14, paddingHorizontal: 10, fontSize: 15, color: Colors.gray[900] }}
                    placeholder={isSignup ? "Min. 8 characters" : "Your password"}
                    placeholderTextColor="#9CA3AF"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoComplete={isSignup ? "new-password" : "current-password"}
                    textContentType={isSignup ? "newPassword" : "password"}
                    importantForAutofill="yes"
                    accessibilityLabel="Password"
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword((v) => !v)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#6B7280" />
                  </TouchableOpacity>
                </View>
              </>
            )}

            {!isSignup && emailOtpMode && emailOtpSent && (
              <>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 8 }}>
                  Verification code
                </Text>
                <Text style={{ fontSize: 12, color: Colors.gray[500], marginBottom: 12 }}>
                  Enter the {emailOtpLen}-digit code sent to{" "}
                  <Text style={{ fontWeight: "600", color: Colors.gray[700] }}>
                    {pendingEmailOtp || email.trim()}
                  </Text>
                  {` (valid about ${emailOtpExpiryMin} minutes)`}
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    backgroundColor: "#ECFDF5",
                    borderColor: "#A7F3D0",
                    borderWidth: 1,
                    borderRadius: 12,
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    marginBottom: 12,
                  }}
                  accessibilityRole="alert"
                >
                  <Ionicons name="checkmark-circle" size={18} color="#059669" />
                  <Text style={{ flex: 1, color: "#065F46", fontSize: 13 }}>Code sent. Check your inbox.</Text>
                </View>
                <OtpDigitRow
                  length={emailOtpLen}
                  value={emailOtpCode}
                  onChange={setEmailOtpCode}
                  onComplete={(code) => {
                    if (!loading && isCompleteOtpForLength(code, emailOtpLen)) void handleVerifyEmailOtp(code);
                  }}
                  disabled={loading}
                  autoFocus
                  accessibilityLabelPrefix="Email verification code"
                />
                <TouchableOpacity
                  onPress={() => void handleVerifyEmailOtp()}
                  disabled={loading || !isCompleteOtpForLength(emailOtpCode, emailOtpLen)}
                  style={{
                    backgroundColor: PRIMARY,
                    borderRadius: RADIUS_INPUT,
                    paddingVertical: 16,
                    alignItems: "center",
                    opacity: loading ? 0.7 : 1,
                    marginBottom: 12,
                    marginTop: 8,
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Verify email code"
                >
                  {loading ? <ActivityIndicator color="white" /> : <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>Verify</Text>}
                </TouchableOpacity>

                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12 }}>
                  <TouchableOpacity
                    onPress={() => void handleResendEmailOtp()}
                    disabled={loading || resendingEmailOtp || emailOtpResendIn > 0}
                    style={{ paddingVertical: 8, minHeight: 44, justifyContent: "center" }}
                    accessibilityRole="button"
                    accessibilityLabel={
                      emailOtpResendIn > 0
                        ? `Resend code in ${emailOtpResendIn} seconds`
                        : "Resend verification code"
                    }
                    accessibilityState={{ disabled: loading || resendingEmailOtp || emailOtpResendIn > 0 }}
                  >
                    {resendingEmailOtp ? (
                      <ActivityIndicator size="small" color={Colors.gray[500]} />
                    ) : (
                      <Text style={{ fontSize: 14, color: emailOtpResendIn > 0 ? Colors.gray[400] : PRIMARY, fontWeight: "600" }}>
                        {emailOtpResendIn > 0 ? `Resend in ${emailOtpResendIn}s` : "Resend code"}
                      </Text>
                    )}
                  </TouchableOpacity>
                  <Text style={{ color: Colors.gray[300] }}>·</Text>
                  <TouchableOpacity
                    onPress={() => {
                      setEmailOtpSent(false);
                      setEmailOtpCode("");
                      setPendingEmailOtp("");
                      setEmailOtpResendIn(0);
                    }}
                    disabled={loading}
                    style={{ paddingVertical: 8, minHeight: 44, justifyContent: "center" }}
                    accessibilityRole="button"
                    accessibilityLabel="Use a different email"
                  >
                    <Text style={{ fontSize: 14, color: Colors.gray[600] }}>Use a different email</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {!isSignup && emailOtpMode && !emailOtpSent && (
              <>
                <Text style={{ fontSize: 12, color: Colors.gray[500], marginBottom: 12 }}>
                  We&apos;ll email you a {emailOtpLen}-digit verification code (valid about {emailOtpExpiryMin}{" "}
                  {emailOtpExpiryMin === 1 ? "minute" : "minutes"}).
                </Text>
                <TouchableOpacity
                  onPress={handleSendEmailOtp}
                  disabled={loading}
                  style={{
                    backgroundColor: PRIMARY,
                    borderRadius: RADIUS_INPUT,
                    paddingVertical: 16,
                    alignItems: "center",
                    opacity: loading ? 0.7 : 1,
                    marginBottom: 12,
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Send email verification code"
                >
                  {loading ? <ActivityIndicator color="white" /> : <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>Send code</Text>}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setEmailOtpMode(false);
                    setEmailOtpSent(false);
                    setEmailOtpCode("");
                    setPendingEmailOtp("");
                  }}
                  disabled={loading}
                  style={{ paddingVertical: 8 }}
                >
                  <Text style={{ textAlign: "center", fontSize: 14, color: "#6B7280" }}>Use password instead</Text>
                </TouchableOpacity>
              </>
            )}

            {(isSignup || !emailOtpMode) && (
              <TouchableOpacity
                onPress={handleEmailSubmit}
                disabled={loading}
                style={{
                  backgroundColor: PRIMARY,
                  borderRadius: RADIUS_INPUT,
                  paddingVertical: 16,
                  alignItems: "center",
                  opacity: loading ? 0.7 : 1,
                  marginBottom: 12,
                }}
                accessibilityRole="button"
                accessibilityLabel={isSignup ? "Sign up" : "Log in"}
                accessibilityState={{ disabled: loading }}
              >
                {loading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>
                    {isSignup ? "Sign up" : "Log in"}
                  </Text>
                )}
              </TouchableOpacity>
            )}

            {!isSignup && !emailOtpMode && (
              <>
                <TouchableOpacity
                  onPress={() => router.push("/(auth)/forgot-password" as never)}
                  style={{ paddingVertical: 8 }}
                  accessibilityRole="link"
                  accessibilityLabel="Forgot password? Reset it"
                >
                  <Text style={{ textAlign: "center", fontSize: 14, color: PRIMARY, fontWeight: "600" }}>
                    Forgot your password?
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
                    }}
                    disabled={loading}
                    style={{ paddingVertical: 8 }}
                  >
                    <Text style={{ textAlign: "center", fontSize: 14, color: "#6B7280" }}>
                      Sign in with <Text style={{ fontWeight: "700", color: PRIMARY }}>email code</Text> instead
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )}

            <TouchableOpacity
              onPress={() => {
                setIsSignup(!isSignup);
                setEmailOtpMode(false);
                setEmailOtpSent(false);
                setEmailOtpCode("");
                setPendingEmailOtp("");
              }}
              disabled={loading}
              style={{ paddingVertical: 8 }}
            >
              <Text style={{ textAlign: "center", fontSize: 14, color: "#6B7280" }}>
                {isSignup ? "Already have an account? " : "Don't have an account? "}
                <Text style={{ fontWeight: "700", color: PRIMARY }}>
                  {isSignup ? "Log in" : "Sign up"}
                </Text>
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                setShowEmailForm(false);
                setEmail("");
                setPassword("");
                setFullName("");
                setEmailOtpMode(false);
                setEmailOtpSent(false);
                setEmailOtpCode("");
                setPendingEmailOtp("");
              }}
              disabled={loading}
              style={{ paddingVertical: 8 }}
            >
              <Text style={{ textAlign: "center", fontSize: 14, color: "#6B7280", textDecorationLine: "underline" }}>
                Back
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            {auth.phone_provider_enabled && (
              <>
            {/* Phone input with country code */}
            <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 }}>
              Phone Number
            </Text>
            <View
              style={{
                flexDirection: "row",
                borderWidth: 1,
                borderColor: phoneError ? "#EF4444" : "#E5E7EB",
                borderRadius: RADIUS_INPUT,
                overflow: "hidden",
                marginBottom: phoneError ? 4 : 12,
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
                accessibilityRole="button"
                accessibilityLabel={`Country code: ${selectedCountry?.label ?? countryCode}`}
              >
                <Text style={{ fontSize: 18, marginRight: 4 }}>{selectedCountry?.flag ?? "🌍"}</Text>
                <Text style={{ fontSize: 15, fontWeight: "600", color: "#111827", marginRight: 4 }}>{countryCode}</Text>
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
                placeholder="71 234 5678"
                placeholderTextColor="#9CA3AF"
                value={phoneNumber}
                onChangeText={handlePhoneChange}
                keyboardType="phone-pad"
                accessibilityLabel="Phone number"
                textContentType="telephoneNumber"
                autoComplete="tel-national"
                returnKeyType="send"
                importantForAutofill="yes"
              />
            </View>
            {phoneError ? (
              <Text style={{ fontSize: 12, color: "#EF4444", marginBottom: 8 }}>{phoneError}</Text>
            ) : null}
            <Text style={{ fontSize: 12, color: "#6B7280", marginBottom: 10, lineHeight: 18 }}>
              Enter your national number without repeating the country code. Leading 0 is optional.
            </Text>

            <Text style={{ fontSize: 12, color: "#6B7280", marginBottom: 20, lineHeight: 18 }}>
              We&apos;ll text a {smsOtpLen}-digit code (valid about {smsOtpExpiryMin}{" "}
              {smsOtpExpiryMin === 1 ? "minute" : "minutes"}). Standard rates apply.{" "}
              <Text
                style={{ fontWeight: "600", color: "#111827", textDecorationLine: "underline" }}
                onPress={() => Linking.openURL(webPrivacyPolicyUrl()).catch(() => {})}
              >
                Privacy
              </Text>
              {" · "}
              <Text
                style={{ fontWeight: "600", color: "#111827", textDecorationLine: "underline" }}
                onPress={() => Linking.openURL(webTermsOfServiceUrl()).catch(() => {})}
              >
                Terms
              </Text>
              {" · "}
              <Text
                style={{ fontWeight: "600", color: "#111827", textDecorationLine: "underline" }}
                onPress={() => Linking.openURL(webCookiePolicyUrl()).catch(() => {})}
              >
                Cookies
              </Text>
            </Text>

            <TouchableOpacity
              onPress={handleSendOtp}
              disabled={loading}
              style={{
                backgroundColor: PRIMARY,
                borderRadius: RADIUS_INPUT,
                paddingVertical: 16,
                alignItems: "center",
                opacity: loading ? 0.7 : 1,
                marginBottom: 24,
              }}
              accessibilityRole="button"
              accessibilityLabel="Continue with phone number"
              accessibilityState={{ disabled: loading }}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>Continue</Text>
              )}
            </TouchableOpacity>
              </>
            )}

            {showAltAfterPhone && (
              <>
                {auth.phone_provider_enabled && (
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 24 }}>
                  <View style={{ flex: 1, height: 1, backgroundColor: "#E5E7EB" }} />
                  <Text style={{ marginHorizontal: contentPadding, fontSize: 13, color: "#9CA3AF" }}>or</Text>
                  <View style={{ flex: 1, height: 1, backgroundColor: "#E5E7EB" }} />
                </View>
                )}

                {hasSocialAuth && (
                  <>
                    {socialAuth.google && (
                      <TouchableOpacity
                        onPress={() => void handleSocialOAuth("google")}
                        disabled={loading}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "center",
                          borderWidth: 1,
                          borderColor: "#E5E7EB",
                          borderRadius: RADIUS_INPUT,
                          paddingVertical: 14,
                          marginBottom: 12,
                          backgroundColor: "#fff",
                        }}
                        accessibilityRole="button"
                        accessibilityLabel="Continue with Google"
                      >
                        <Ionicons name="logo-google" size={20} color="#4285F4" style={{ marginRight: 10 }} />
                        <Text style={{ fontSize: 15, color: "#111827", fontWeight: "500" }}>Continue with Google</Text>
                      </TouchableOpacity>
                    )}

                    {socialAuth.apple && (
                      <TouchableOpacity
                        onPress={() => void handleSocialOAuth("apple")}
                        disabled={loading}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "center",
                          borderWidth: 1,
                          borderColor: "#E5E7EB",
                          borderRadius: RADIUS_INPUT,
                          paddingVertical: 14,
                          marginBottom: 12,
                          backgroundColor: "#fff",
                        }}
                        accessibilityRole="button"
                        accessibilityLabel="Continue with Apple"
                      >
                        <Ionicons name="logo-apple" size={20} color="#000" style={{ marginRight: 10 }} />
                        <Text style={{ fontSize: 15, color: "#111827", fontWeight: "500" }}>Continue with Apple</Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}

                {auth.email_provider_enabled && !auth.phone_provider_enabled && (
                  <TouchableOpacity
                    onPress={() => setShowEmailForm(true)}
                    disabled={loading}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      borderWidth: 1,
                      borderColor: "#E5E7EB",
                      borderRadius: RADIUS_INPUT,
                      paddingVertical: 14,
                      marginBottom: 12,
                      backgroundColor: "#fff",
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Continue with email"
                  >
                    <Ionicons name="mail-outline" size={20} color="#6B7280" style={{ marginRight: 10 }} />
                    <Text style={{ fontSize: 15, color: "#111827", fontWeight: "500" }}>Continue with email</Text>
                  </TouchableOpacity>
                )}
              </>
            )}

            {/* Sign up link */}
            <View style={{ marginTop: 16 }}>
              <TouchableOpacity
                onPress={() => {
                  const rt = params.return_to;
                  const returnTo = Array.isArray(rt) ? rt[0] : rt;
                  router.push(
                    returnTo
                      ? ({ pathname: "/(auth)/signup", params: { return_to: returnTo } } as never)
                      : ("/(auth)/signup" as never),
                  );
                }}
                accessibilityRole="link"
              >
                <Text style={{ textAlign: "center", fontSize: 14, color: "#6B7280" }}>
                  Don&apos;t have an account?{" "}
                  <Text style={{ fontWeight: "700", color: PRIMARY }}>Sign up</Text>
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}
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
                Select Country
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
                  placeholder="Search country..."
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
                    setPhoneError(phoneNumber.trim() ? validatePhoneDigits(phoneNumber, c.code) : null);
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
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
