import { useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
  Pressable,
  FlatList,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Colors } from "@/constants/colors";
import { BeautonomiLogo } from "@/components/ui/BeautonomiLogo";
import { useResponsive } from "@/hooks/useResponsive";
import { useAuth, type OAuthProvider } from "@/providers/AuthProvider";
import { useTranslation } from "@beautonomi/i18n";
import { api } from "@/lib/api-client";
import { changeLanguage } from "@/lib/i18n";
import {
  normalizeSupabaseAuthPhone,
  normalizeSupabaseSmsOtpToken,
  isCompleteSupabaseSmsOtp,
  SUPABASE_AUTH_OTP_LENGTH,
  SUPABASE_AUTH_SMS_OTP_EXPIRY_SECONDS,
} from "@/lib/supabase-sms-otp";
import {
  COUNTRY_CODES,
  stripLeadingZero,
  validateNationalPhoneDigits,
} from "@/lib/phone-country-codes";
import { getDeviceDefaultCountryDial } from "@/lib/phone";
import { OtpDigitRow } from "@/components/OtpDigitRow";
import { trackLogin } from "@/lib/analytics";
import { supabase } from "@/lib/supabase/client";

const PRIMARY = Colors.primary;
const PENDING_SIGNUP_SOURCE_KEY = "beautonomi_pending_signup_source";
const PENDING_PREFERRED_LANGUAGE_KEY = "beautonomi_pending_preferred_language";

/** Wait for session storage so root `/` portal + profile checks see a valid Bearer token on iOS. */
async function goToAppRoot(router: { replace: (href: string) => void }) {
  await supabase.auth.getSession();
  router.replace("/");
}

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
const PRIMARY_LIGHT = "rgba(255,0,119,0.06)";

type LoginMode = "phone" | "email";

export default function LoginScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ deactivated?: string; suspended?: string }>();
  const { t } = useTranslation();
  const { contentMaxWidth, isTablet, screenPadding } = useResponsive();
  const {
    signInWithOtp,
    verifyOtp,
    signInWithOtpEmail,
    verifyOtpEmail,
    signInWithEmail,
    signInWithOAuth,
  } = useAuth();
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

  const [mode, setMode] = useState<LoginMode>("phone");
  const statusMessage =
    params.suspended === "1"
      ? "Your account has been suspended. Contact support if you believe this is an error."
      : params.deactivated === "1"
        ? "You deactivated your account. Log in again to reactivate."
        : null;
  const [countryCode, setCountryCode] = useState(getDeviceDefaultCountryDial);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [pendingPhone, setPendingPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");

  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);
  const [emailOtpMode, setEmailOtpMode] = useState(false);
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [emailOtpCode, setEmailOtpCode] = useState("");
  const [pendingEmailOtp, setPendingEmailOtp] = useState("");

  const fullPhone = `${countryCode}${stripLeadingZero(phone.replace(/\D/g, ""))}`.trim();
  const filteredCountries = countrySearch
    ? COUNTRY_CODES.filter((c) => c.label.toLowerCase().includes(countrySearch.toLowerCase()))
    : COUNTRY_CODES;
  const selectedCountry = COUNTRY_CODES.find((c) => c.code === countryCode);

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
      const { error } = await signInWithOtp(e164);
      if (error) {
        setFormError(error.message);
        return;
      }
      setPendingPhone(e164);
      setOtpSent(true);
      setFormSuccess("We sent you a verification code. Check your phone.");
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(otpOverride?: string) {
    setFormError(null);
    const otpToken = normalizeSupabaseSmsOtpToken(otpOverride ?? token);
    if (!isCompleteSupabaseSmsOtp(otpToken)) {
      setFormError(`Enter the ${SUPABASE_AUTH_OTP_LENGTH}-digit code from your SMS`);
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
      await applyPendingSignupPreferences();
      await goToAppRoot(router);
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Verification failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleOAuth(provider: OAuthProvider) {
    setFormError(null);
    setLoading(true);
    try {
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
      await applyPendingSignupPreferences();
      await goToAppRoot(router);
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "OAuth sign-in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleEmailLogin() {
    setFormError(null);
    if (!email.trim()) {
      setFormError("Please enter your email");
      return;
    }
    if (!password) {
      setFormError("Please enter your password");
      return;
    }
    setLoading(true);
    try {
      const { error } = await signInWithEmail(email.trim(), password);
      if (error) {
        setFormError(error.message);
        return;
      }
      trackLogin("email");
      await applyPendingSignupPreferences();
      await goToAppRoot(router);
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSendEmailOtp() {
    setFormError(null);
    setFormSuccess(null);
    const trimmed = email.trim();
    if (!trimmed) {
      setFormError("Please enter your email");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setFormError("Please enter a valid email address");
      return;
    }
    setLoading(true);
    try {
      const { error } = await signInWithOtpEmail(trimmed);
      if (error) {
        setFormError(error.message);
        return;
      }
      setPendingEmailOtp(trimmed);
      setEmailOtpSent(true);
      setEmailOtpCode("");
      setFormSuccess(`We sent a ${SUPABASE_AUTH_OTP_LENGTH}-digit code to your email.`);
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Failed to send code.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyEmailOtp(otpOverride?: string) {
    setFormError(null);
    const otpToken = normalizeSupabaseSmsOtpToken(otpOverride ?? emailOtpCode);
    if (!isCompleteSupabaseSmsOtp(otpToken)) {
      setFormError(`Enter the ${SUPABASE_AUTH_OTP_LENGTH}-digit code from your email`);
      return;
    }
    const addr = pendingEmailOtp || email.trim();
    setLoading(true);
    try {
      const { error } = await verifyOtpEmail(addr, otpToken);
      if (error) {
        setFormError(error.message);
        return;
      }
      trackLogin("email");
      await applyPendingSignupPreferences();
      await goToAppRoot(router);
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Verification failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#ffffff" }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
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
          style={{ textAlign: "center", fontSize: 28, fontWeight: "800", color: "#111827", marginBottom: 6 }}
          accessibilityRole="header"
        >
          {t("auth.login")}
        </Text>
        <Text style={{ textAlign: "center", fontSize: 15, color: "#6B7280", marginBottom: 28 }}>
          Welcome back to Beautonomi
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
            <Ionicons name="information-circle" size={20} color={params.suspended === "1" ? "#DC2626" : "#D97706"} style={{ marginTop: 1, marginRight: 10 }} />
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
            <Ionicons name="alert-circle" size={20} color="#DC2626" style={{ marginTop: 1, marginRight: 10 }} />
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
            <Ionicons name="checkmark-circle" size={20} color="#16A34A" style={{ marginTop: 1, marginRight: 10 }} />
            <Text style={{ flex: 1, fontSize: 14, color: "#166534", lineHeight: 20 }}>{formSuccess}</Text>
          </View>
        ) : null}

        {/* Mode toggle */}
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
                }
                if (m === "email") {
                  setEmailOtpMode(false);
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
              accessibilityLabel={m === "phone" ? "Phone" : "Email"}
            >
              <Text
                style={{
                  textAlign: "center",
                  fontSize: 14,
                  fontWeight: mode === m ? "700" : "500",
                  color: mode === m ? PRIMARY : "#6B7280",
                }}
              >
                {m === "phone" ? "Phone" : "Email"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {mode === "phone" ? (
          <>
            {otpSent ? (
              <>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 8 }}>
                  Verification Code
                </Text>
                <Text style={{ fontSize: 12, color: "#6B7280", marginBottom: 12 }}>
                  Enter the {SUPABASE_AUTH_OTP_LENGTH}-digit code from your SMS
                </Text>
                <OtpDigitRow
                  value={token}
                  onChange={setToken}
                  onComplete={(code) => {
                    if (!loading && isCompleteSupabaseSmsOtp(code)) void handleVerifyOtp(code);
                  }}
                  disabled={loading}
                  autoFocus
                  accessibilityLabelPrefix="Login verification code"
                />
              </>
            ) : (
              <>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 }}>
                  Phone Number
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
                    accessibilityLabel="Select country code"
                    accessibilityRole="button"
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
                    value={phone}
                    onChangeText={handlePhoneChange}
                    keyboardType="phone-pad"
                  />
                </View>
                {phoneError ? (
                  <Text style={{ fontSize: 12, color: "#EF4444", marginBottom: 12 }}>{phoneError}</Text>
                ) : null}
                <Text style={{ fontSize: 12, color: "#6B7280", marginBottom: 10, lineHeight: 18 }}>
                  Enter your national number without repeating the country code. Leading 0 is optional.
                </Text>
                <Text style={{ fontSize: 12, color: "#6B7280", marginBottom: 20, lineHeight: 18 }}>
                  We&apos;ll text a {SUPABASE_AUTH_OTP_LENGTH}-digit code (valid about{" "}
                  {Math.max(1, Math.round(SUPABASE_AUTH_SMS_OTP_EXPIRY_SECONDS / 60))}{" "}
                  {Math.round(SUPABASE_AUTH_SMS_OTP_EXPIRY_SECONDS / 60) === 1 ? "minute" : "minutes"}). Standard rates apply.{" "}
                  <Text
                    style={{ fontWeight: "600", color: "#111827", textDecorationLine: "underline" }}
                    onPress={() => router.push("/(auth)/privacy" as never)}
                  >
                    Privacy Policy
                  </Text>
                </Text>
              </>
            )}

            {otpSent ? (
              <View>
                <TouchableOpacity
                  onPress={() => void handleVerifyOtp()}
                  disabled={loading || !isCompleteSupabaseSmsOtp(token)}
                  style={{
                    backgroundColor: PRIMARY,
                    borderRadius: 12,
                    paddingVertical: 16,
                    alignItems: "center",
                    opacity: loading ? 0.7 : 1,
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Verify code"
                >
                  {loading ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>Verify</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { setOtpSent(false); setToken(""); setPendingPhone(""); setFormSuccess(null); }}
                  disabled={loading}
                  style={{ paddingVertical: 8, marginTop: 12 }}
                  accessibilityLabel="Use different number"
                  accessibilityRole="button"
                >
                  <Text style={{ textAlign: "center", fontSize: 14, color: "#6B7280" }}>
                    Use different number
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
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
                accessibilityLabel="Send verification code"
              >
                {loading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>Send Code</Text>
                )}
              </TouchableOpacity>
            )}
          </>
        ) : (
          <>
            {/* Email */}
            <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 }}>
              Email
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
                placeholder="you@example.com"
                placeholderTextColor="#9CA3AF"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
              />
            </View>

            {!emailOtpMode && (
              <>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 }}>
                  Password
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
                    placeholder="Your password"
                    placeholderTextColor="#9CA3AF"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    returnKeyType="done"
                    onSubmitEditing={handleEmailLogin}
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword((v) => !v)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                    accessibilityRole="button"
                  >
                    <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#6B7280" />
                  </TouchableOpacity>
                </View>
              </>
            )}

            {emailOtpMode && emailOtpSent && (
              <>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 8 }}>
                  Verification code
                </Text>
                <Text style={{ fontSize: 12, color: "#6B7280", marginBottom: 12 }}>
                  Enter the {SUPABASE_AUTH_OTP_LENGTH}-digit code sent to {pendingEmailOtp || email.trim()}
                </Text>
                <OtpDigitRow
                  value={emailOtpCode}
                  onChange={setEmailOtpCode}
                  onComplete={(code) => {
                    if (!loading && isCompleteSupabaseSmsOtp(code)) void handleVerifyEmailOtp(code);
                  }}
                  disabled={loading}
                  autoFocus
                  accessibilityLabelPrefix="Email verification code"
                />
                <TouchableOpacity
                  onPress={() => void handleVerifyEmailOtp()}
                  disabled={loading || !isCompleteSupabaseSmsOtp(emailOtpCode)}
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
                  accessibilityLabel="Verify email code"
                >
                  {loading ? <ActivityIndicator color="white" /> : <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>Verify</Text>}
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
                  <Text style={{ textAlign: "center", fontSize: 14, color: "#6B7280" }}>Use a different email</Text>
                </TouchableOpacity>
              </>
            )}

            {emailOtpMode && !emailOtpSent && (
              <>
                <Text style={{ fontSize: 12, color: "#6B7280", marginBottom: 12 }}>
                  We&apos;ll email you a {SUPABASE_AUTH_OTP_LENGTH}-digit verification code.
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
                    setFormSuccess(null);
                  }}
                  disabled={loading}
                  style={{ paddingVertical: 8 }}
                >
                  <Text style={{ textAlign: "center", fontSize: 14, color: "#6B7280" }}>Use password instead</Text>
                </TouchableOpacity>
              </>
            )}

            {!emailOtpMode && (
              <TouchableOpacity
                onPress={handleEmailLogin}
                disabled={loading}
                style={{
                  backgroundColor: PRIMARY,
                  borderRadius: 12,
                  paddingVertical: 16,
                  alignItems: "center",
                  opacity: loading ? 0.7 : 1,
                }}
                accessibilityRole="button"
                accessibilityLabel="Sign in with email"
              >
                {loading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>Sign In</Text>
                )}
              </TouchableOpacity>
            )}

            {!emailOtpMode && (
              <>
                <TouchableOpacity
                  onPress={() => router.push("/(auth)/forgot-password" as never)}
                  style={{ marginTop: 12 }}
                  accessibilityRole="link"
                  accessibilityLabel="Forgot password? Reset it"
                >
                  <Text style={{ textAlign: "center", fontSize: 14, color: "#6B7280" }}>
                    Forgot your password?{" "}
                    <Text style={{ fontWeight: "700", color: PRIMARY }}>Reset it</Text>
                  </Text>
                </TouchableOpacity>
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
                    Sign in with <Text style={{ fontWeight: "700", color: PRIMARY }}>email code</Text> instead
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </>
        )}

        {/* OAuth separator */}
        <View style={{ flexDirection: "row", alignItems: "center", marginVertical: 24 }}>
          <View style={{ flex: 1, height: 1, backgroundColor: "#E5E7EB" }} />
          <Text style={{ marginHorizontal: 16, fontSize: 13, color: "#9CA3AF" }}>or</Text>
          <View style={{ flex: 1, height: 1, backgroundColor: "#E5E7EB" }} />
        </View>

        {/* OAuth buttons */}
        <TouchableOpacity
          onPress={() => handleOAuth("google")}
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
          accessibilityLabel="Continue with Google"
        >
          <Ionicons name="logo-google" size={20} color="#4285F4" style={{ marginRight: 10 }} />
          <Text style={{ fontSize: 15, color: "#111827", fontWeight: "500" }}>Continue with Google</Text>
        </TouchableOpacity>

        {Platform.OS === "ios" && (
          <TouchableOpacity
            onPress={() => handleOAuth("apple")}
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
            accessibilityLabel="Continue with Apple"
          >
            <Ionicons name="logo-apple" size={20} color="#000" style={{ marginRight: 10 }} />
            <Text style={{ fontSize: 15, color: "#111827", fontWeight: "500" }}>Continue with Apple</Text>
          </TouchableOpacity>
        )}

        {/* Sign up link */}
        <View style={{ marginTop: 20 }}>
          <TouchableOpacity
            onPress={() => router.push("/(auth)/signup" as never)}
            accessibilityRole="link"
            accessibilityLabel="Sign up"
          >
            <Text style={{ textAlign: "center", fontSize: 14, color: "#6B7280" }}>
              Don&apos;t have an account?{" "}
              <Text style={{ fontWeight: "700", color: PRIMARY }}>Sign Up</Text>
            </Text>
          </TouchableOpacity>
        </View>
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
          accessibilityLabel="Close country picker"
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
  );
}
