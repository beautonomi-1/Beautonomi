import { useState, useRef, useCallback } from "react";
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
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { Colors } from "@/constants/colors";
import { useResponsive } from "@/hooks/useResponsive";
import { useAuth } from "@/providers/AuthProvider";
import { api } from "@/lib/api-client";
import { useTranslation, SIGNUP_SOURCE_OPTIONS } from "@beautonomi/i18n";
import {
  COUNTRY_CODES,
  stripLeadingZero,
  validateNationalPhoneDigits,
} from "@/lib/phone-country-codes";
import { getDeviceDefaultCountryDial } from "@/lib/phone";
import { APP_URL } from "@/config/public-env";
import { supabase } from "@/lib/supabase/client";

const PRIMARY = Colors.primary;
const PENDING_SIGNUP_SOURCE_KEY = "beautonomi_pending_signup_source";
const PRIMARY_LIGHT = "rgba(255,0,119,0.06)";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

export default function SignupScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { contentMaxWidth, isTablet, screenPadding } = useResponsive();
  const { signUpWithEmail } = useAuth();
  const formNarrow = isTablet || Platform.OS === "web";
  const formStyle = formNarrow ? { width: "100%" as const, maxWidth: Math.min(420, contentMaxWidth), alignSelf: "center" as const } : { width: "100%" as const };
  const scrollContentStyle = { flexGrow: 1, padding: screenPadding, paddingBottom: 48, ...(formNarrow ? { alignItems: "center" as const } : {}) };

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState(getDeviceDefaultCountryDial);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [signupSource, setSignupSource] = useState<string | null>(null);
  const [showSignupSourcePicker, setShowSignupSourcePicker] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);

  const selectedCountry = COUNTRY_CODES.find((c) => c.code === countryCode);
  const filteredCountries = countrySearch
    ? COUNTRY_CODES.filter((c) => c.label.toLowerCase().includes(countrySearch.toLowerCase()))
    : COUNTRY_CODES;

  const strength = getPasswordStrength(password);

  const handlePhoneChange = useCallback(
    (text: string) => {
      const digits = text.replace(/[^\d\s]/g, "");
      setPhone(digits);
      if (digits.replace(/\s/g, "").length > 0) {
        setPhoneError(validateNationalPhoneDigits(digits, countryCode));
      } else {
        setPhoneError(null);
      }
    },
    [countryCode],
  );

  function validate(): string | null {
    if (!fullName.trim()) return "Full name is required";
    if (!email.trim() || !EMAIL_RE.test(email.trim()))
      return "Please enter a valid email address";
    if (password.length < 8)
      return "Password must be at least 8 characters";
    if (strength.score < 2)
      return "Please choose a stronger password (add uppercase, numbers, or symbols)";
    if (phone.trim()) {
      const phoneErr = validateNationalPhoneDigits(phone, countryCode);
      if (phoneErr) return phoneErr;
    }
    if (!agreedToTerms) {
      return "Confirm you agree to the Terms of Service, Privacy Policy, and Cookie Policy.";
    }
    return null;
  }

  async function handleSignup() {
    setFormError(null);
    setFormSuccess(null);
    const validationError = validate();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    const cleanPhone = stripLeadingZero(phone.replace(/\D/g, ""));
    const fullPhone = cleanPhone ? `${countryCode}${cleanPhone}` : undefined;

    setLoading(true);
    try {
      const result = await signUpWithEmail(email.trim(), password, {
        full_name: fullName.trim(),
        phone: fullPhone,
      });
      setLoading(false);

      if (result.error) {
        setFormError(result.error.message);
        return;
      }

      if (result.requiresConfirmation) {
        if (signupSource) AsyncStorage.setItem(PENDING_SIGNUP_SOURCE_KEY, signupSource).catch(() => {});
        setFormSuccess(
          "We've sent a confirmation link to your email. Please confirm to activate your account, then log in.",
        );
        setTimeout(() => router.replace("/(auth)/login" as never), 3000);
        return;
      }

      if (signupSource) {
        api.patch("/api/me/profile", { signup_source: signupSource }).catch(() => {});
      }
      // Same entry as email login: root index runs portal check + profile → onboarding or dashboard.
      await supabase.auth.getSession();
      router.replace("/" as never);
    } catch (e: any) {
      setLoading(false);
      setFormError(e?.message ?? "Sign up failed. Please try again.");
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
            <Ionicons name="sparkles" size={28} color={PRIMARY} />
          </View>
        </View>

        <Text
          style={{ textAlign: "center", fontSize: 28, fontWeight: "800", color: "#111827", marginBottom: 6 }}
          accessibilityRole="header"
        >
          Create Account
        </Text>
        <Text style={{ textAlign: "center", fontSize: 15, color: "#6B7280", marginBottom: 28 }}>
          Join Beautonomi as a beauty professional
        </Text>

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

        {/* Full Name */}
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
            placeholder="Jane Doe"
            placeholderTextColor="#9CA3AF"
            value={fullName}
            onChangeText={setFullName}
            autoCapitalize="words"
            returnKeyType="next"
            onSubmitEditing={() => emailRef.current?.focus()}
          />
        </View>

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
            ref={emailRef}
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
            marginBottom: 4,
          }}
        >
          <Ionicons name="lock-closed-outline" size={18} color="#9CA3AF" />
          <TextInput
            ref={passwordRef}
            style={{ flex: 1, paddingVertical: 14, paddingHorizontal: 10, fontSize: 15, color: "#111827" }}
            placeholder="Min. 8 characters"
            placeholderTextColor="#9CA3AF"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            returnKeyType="next"
            onSubmitEditing={() => phoneRef.current?.focus()}
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

        {/* Password strength */}
        {password.length > 0 && (
          <View style={{ marginBottom: 16, marginTop: 6 }}>
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
        {password.length === 0 && <View style={{ height: 16 }} />}

        {/* Phone with country code */}
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
            marginBottom: phoneError ? 4 : 20,
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
            ref={phoneRef}
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
            returnKeyType="done"
          />
        </View>
        {phoneError ? (
          <Text style={{ fontSize: 12, color: "#EF4444", marginBottom: 16 }}>{phoneError}</Text>
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
            borderWidth: 1.5,
            borderColor: "#E5E7EB",
            borderRadius: 12,
            backgroundColor: "#FAFAFA",
            paddingHorizontal: 14,
            paddingVertical: 14,
            marginBottom: 20,
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

        <View style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 16, paddingVertical: 4 }}>
          <TouchableOpacity
            onPress={() => setAgreedToTerms(!agreedToTerms)}
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              borderWidth: 1.5,
              borderColor: agreedToTerms ? PRIMARY : "#D1D5DB",
              backgroundColor: agreedToTerms ? PRIMARY : "#fff",
              alignItems: "center",
              justifyContent: "center",
              marginRight: 10,
              marginTop: 2,
            }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: agreedToTerms }}
            accessibilityLabel="Agree to Terms of Service, Privacy Policy, and Cookie Policy"
          >
            {agreedToTerms ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
          </TouchableOpacity>
          <Text style={{ flex: 1, fontSize: 12, color: "#6B7280", lineHeight: 18 }}>
            I agree to the{" "}
            <Text style={{ color: PRIMARY, fontWeight: "600", textDecorationLine: "underline" }} onPress={() => router.push("/(auth)/terms" as never)}>
              Terms of Service
            </Text>
            ,{" "}
            <Text style={{ color: PRIMARY, fontWeight: "600", textDecorationLine: "underline" }} onPress={() => router.push("/(auth)/privacy" as never)}>
              Privacy Policy
            </Text>
            , and{" "}
            <Text
              style={{ color: PRIMARY, fontWeight: "600", textDecorationLine: "underline" }}
              onPress={() => Linking.openURL(`${APP_URL.replace(/\/$/, "")}/cookie-policy`).catch(() => {})}
            >
              Cookie Policy
            </Text>
            , including cookies and similar technologies, how we process personal data, and (while signed in) product analytics and limited session replay.
          </Text>
        </View>

        {/* Sign Up Button */}
        <TouchableOpacity
          onPress={handleSignup}
          disabled={loading || !agreedToTerms}
          style={{
            backgroundColor: PRIMARY,
            borderRadius: 12,
            paddingVertical: 16,
            alignItems: "center",
            opacity: loading || !agreedToTerms ? 0.7 : 1,
            marginBottom: 16,
          }}
          accessibilityRole="button"
          accessibilityLabel="Create account"
          accessibilityState={{ disabled: loading || !agreedToTerms }}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>Create Account</Text>
          )}
        </TouchableOpacity>

        {/* OR divider */}
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 16 }}>
          <View style={{ flex: 1, height: 1, backgroundColor: "#E5E7EB" }} />
          <Text style={{ marginHorizontal: 16, fontSize: 13, color: "#9CA3AF" }}>Or sign up with phone</Text>
          <View style={{ flex: 1, height: 1, backgroundColor: "#E5E7EB" }} />
        </View>

        <TouchableOpacity
          onPress={() => router.push("/(auth)/login" as never)}
          style={{
            borderWidth: 1.5,
            borderColor: PRIMARY,
            borderRadius: 12,
            paddingVertical: 14,
            alignItems: "center",
            marginBottom: 24,
          }}
          accessibilityRole="button"
          accessibilityLabel="Sign up with phone number"
        >
          <Text style={{ color: PRIMARY, fontSize: 15, fontWeight: "600" }}>Use Phone Number</Text>
        </TouchableOpacity>

        {/* Login link */}
        <TouchableOpacity
          onPress={() => router.push("/(auth)/login" as never)}
          accessibilityRole="link"
          accessibilityLabel="Go to login screen"
        >
          <Text style={{ textAlign: "center", fontSize: 14, color: "#6B7280" }}>
            Already have an account?{" "}
            <Text style={{ fontWeight: "700", color: PRIMARY }}>Log In</Text>
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
                paddingHorizontal: screenPadding,
                borderBottomWidth: 1,
                borderColor: "#F9FAFB",
              }}
            >
              <Text style={{ flex: 1, fontSize: 15, color: !signupSource ? PRIMARY : "#111827", fontWeight: !signupSource ? "700" : "400" }}>
                {t("auth.signupSourceSkip")}
              </Text>
              {!signupSource && <Ionicons name="checkmark-circle" size={20} color={PRIMARY} />}
            </TouchableOpacity>
            <FlatList<{ value: string; labelKey: string }>
              data={SIGNUP_SOURCE_OPTIONS}
              keyExtractor={(o: { value: string }) => o.value}
              renderItem={({ item: opt }: { item: { value: string; labelKey: string } }) => (
                <TouchableOpacity
                  onPress={() => {
                    setSignupSource(opt.value);
                    setShowSignupSourcePicker(false);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 14,
                    paddingHorizontal: screenPadding,
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
  );
}
