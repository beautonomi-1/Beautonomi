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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
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
  const router = useRouter();
  const { signUpWithEmail } = useAuth();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState("+27");
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

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
        setPhoneError(validatePhone(digits, countryCode));
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
      const phoneErr = validatePhone(phone, countryCode);
      if (phoneErr) return phoneErr;
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
        setFormSuccess(
          "We've sent a confirmation link to your email. Please confirm to activate your account, then log in.",
        );
        setTimeout(() => router.replace("/(auth)/login" as never), 3000);
        return;
      }

      router.replace("/(app)/onboarding" as never);
    } catch (e: any) {
      setLoading(false);
      setFormError(e?.message ?? "Sign up failed. Please try again.");
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

        <Text style={{ fontSize: 12, color: "#6B7280", marginBottom: 16, textAlign: "center" }}>
          By creating an account you agree to our{" "}
          <Text
            style={{ color: PRIMARY, fontWeight: "600", textDecorationLine: "underline" }}
            onPress={() => router.push("/(auth)/terms" as never)}
          >
            Terms of Service
          </Text>
          {" "}and{" "}
          <Text
            style={{ color: PRIMARY, fontWeight: "600", textDecorationLine: "underline" }}
            onPress={() => router.push("/(auth)/privacy" as never)}
          >
            Privacy Policy
          </Text>
          .
        </Text>

        {/* Sign Up Button */}
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
