import { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Linking,
  Modal,
  Pressable,
  FlatList,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { Colors } from "@/constants/colors";
import { APP_URL } from "@/config/public-env";
import { haptic } from "@/lib/haptics";

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

export default function SignupScreen() {
  useScreenTracking("Signup");
  const { signUpWithEmail, signInWithOAuth } = useAuth();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState("+27");
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
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
    if (!agreedToTerms) newErrors.terms = "You must agree to the terms";
    if (phone.trim()) {
      const pErr = validatePhone(phone, countryCode);
      if (pErr) newErrors.phone = pErr;
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSignup() {
    if (!validate()) return;
    haptic.medium();
    setLoading(true);
    try {
      const result = await signUpWithEmail(email.trim(), password.trim(), fullName.trim());
      if (result.error) {
        Alert.alert("Signup Failed", result.error.message);
        return;
      }
      if (result.requiresConfirmation) {
        haptic.success();
        Alert.alert(
          "Check Your Email",
          "We've sent a confirmation link to your email. Please confirm to activate your account.",
          [{ text: "OK", onPress: () => router.replace("/(auth)/login") }],
        );
        return;
      }
      haptic.success();
      router.replace("/(app)/(tabs)/home");
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleOAuth(provider: "google" | "apple" | "facebook") {
    haptic.light();
    setLoading(true);
    const { error } = await signInWithOAuth(provider);
    setLoading(false);
    if (error) {
      Alert.alert("Sign Up Failed", error.message);
    }
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-white"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={Platform.OS === "web" ? { padding: 24, paddingBottom: 48, alignItems: "center" } : { padding: 24, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={Platform.OS === "web" ? { width: "100%", maxWidth: 420, alignSelf: "center" } as any : { width: "100%" }}>
        {/* Back button */}
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: "#F3F4F6",
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
        <Text style={{ fontSize: 26, fontWeight: "800", color: "#111827", marginBottom: 6 }}>
          Create Your Account
        </Text>
        <Text style={{ fontSize: 15, color: "#6B7280", marginBottom: 24 }}>
          Join Beautonomi and discover the best beauty services near you
        </Text>

        {/* Social signup */}
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

        {Platform.OS === "ios" && (
          <TouchableOpacity
            onPress={() => handleOAuth("apple")}
            disabled={loading}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              borderRadius: 12,
              paddingVertical: 14,
              marginBottom: 12,
              backgroundColor: "#000",
            }}
            accessibilityRole="button"
            accessibilityLabel="Continue with Apple"
          >
            <Ionicons name="logo-apple" size={20} color="#fff" />
            <Text style={{ fontSize: 15, color: "#fff", fontWeight: "500" }}>Continue with Apple</Text>
          </TouchableOpacity>
        )}

        {/* Divider */}
        <View style={{ flexDirection: "row", alignItems: "center", marginVertical: 20 }}>
          <View style={{ flex: 1, height: 1, backgroundColor: "#E5E7EB" }} />
          <Text style={{ marginHorizontal: 16, fontSize: 13, color: "#9CA3AF" }}>or sign up with email</Text>
          <View style={{ flex: 1, height: 1, backgroundColor: "#E5E7EB" }} />
        </View>

        {/* Full Name */}
        <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 }}>
          Full Name
        </Text>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            borderWidth: 1.5,
            borderColor: errors.fullName ? "#EF4444" : "#E5E7EB",
            borderRadius: 12,
            backgroundColor: "#FAFAFA",
            paddingHorizontal: 14,
            marginBottom: errors.fullName ? 4 : 16,
          }}
        >
          <Ionicons name="person-outline" size={18} color="#9CA3AF" />
          <TextInput
            style={{ flex: 1, paddingVertical: 14, paddingHorizontal: 10, fontSize: 15, color: "#111827" }}
            placeholder="Your full name"
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
            borderWidth: 1.5,
            borderColor: errors.email ? "#EF4444" : "#E5E7EB",
            borderRadius: 12,
            backgroundColor: "#FAFAFA",
            paddingHorizontal: 14,
            marginBottom: errors.email ? 4 : 16,
          }}
        >
          <Ionicons name="mail-outline" size={18} color="#9CA3AF" />
          <TextInput
            ref={emailRef}
            style={{ flex: 1, paddingVertical: 14, paddingHorizontal: 10, fontSize: 15, color: "#111827" }}
            placeholder="you@example.com"
            placeholderTextColor="#9CA3AF"
            value={email}
            onChangeText={(v) => { setEmail(v); setErrors((p) => ({ ...p, email: "" })); }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
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
            borderWidth: 1.5,
            borderColor: errors.password ? "#EF4444" : "#E5E7EB",
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
            onChangeText={(v) => { setPassword(v); setErrors((p) => ({ ...p, password: "" })); }}
            secureTextEntry={!showPassword}
            autoComplete="new-password"
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
            <View style={{ flexDirection: "row", gap: 4, marginBottom: 4 }}>
              {[1, 2, 3, 4].map((i) => (
                <View
                  key={i}
                  style={{
                    flex: 1,
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: strength.score >= i ? strength.color : "#E5E7EB",
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
            borderWidth: 1.5,
            borderColor: errors.confirmPassword ? "#EF4444" : "#E5E7EB",
            borderRadius: 12,
            backgroundColor: "#FAFAFA",
            paddingHorizontal: 14,
            marginBottom: errors.confirmPassword ? 4 : 16,
          }}
        >
          <Ionicons name="lock-closed-outline" size={18} color="#9CA3AF" />
          <TextInput
            ref={confirmRef}
            style={{ flex: 1, paddingVertical: 14, paddingHorizontal: 10, fontSize: 15, color: "#111827" }}
            placeholder="Repeat password"
            placeholderTextColor="#9CA3AF"
            value={confirmPassword}
            onChangeText={(v) => { setConfirmPassword(v); setErrors((p) => ({ ...p, confirmPassword: "" })); }}
            secureTextEntry={!showPassword}
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
            borderWidth: 1.5,
            borderColor: phoneError || errors.phone ? "#EF4444" : "#E5E7EB",
            borderRadius: 12,
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
              gap: 4,
            }}
          >
            <Text style={{ fontSize: 18 }}>{selectedCountry?.flag ?? "🌍"}</Text>
            <Text style={{ fontSize: 15, fontWeight: "600", color: "#111827" }}>{countryCode}</Text>
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
            accessibilityLabel="Phone number, optional"
          />
        </View>
        {(phoneError || errors.phone) ? (
          <Text style={{ fontSize: 12, color: "#EF4444", marginBottom: 12 }}>{phoneError || errors.phone}</Text>
        ) : null}

        {/* Terms checkbox */}
        <TouchableOpacity
          onPress={() => { setAgreedToTerms(!agreedToTerms); setErrors((p) => ({ ...p, terms: "" })); }}
          style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 20 }}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: agreedToTerms }}
        >
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              borderWidth: 1.5,
              borderColor: agreedToTerms ? PRIMARY : errors.terms ? "#EF4444" : "#D1D5DB",
              backgroundColor: agreedToTerms ? PRIMARY : "#fff",
              alignItems: "center",
              justifyContent: "center",
              marginTop: 1,
            }}
          >
            {agreedToTerms && <Ionicons name="checkmark" size={14} color="#fff" />}
          </View>
          <Text style={{ marginLeft: 10, flex: 1, fontSize: 13, color: "#6B7280", lineHeight: 20 }}>
            I agree to the{" "}
            <Text
              style={{ fontWeight: "600", color: "#111827", textDecorationLine: "underline" }}
              onPress={() => Linking.openURL(`${APP_URL}/terms-and-condition`)}
            >
              Terms of Service
            </Text>{" "}
            and{" "}
            <Text
              style={{ fontWeight: "600", color: "#111827", textDecorationLine: "underline" }}
              onPress={() => Linking.openURL(`${APP_URL}/privacy-policy`)}
            >
              Privacy Policy
            </Text>
          </Text>
        </TouchableOpacity>
        {errors.terms ? <Text style={{ fontSize: 12, color: "#EF4444", marginTop: -12, marginBottom: 16 }}>{errors.terms}</Text> : null}

        {/* Submit */}
        <TouchableOpacity
          onPress={handleSignup}
          disabled={loading}
          style={{
            backgroundColor: PRIMARY,
            borderRadius: 12,
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
                    paddingHorizontal: 16,
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
