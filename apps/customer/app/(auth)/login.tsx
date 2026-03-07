import { useState } from "react";
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
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { useResponsive } from "@/hooks/useResponsive";
import { useTranslation } from "@beautonomi/i18n";
import { Colors } from "@/constants/colors";
import { APP_URL } from "@/config/public-env";

const PRIMARY = Colors.primary;
const PRIMARY_LIGHT = Colors.primaryLight;

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

export default function LoginScreen() {
  useScreenTracking("Login");
  const { t } = useTranslation();
  const {
    signInWithOtp,
    verifyOtp,
    signInWithOAuth,
    signInWithEmail,
    signUpWithEmail,
  } = useAuth();

  const [countryCode, setCountryCode] = useState("+27");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState("");

  const fullPhone = `${countryCode}${stripLeadingZero(phoneNumber.replace(/\D/g, ""))}`.trim();
  const selectedCountry = COUNTRY_CODES.find((c) => c.code === countryCode);
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
    if (!phoneNumber.trim()) {
      Alert.alert("Error", "Please enter your phone number");
      return;
    }
    const err = validatePhoneDigits(phoneNumber, countryCode);
    if (err) {
      Alert.alert("Invalid Phone", err);
      return;
    }
    setLoading(true);
    const { error } = await signInWithOtp(fullPhone);
    setLoading(false);
    if (error) {
      Alert.alert("Error", error.message);
      return;
    }
    setOtpSent(true);
    Alert.alert("Check your phone", "We sent you a verification code.");
  }

  async function handleVerifyOtp() {
    if (!token.trim()) {
      Alert.alert("Error", "Please enter the verification code");
      return;
    }
    setLoading(true);
    const { error } = await verifyOtp(fullPhone, token.trim());
    if (error) {
      setLoading(false);
      Alert.alert("Error", error.message);
      return;
    }
    router.replace("/(app)/(tabs)/home");
    setLoading(false);
  }

  async function handleOAuth(provider: "google" | "apple" | "facebook") {
    setLoading(true);
    const { error } = await signInWithOAuth(provider);
    if (error) {
      setLoading(false);
      Alert.alert(
        "Sign in failed",
        error.message +
          (error.message.includes("not enabled")
            ? " Enable this provider in Supabase Dashboard → Authentication → Providers."
            : ""),
      );
      return;
    }
    router.replace("/(app)/(tabs)/home");
    setLoading(false);
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
    const result = isSignup
      ? await signUpWithEmail(email.trim(), password.trim(), fullName.trim())
      : await signInWithEmail(email.trim(), password.trim());
    if (result.error) {
      setLoading(false);
      Alert.alert("Error", result.error.message);
      return;
    }
    if (result.requiresConfirmation) {
      setLoading(false);
      setIsSignup(false);
      Alert.alert(
        "Check your email",
        "We sent you a confirmation link. Click it to activate your account, then log in below.",
        [{ text: "OK" }],
      );
      return;
    }
    // Navigate immediately so UI feels responsive; session is already set in AuthProvider
    router.replace("/(app)/(tabs)/home");
    setLoading(false);
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
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#fff" }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerClassName="grow justify-center"
        contentContainerStyle={scrollContentStyle}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={formStyle}>
        {/* Logo accent */}
        <View style={{ alignItems: "center", marginBottom: 8 }}>
          <Image
            source={require("../../assets/icon.png")}
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
            }}
          />
        </View>

        <Text
          style={{ textAlign: "center", fontSize: 28, fontWeight: "800", color: "#111827", marginBottom: 6 }}
          accessibilityRole="header"
        >
          Welcome to Beautonomi
        </Text>
        <Text style={{ textAlign: "center", fontSize: 15, color: "#6B7280", marginBottom: 28 }}>
          {t("auth.login")} or {t("auth.signup").toLowerCase()} to continue
        </Text>

        {otpSent ? (
          <>
            <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 }}>
              {t("auth.verifyCode")}
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

            <TouchableOpacity
              onPress={handleVerifyOtp}
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
              accessibilityLabel="Verify code"
              accessibilityState={{ disabled: loading }}
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
            >
              <Text style={{ textAlign: "center", fontSize: 14, color: "#6B7280" }}>
                Use different number
              </Text>
            </TouchableOpacity>
          </>
        ) : showEmailForm ? (
          <>
            <Text style={{ textAlign: "center", fontSize: 18, fontWeight: "700", color: "#111827", marginBottom: 20 }}>
              {isSignup ? "Create account" : "Log in with email"}
            </Text>

            {isSignup && (
              <>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 }}>
                  Full Name
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
                accessibilityLabel="Email address"
              />
            </View>

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
                style={{ flex: 1, paddingVertical: 14, paddingHorizontal: 10, fontSize: 15, color: "#111827" }}
                placeholder={isSignup ? "Min. 8 characters" : "Your password"}
                placeholderTextColor="#9CA3AF"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoComplete={isSignup ? "new-password" : "current-password"}
                accessibilityLabel="Password"
              />
              <TouchableOpacity
                onPress={() => setShowPassword((v) => !v)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={handleEmailSubmit}
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

            {!isSignup && (
              <TouchableOpacity
                onPress={() => router.push("/(auth)/forgot-password" as never)}
                style={{ paddingVertical: 8 }}
                accessibilityRole="link"
              >
                <Text style={{ textAlign: "center", fontSize: 14, color: PRIMARY, fontWeight: "600" }}>
                  Forgot your password?
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              onPress={() => setIsSignup(!isSignup)}
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
              onPress={() => { setShowEmailForm(false); setEmail(""); setPassword(""); setFullName(""); }}
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
            {/* Phone input with country code */}
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
              />
            </View>
            {phoneError ? (
              <Text style={{ fontSize: 12, color: "#EF4444", marginBottom: 8 }}>{phoneError}</Text>
            ) : null}

            <Text style={{ fontSize: 12, color: "#6B7280", marginBottom: 20, lineHeight: 18 }}>
              We&apos;ll send you a verification code. Standard rates apply.{" "}
              <Text
                style={{ fontWeight: "600", color: "#111827", textDecorationLine: "underline" }}
                onPress={() => Linking.openURL(`${APP_URL}/privacy-policy`)}
              >
                Privacy Policy
              </Text>
            </Text>

            <TouchableOpacity
              onPress={handleSendOtp}
              disabled={loading}
              style={{
                backgroundColor: PRIMARY,
                borderRadius: 12,
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

            {/* Separator */}
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 24 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: "#E5E7EB" }} />
              <Text style={{ marginHorizontal: contentPadding, fontSize: 13, color: "#9CA3AF" }}>or</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: "#E5E7EB" }} />
            </View>

            {/* Social login */}
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
              <Ionicons name="logo-apple" size={20} color="#000" />
              <Text style={{ fontSize: 15, color: "#111827", fontWeight: "500" }}>Continue with Apple</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setShowEmailForm(true)}
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
              accessibilityLabel="Continue with email"
            >
              <Ionicons name="mail-outline" size={20} color="#6B7280" style={{ marginRight: 10 }} />
              <Text style={{ fontSize: 15, color: "#111827", fontWeight: "500" }}>Continue with email</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleOAuth("facebook")}
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
              accessibilityLabel="Continue with Facebook"
            >
              <Ionicons name="logo-facebook" size={20} color="#1877F2" style={{ marginRight: 10 }} />
              <Text style={{ fontSize: 15, color: "#111827", fontWeight: "500" }}>Continue with Facebook</Text>
            </TouchableOpacity>

            {/* Sign up link */}
            <View style={{ marginTop: 16 }}>
              <TouchableOpacity
                onPress={() => router.push("/(auth)/signup")}
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
  );
}
