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
import { useRouter, useLocalSearchParams } from "expo-router";
import { BeautonomiLogo } from "@/components/ui/BeautonomiLogo";
import { useAuth, type OAuthProvider } from "@/providers/AuthProvider";
import { useTranslation } from "@beautonomi/i18n";
const PRIMARY = "#FF0077";
const PRIMARY_LIGHT = "rgba(255,0,119,0.06)";

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

type LoginMode = "phone" | "email";

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

export default function LoginScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ deactivated?: string; suspended?: string }>();
  const { t } = useTranslation();
  const { signInWithOtp, verifyOtp, signInWithEmail, signInWithOAuth } = useAuth();

  const [mode, setMode] = useState<LoginMode>("phone");
  const statusMessage =
    params.suspended === "1"
      ? "Your account has been suspended. Contact support if you believe this is an error."
      : params.deactivated === "1"
        ? "Your account has been deactivated. Contact support to reactivate."
        : null;
  const [countryCode, setCountryCode] = useState("+27");
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");

  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);

  const fullPhone = `${countryCode}${stripLeadingZero(phone.replace(/\D/g, ""))}`.trim();
  const filteredCountries = countrySearch
    ? COUNTRY_CODES.filter((c) => c.label.toLowerCase().includes(countrySearch.toLowerCase()))
    : COUNTRY_CODES;
  const selectedCountry = COUNTRY_CODES.find((c) => c.code === countryCode);

  function handlePhoneChange(text: string) {
    const digits = text.replace(/[^\d\s]/g, "");
    setPhone(digits);
    if (digits.replace(/\s/g, "").length > 0) {
      setPhoneError(validatePhoneDigits(digits, countryCode));
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
    const err = validatePhoneDigits(phone, countryCode);
    if (err) {
      setFormError(err);
      return;
    }
    setLoading(true);
    try {
      const { error } = await signInWithOtp(fullPhone);
      if (error) {
        setFormError(error.message);
        return;
      }
      setOtpSent(true);
      setFormSuccess("We sent you a verification code. Check your phone.");
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp() {
    setFormError(null);
    if (!token.trim()) {
      setFormError("Please enter the verification code");
      return;
    }
    setLoading(true);
    try {
      const { error } = await verifyOtp(fullPhone, token.trim());
      if (error) {
        setFormError(error.message);
        return;
      }
      // #region agent log
      fetch("http://127.0.0.1:7243/ingest/89f3cdbd-444d-401b-9bce-c59a37625210", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location: "login.tsx:handleVerifyOtp",
          message: "verifyOtp success, navigating",
          data: {},
          timestamp: Date.now(),
          hypothesisId: "D",
        }),
      }).catch(() => {});
      // #endregion
      router.replace("/");
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
      // #region agent log
      fetch("http://127.0.0.1:7243/ingest/89f3cdbd-444d-401b-9bce-c59a37625210", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location: "login.tsx:handleOAuth",
          message: "OAuth success, navigating",
          data: {},
          timestamp: Date.now(),
          hypothesisId: "D",
        }),
      }).catch(() => {});
      // #endregion
      router.replace("/");
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
      // #region agent log
      fetch("http://127.0.0.1:7243/ingest/89f3cdbd-444d-401b-9bce-c59a37625210", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location: "login.tsx:handleEmailLogin",
          message: "email login success, navigating",
          data: {},
          timestamp: Date.now(),
          hypothesisId: "D",
        }),
      }).catch(() => {});
      // #endregion
      router.replace("/");
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-white"
      style={{ flex: 1, backgroundColor: "#ffffff" }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
    >
      <ScrollView
        className="flex-1"
        style={{ flex: 1, backgroundColor: "#ffffff" }}
        contentContainerClassName="grow justify-center px-6 py-12"
        contentContainerStyle={{
          flexGrow: 1,
          backgroundColor: "#ffffff",
          ...(Platform.OS === "web" ? { alignItems: "center" } : {}),
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={Platform.OS === "web" ? { width: "100%", maxWidth: 420, alignSelf: "center" } as any : undefined}>
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
              gap: 10,
            }}
          >
            <Ionicons name="information-circle" size={20} color={params.suspended === "1" ? "#DC2626" : "#D97706"} style={{ marginTop: 1 }} />
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
              gap: 10,
            }}
          >
            <Ionicons name="alert-circle" size={20} color="#DC2626" style={{ marginTop: 1 }} />
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
              gap: 10,
            }}
          >
            <Ionicons name="checkmark-circle" size={20} color="#16A34A" style={{ marginTop: 1 }} />
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
                if (m === "phone") { setOtpSent(false); setToken(""); }
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
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 }}>
                  Verification Code
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
                  <Ionicons name="keypad-outline" size={18} color="#9CA3AF" />
                  <TextInput
                    style={{ flex: 1, paddingVertical: 14, paddingHorizontal: 10, fontSize: 15, color: "#111827", letterSpacing: 6 }}
                    placeholder="000000"
                    placeholderTextColor="#9CA3AF"
                    value={token}
                    onChangeText={setToken}
                    keyboardType="number-pad"
                    maxLength={6}
                    accessibilityLabel="Verification code"
                  />
                </View>
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
                      gap: 4,
                    }}
                    accessibilityLabel="Select country code"
                    accessibilityRole="button"
                  >
                    <Text style={{ fontSize: 18 }}>{selectedCountry?.flag ?? "🌍"}</Text>
                    <Text style={{ fontSize: 15, fontWeight: "600", color: "#111827" }}>{countryCode}</Text>
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
                <Text style={{ fontSize: 12, color: "#6B7280", marginBottom: 20, lineHeight: 18 }}>
                  We&apos;ll send you a verification code. Standard rates apply.{" "}
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
              <View style={{ gap: 12 }}>
                <TouchableOpacity
                  onPress={handleVerifyOtp}
                  disabled={loading}
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
                  onPress={() => { setOtpSent(false); setToken(""); }}
                  disabled={loading}
                  style={{ paddingVertical: 8 }}
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

            {/* Password */}
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
            gap: 10,
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
          <Ionicons name="logo-google" size={20} color="#4285F4" />
          <Text style={{ fontSize: 15, color: "#111827", fontWeight: "500" }}>Continue with Google</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => handleOAuth("apple")}
          disabled={loading}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
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
          <Ionicons name="logo-apple" size={20} color="#000" />
          <Text style={{ fontSize: 15, color: "#111827", fontWeight: "500" }}>Continue with Apple</Text>
        </TouchableOpacity>

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
            <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: "#F3F4F6" }}>
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
                    setPhoneError(phone.trim() ? validatePhoneDigits(phone, c.code) : null);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 14,
                    paddingHorizontal: 16,
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
