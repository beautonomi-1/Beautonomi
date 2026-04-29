/**
 * Customer post-signup onboarding wizard — 6 steps.
 *
 * Step 1 — Preferred name     (required)
 * Step 2 — Profile photo      (skippable)
 * Step 3 — Date of birth      (skippable)
 * Step 4 — Phone + OTP        (required unless already verified)
 * Step 5 — Home address       (required unless address exists)
 * Step 6 — Beauty preferences (skippable)
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import { useAuth } from "@/providers/AuthProvider";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { DEFAULT_AUTH } from "@/lib/config-bundle";
import { useImagePicker } from "@/hooks/useImagePicker";
import { supabase } from "@/lib/supabase/client";
import { Colors } from "@/constants/colors";
import { RADIUS_BUTTON, RADIUS_CARD, RADIUS_INPUT, SCREEN_PADDING } from "@/constants/layout";
import { PhoneInputWithCountry } from "@/components/PhoneInputWithCountry";
import { OtpDigitRow } from "@/components/OtpDigitRow";
import { getDeviceDefaultCountryDial } from "@/lib/device-default-country-dial";
import { appendFormDataFileNative } from "@beautonomi/utils";
import { parsePhoneToCountryAndNational } from "@/constants/phone";
import {
  normalizeSupabaseAuthPhone,
  normalizeSupabaseSmsOtpToken,
  isCompleteOtpForLength,
} from "@/lib/supabase-sms-otp";
import { resolvePostLoginHref } from "@/lib/post-login-href";
import { consumePostOnboardingHref } from "@/lib/post-onboarding-redirect";
import { AddressPicker, type AddressPickerSelection } from "@/components/AddressPicker";
import { StaticMapImage } from "@/components/StaticMapImage";

/* ── Constants ── */
export const ONBOARDING_DONE_KEY = "customer_onboarding_done_v1";
export function onboardingDoneKey(uid?: string | null): string {
  return uid ? `${ONBOARDING_DONE_KEY}:${uid}` : ONBOARDING_DONE_KEY;
}
const TOTAL_STEPS = 6;
const PRIMARY = Colors.primary;

const HAIR_TYPES = [
  "Natural / Afro",
  "Relaxed / Permed",
  "Locs / Dreadlocks",
  "Braids / Weaves",
  "Short / Tapered",
  "Wavy",
  "Straight",
  "Curly",
  "Other",
] as const;

const SKIN_TYPES = ["Oily", "Dry", "Combination", "Normal", "Sensitive"] as const;

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const currentYear = new Date().getFullYear();
const BIRTH_YEARS = Array.from({ length: 88 }, (_, i) => String(currentYear - 13 - i));

/* ── Helpers ── */
function buildDob(year: string, month: string, day: string): string | null {
  if (!year || !month || !day) return null;
  const m = String(MONTHS.indexOf(month) + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

function parseDob(dob: string): { year: string; month: string; day: string } {
  const [y, m, d] = (dob || "").split("-");
  return {
    year: y || "",
    month: m ? MONTHS[parseInt(m, 10) - 1] || "" : "",
    day: d ? String(parseInt(d, 10)) : "",
  };
}

/* ── Step dots ── */
function StepDots({ total, current }: { total: number; current: number }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "center", gap: 6, marginBottom: 8 }}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={{
            height: 6,
            width: i + 1 === current ? 20 : 6,
            borderRadius: 3,
            backgroundColor: i + 1 <= current ? PRIMARY : "#E2E8F0",
          }}
        />
      ))}
    </View>
  );
}

/* ── Section label ── */
function SectionLabel({ children, required }: { children: ReactNode; required?: boolean }) {
  return (
    <Text style={{ fontSize: 13, fontWeight: "600", color: "#334155", marginBottom: 6 }}>
      {children}
      {required && <Text style={{ color: PRIMARY }}> *</Text>}
    </Text>
  );
}

/* ────────────────────────────────────────────────────────────
   Main component
──────────────────────────────────────────────────────────── */
export default function CustomerOnboarding() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { refreshSession, user } = useAuth();
  const { bundle: configBundle } = useConfigBundle();
  const tenantRegionName = configBundle?.meta?.tenant_region?.name?.trim();
  const authPolicy = configBundle?.auth ?? DEFAULT_AUTH;
  const smsOtpLen = authPolicy.sms_otp_length;
  const smsOtpExpirySec = authPolicy.sms_otp_expiration_seconds;
  const { pickWithOptions, loading: pickLoading } = useImagePicker();

  const [step, setStep] = useState(1);
  const [initializing, setInitializing] = useState(true);
  const [saving, setSaving] = useState(false);

  /* Step 1 */
  const [preferredName, setPreferredName] = useState("");

  /* Step 2 */
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [avatarFileName, setAvatarFileName] = useState("avatar.jpg");
  const [avatarMimeType, setAvatarMimeType] = useState("image/jpeg");

  /* Step 3 */
  const [dobYear, setDobYear] = useState("");
  const [dobMonth, setDobMonth] = useState("");
  const [dobDay, setDobDay] = useState("");
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showDayPicker, setShowDayPicker] = useState(false);

  /* Step 4 */
  const [phoneCountryCode, setPhoneCountryCode] = useState(getDeviceDefaultCountryDial);
  const [phoneNational, setPhoneNational] = useState("");
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [pendingPhoneE164, setPendingPhoneE164] = useState("");
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [countdown, setCountdown] = useState(0);

  /* Step 5 */
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("South Africa");
  const [alreadyHasAddress, setAlreadyHasAddress] = useState(false);
  const [addressPickerOpen, setAddressPickerOpen] = useState(false);
  /** Set when user picks from search, map pin, or current location */
  const [addressLatitude, setAddressLatitude] = useState<number | null>(null);
  const [addressLongitude, setAddressLongitude] = useState<number | null>(null);

  /* Step 6 */
  const [hairTypes, setHairTypes] = useState<string[]>([]);
  const [skinType, setSkinType] = useState("");

  /* ── Countdown timer ── */
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [countdown]);

  /* Default country from tenant when config loads (only if user hasn’t changed from initial SA) */
  useEffect(() => {
    if (!tenantRegionName) return;
    setCountry((c) => (c === "South Africa" ? tenantRegionName : c));
  }, [tenantRegionName]);

  /* ── Init: prefill from profile ── */
  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const oc = await api.get<{ completed?: boolean }>("/api/me/onboarding/complete");
        if (cancelled) return;
        if (!oc.error && oc.data?.completed === true) {
          await AsyncStorage.setItem(onboardingDoneKey(user?.id), "1");
          const pending = await consumePostOnboardingHref();
          router.replace(pending ? resolvePostLoginHref(pending) : "/(app)/(tabs)/home");
          return;
        }

        const [profileRes, addrRes, prefsRes] = await Promise.allSettled([
          api.get<any>("/api/me/profile"),
          api.get<any>("/api/me/addresses"),
          api.get<any>("/api/me/beauty-preferences"),
        ]);

        if (cancelled) return;

        if (profileRes.status === "fulfilled" && !profileRes.value?.error) {
          const p = profileRes.value?.data;
          const pname = p?.preferred_name || "";
          const fullFirst = (p?.full_name || "").split(" ")[0] || "";
          setPreferredName(pname || fullFirst);
          if (p?.avatar_url) setAvatarUri(p.avatar_url);
          if (p?.date_of_birth) {
            const parsed = parseDob(p.date_of_birth);
            setDobYear(parsed.year);
            setDobMonth(parsed.month);
            setDobDay(parsed.day);
          }
          if (p?.phone) {
            const { countryCode, national } = parsePhoneToCountryAndNational(p.phone, getDeviceDefaultCountryDial());
            setPhoneCountryCode(countryCode);
            setPhoneNational(national);
          }
          if (p?.phone_verified) setPhoneVerified(true);
        }

        if (addrRes.status === "fulfilled" && !addrRes.value?.error) {
          const addrs = addrRes.value?.data;
          if (Array.isArray(addrs) && addrs.length > 0) setAlreadyHasAddress(true);
        }

        if (prefsRes.status === "fulfilled" && !prefsRes.value?.error) {
          const prefs = prefsRes.value?.data;
          if (prefs?.hair_type) {
            setHairTypes(Array.isArray(prefs.hair_type) ? prefs.hair_type : [prefs.hair_type]);
          }
          if (prefs?.skin_type) setSkinType(prefs.skin_type);
        }
      } catch {}

      if (!cancelled) setInitializing(false);
    }
    init();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Step validation ── */
  const validateStep = useCallback((): string | null => {
    if (step === 1 && !preferredName.trim()) return "Please enter your preferred name to continue.";
    if (step === 4) {
      if (!phoneVerified) return "You must verify your phone number to continue.";
    }
    if (step === 5) {
      if (!alreadyHasAddress) {
        if (!addressLine1.trim()) return "Street address is required.";
        if (!city.trim()) return "City is required.";
        if (!country.trim()) return "Country is required.";
      }
    }
    return null;
  }, [step, preferredName, phoneVerified, alreadyHasAddress, addressLine1, city, country]);

  /* ── Phone OTP ── */
  const handleSendOtp = async () => {
    const digits = phoneNational.replace(/\D/g, "");
    const e164Raw = `${phoneCountryCode}${digits}`;
    const e164 = normalizeSupabaseAuthPhone(e164Raw.startsWith("+") ? e164Raw : `+${e164Raw}`);
    if (e164.replace(/\D/g, "").length < 10) {
      Alert.alert("Invalid number", "Please enter a valid phone number.");
      return;
    }
    setOtpSending(true);
    try {
      const { error } = await supabase.auth.updateUser({ phone: e164 });
      if (error) throw error;
      setPendingPhoneE164(e164);
      setOtpCode("");
      setOtpSent(true);
      setCountdown(smsOtpExpirySec);
      Alert.alert(
        "Code sent",
        `Enter the ${smsOtpLen}-digit code we sent to your phone. Valid for ~${Math.max(1, Math.round(smsOtpExpirySec / 60))} min.`
      );
    } catch (e: unknown) {
      Alert.alert("Failed", (e as { message?: string })?.message ?? "Could not send code. Try again.");
    } finally {
      setOtpSending(false);
    }
  };

  const handleVerifyOtp = async (codeOverride?: string) => {
    const token = normalizeSupabaseSmsOtpToken(codeOverride ?? otpCode);
    if (!pendingPhoneE164 || !isCompleteOtpForLength(token, smsOtpLen)) {
      Alert.alert("Invalid code", `Enter the ${smsOtpLen}-digit code from your SMS.`);
      return;
    }
    setOtpVerifying(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        phone: normalizeSupabaseAuthPhone(pendingPhoneE164),
        token,
        type: "phone_change",
      });
      if (error) throw error;
      // Use dedicated verify endpoint — reads Supabase's phone_confirmed_at server-side
      const verifyRes = await api.post("/api/me/phone/verify", {
        phone: normalizeSupabaseAuthPhone(pendingPhoneE164),
      });
      if (verifyRes.error) {
        throw new Error(getApiErrorMessage(verifyRes.error, "Could not verify phone on server."));
      }
      setPhoneVerified(true);
    } catch (e: unknown) {
      Alert.alert("Verification failed", (e as { message?: string })?.message ?? "Invalid or expired code.");
    } finally {
      setOtpVerifying(false);
    }
  };

  /* ── Photo picker ── */
  const applyAddressSelection = useCallback((sel: AddressPickerSelection) => {
    const s = sel.structured;
    if (s) {
      setAddressLine1(s.address_line1);
      setAddressLine2((s.address_line2 ?? "").trim());
      setCity(s.city && s.city !== "—" ? s.city : "");
      setProvince(s.state ?? "");
      setPostalCode(s.postal_code ?? "");
      if (s.country?.trim()) setCountry(s.country.trim());
    }
    setAddressLatitude(sel.latitude);
    setAddressLongitude(sel.longitude);
    setAddressPickerOpen(false);
  }, []);

  const handlePickPhoto = useCallback(async () => {
    const res = await pickWithOptions();
    if (!res) return;
    setAvatarUri(res.uri);
    setAvatarFileName(res.fileName || "avatar.jpg");
    setAvatarMimeType(res.mimeType?.trim() || "image/jpeg");
  }, [pickWithOptions]);

  /* ── Save step data to API ── */
  const saveStep = async (): Promise<boolean> => {
    try {
      switch (step) {
        case 1: {
          const res = await api.patch("/api/me/profile", { preferred_name: preferredName.trim() });
          if (res.error) throw new Error(getApiErrorMessage(res.error, "Could not save name"));
          break;
        }
        case 2:
          if (avatarUri && !avatarUri.startsWith("http")) {
            const fd = new FormData();
            appendFormDataFileNative(fd, "file", {
              uri: avatarUri,
              name: avatarFileName,
              type: avatarMimeType || "image/jpeg",
            });
            const res = await api.post<{ url?: string }>("/api/me/avatar", fd);
            if (res.error) throw new Error(getApiErrorMessage(res.error, "Upload failed"));
            const url = res.data?.url;
            if (url) {
              const patchRes = await api.patch("/api/me/profile", { avatar_url: url });
              if (patchRes.error) throw new Error(getApiErrorMessage(patchRes.error, "Could not save avatar"));
            }
          }
          break;
        case 3: {
          const dob = buildDob(dobYear, dobMonth, dobDay);
          if (dob) {
            const res = await api.patch("/api/me/profile", { date_of_birth: dob });
            if (res.error) throw new Error(getApiErrorMessage(res.error, "Could not save date of birth"));
          }
          break;
        }
        case 4:
          // Phone already saved during OTP verification
          break;
        case 5:
          if (!alreadyHasAddress && addressLine1.trim() && city.trim()) {
            const payload: Record<string, unknown> = {
              label: "Home",
              is_default: true,
              address_line1: addressLine1.trim(),
              address_line2: addressLine2.trim() || null,
              city: city.trim(),
              state: province.trim() || null,
              postal_code: postalCode.trim() || null,
              country: country.trim() || tenantRegionName || "South Africa",
            };
            if (addressLatitude != null && addressLongitude != null) {
              payload.latitude = addressLatitude;
              payload.longitude = addressLongitude;
            }
            const res = await api.post("/api/me/addresses", payload);
            if (res.error) throw new Error(getApiErrorMessage(res.error, "Could not save address"));
            setAlreadyHasAddress(true);
          }
          break;
        case 6:
          if (hairTypes.length > 0 || skinType) {
            const res = await api.patch("/api/me/beauty-preferences", {
              hair_type: hairTypes.length > 0 ? hairTypes : null,
              skin_type: skinType || null,
            });
            if (res.error) throw new Error(getApiErrorMessage(res.error, "Could not save preferences"));
          }
          break;
      }
      return true;
    } catch (e) {
      Alert.alert("Error", getApiErrorMessage(e, "Failed to save. Please try again."));
      return false;
    }
  };

  const handleContinue = async () => {
    const err = validateStep();
    if (err) { Alert.alert("Required", err); return; }
    setSaving(true);
    const ok = await saveStep();
    setSaving(false);
    if (!ok) return;
    if (step < TOTAL_STEPS) {
      setStep((s) => s + 1);
    } else {
      await completeOnboarding();
    }
  };

  const handleSkip = async () => {
    if (step < TOTAL_STEPS) {
      setStep((s) => s + 1);
    } else {
      await completeOnboarding();
    }
  };

  const completeOnboarding = async () => {
    setSaving(true);
    try {
      const res = await api.post("/api/me/onboarding/complete");
      if (res.error) {
        Alert.alert("Couldn't complete setup", res.error.message || "Please try again.");
        return;
      }
      await AsyncStorage.setItem(onboardingDoneKey(user?.id), "1");
      await refreshSession();
      api.post("/api/me/analytics/identify").catch(() => {});
    } catch {
      Alert.alert("Network error", "Could not complete setup. Please check your connection and try again.");
      return;
    } finally {
      setSaving(false);
    }
    const pending = await consumePostOnboardingHref();
    router.replace(pending ? resolvePostLoginHref(pending) : "/(app)/(tabs)/home");
  };

  /* ────────────────────────────────
     Rendering
  ──────────────────────────────── */

  if (initializing) {
    return (
      <LinearGradient colors={["#FFF5F9", "#FFFFFF"]} style={{ flex: 1 }}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={PRIMARY} size="large" />
          <Text style={{ marginTop: 14, fontSize: 14, color: "#64748B", fontWeight: "500" }}>Setting things up…</Text>
        </View>
      </LinearGradient>
    );
  }

  const canSkip = step !== 1 && step !== 4 && step !== 5;
  const isLastStep = step === TOTAL_STEPS;

  return (
    <LinearGradient colors={["#FFF8FB", "#FFFFFF", "#FAFBFC"]} locations={[0, 0.35, 1]} style={{ flex: 1, paddingTop: insets.top }}>
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: SCREEN_PADDING, paddingVertical: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: "800", color: PRIMARY, letterSpacing: -0.5 }}>Beautonomi</Text>
          <Text style={{ fontSize: 12, color: "#94A3B8", marginTop: 2, fontWeight: "500" }}>Let&apos;s personalize your experience</Text>
        </View>
        {canSkip && (
          <TouchableOpacity onPress={handleSkip} disabled={saving} hitSlop={8}>
            <Text style={{ fontSize: 14, color: "#94A3B8", fontWeight: "600" }}>Skip</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Progress */}
      <View style={{ paddingHorizontal: SCREEN_PADDING }}>
        <StepDots total={TOTAL_STEPS} current={step} />
        <Text style={{ textAlign: "center", fontSize: 12, color: "#94A3B8", marginBottom: 4, fontWeight: "500" }}>
          Step {step} of {TOTAL_STEPS}
        </Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : Platform.OS === "android" ? "height" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: SCREEN_PADDING, paddingBottom: insets.bottom + 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Step 1: Name ── */}
          {step === 1 && (
            <View style={{ marginTop: 24 }}>
              <StepIcon name="person" />
              <StepTitle title="What should we call you?" subtitle="This is how you'll appear to beauty providers" />
              <View
                style={{
                  alignSelf: "center",
                  backgroundColor: PRIMARY + "14",
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 999,
                  marginBottom: 18,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: "600", color: PRIMARY }}>About 2 minutes · You can skip optional steps</Text>
              </View>
              <SectionLabel required>Preferred name</SectionLabel>
              <TextInput
                value={preferredName}
                onChangeText={setPreferredName}
                placeholder="e.g. Nolo"
                autoFocus
                style={inputStyle}
                placeholderTextColor="#94A3B8"
              />
              <Text style={hintStyle}>Can be a first name, nickname, or whatever you prefer.</Text>
            </View>
          )}

          {/* ── Step 2: Photo — single picker flow matches personal-info (no double system dialogs) */}
          {step === 2 && (
            <View style={{ marginTop: 24, alignItems: "center" }}>
              <StepIcon name="camera" />
              <StepTitle title="Add a profile photo" subtitle="Help providers recognise you. You can always update later." />
              <Pressable
                onPress={() => void handlePickPhoto()}
                disabled={pickLoading}
                style={{ alignItems: "center", opacity: pickLoading ? 0.65 : 1 }}
              >
                <View
                  style={{
                    width: 120,
                    height: 120,
                    borderRadius: 60,
                    overflow: "hidden",
                    backgroundColor: "#F1F5F9",
                    borderWidth: 2,
                    borderColor: PRIMARY + "30",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {avatarUri ? (
                    <Image source={{ uri: avatarUri }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
                  ) : (
                    <Ionicons name="camera-outline" size={40} color={PRIMARY + "80"} />
                  )}
                </View>
                <Text style={{ marginTop: 14, fontSize: 15, fontWeight: "600", color: "#334155" }}>
                  {pickLoading ? "Opening…" : avatarUri ? "Change photo" : "Tap to add a photo"}
                </Text>
                <Text style={[hintStyle, { marginTop: 6, textAlign: "center", paddingHorizontal: 12 }]}>
                  Camera or photo library · Optional · JPEG, PNG or WebP · max 5 MB
                </Text>
              </Pressable>
            </View>
          )}

          {/* ── Step 3: Birthday ── */}
          {step === 3 && (
            <View style={{ marginTop: 24 }}>
              <StepIcon name="gift" />
              <StepTitle title="When's your birthday?" subtitle="Used for birthday perks and age-appropriate recommendations" />
              <View style={{ flexDirection: "row", gap: 10 }}>
                {/* Day */}
                <View style={{ flex: 1 }}>
                  <SectionLabel>Day</SectionLabel>
                  <TouchableOpacity onPress={() => { setShowDayPicker(true); setShowMonthPicker(false); setShowYearPicker(false); }} style={pickerTriggerStyle}>
                    <Text style={{ color: dobDay ? "#1E293B" : "#94A3B8", fontSize: 15 }}>{dobDay || "--"}</Text>
                    <Ionicons name="chevron-down" size={16} color="#94A3B8" />
                  </TouchableOpacity>
                </View>
                {/* Month */}
                <View style={{ flex: 2 }}>
                  <SectionLabel>Month</SectionLabel>
                  <TouchableOpacity onPress={() => { setShowMonthPicker(true); setShowDayPicker(false); setShowYearPicker(false); }} style={pickerTriggerStyle}>
                    <Text style={{ color: dobMonth ? "#1E293B" : "#94A3B8", fontSize: 15 }}>{dobMonth || "Month"}</Text>
                    <Ionicons name="chevron-down" size={16} color="#94A3B8" />
                  </TouchableOpacity>
                </View>
                {/* Year */}
                <View style={{ flex: 1.5 }}>
                  <SectionLabel>Year</SectionLabel>
                  <TouchableOpacity onPress={() => { setShowYearPicker(true); setShowDayPicker(false); setShowMonthPicker(false); }} style={pickerTriggerStyle}>
                    <Text style={{ color: dobYear ? "#1E293B" : "#94A3B8", fontSize: 15 }}>{dobYear || "Year"}</Text>
                    <Ionicons name="chevron-down" size={16} color="#94A3B8" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Inline pickers */}
              {showDayPicker && (
                <ScrollPickerList
                  items={Array.from({ length: 31 }, (_, i) => String(i + 1))}
                  selected={dobDay}
                  onSelect={(v) => { setDobDay(v); setShowDayPicker(false); }}
                />
              )}
              {showMonthPicker && (
                <ScrollPickerList
                  items={MONTHS}
                  selected={dobMonth}
                  onSelect={(v) => { setDobMonth(v); setShowMonthPicker(false); }}
                />
              )}
              {showYearPicker && (
                <ScrollPickerList
                  items={BIRTH_YEARS}
                  selected={dobYear}
                  onSelect={(v) => { setDobYear(v); setShowYearPicker(false); }}
                />
              )}
              <Text style={[hintStyle, { marginTop: 10 }]}>You must be at least 13 years old to use Beautonomi.</Text>
            </View>
          )}

          {/* ── Step 4: Phone + OTP ── */}
          {step === 4 && (
            <View style={{ marginTop: 24 }}>
              <StepIcon name="phone-portrait" />
              <StepTitle title="Add your phone number" subtitle="Required for booking confirmations and house-call services" />

              {phoneVerified ? (
                <View style={{ alignItems: "center", paddingVertical: 24 }}>
                  <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: "#D1FAE5", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                    <Ionicons name="checkmark" size={28} color="#059669" />
                  </View>
                  <Text style={{ fontSize: 16, fontWeight: "700", color: "#1E293B" }}>Phone verified</Text>
                  <Text style={{ fontSize: 13, color: "#64748B", marginTop: 4 }}>{pendingPhoneE164 || `${phoneCountryCode}${phoneNational}`}</Text>
                </View>
              ) : (
                <>
                  <SectionLabel required>Mobile number</SectionLabel>
                  <PhoneInputWithCountry
                    countryCode={phoneCountryCode}
                    nationalValue={phoneNational}
                    onCountryCodeChange={setPhoneCountryCode}
                    onNationalChange={(v) => { setPhoneNational(v); setOtpSent(false); setOtpCode(""); }}
                    placeholder="082 123 4567"
                  />
                  <TouchableOpacity
                    onPress={handleSendOtp}
                    disabled={otpSending || countdown > 0 || !phoneNational.trim()}
                    style={{
                      marginTop: 12, backgroundColor: otpSending || countdown > 0 ? "#E2E8F0" : PRIMARY,
                      borderRadius: RADIUS_BUTTON, paddingVertical: 14, alignItems: "center",
                    }}
                  >
                    {otpSending ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={{ color: countdown > 0 ? "#94A3B8" : "#fff", fontWeight: "600", fontSize: 15 }}>
                        {countdown > 0
                          ? `Resend in ${Math.floor(countdown / 60)}:${String(countdown % 60).padStart(2, "0")}`
                          : otpSent ? "Resend code" : "Send verification code"}
                      </Text>
                    )}
                  </TouchableOpacity>

                  {otpSent && (
                    <View style={{ marginTop: 20 }}>
                      <SectionLabel required>Enter {smsOtpLen}-digit code</SectionLabel>
                      <OtpDigitRow
                        length={smsOtpLen}
                        value={otpCode}
                        onChange={setOtpCode}
                        onComplete={(code) => {
                          if (!otpVerifying && isCompleteOtpForLength(code, smsOtpLen)) void handleVerifyOtp(code);
                        }}
                        disabled={otpVerifying || phoneVerified}
                      />
                      <TouchableOpacity
                        onPress={() => void handleVerifyOtp()}
                        disabled={!isCompleteOtpForLength(otpCode, smsOtpLen) || otpVerifying || phoneVerified}
                        style={{
                          marginTop: 12, backgroundColor: PRIMARY, borderRadius: RADIUS_BUTTON,
                          paddingVertical: 14, alignItems: "center",
                          opacity: !isCompleteOtpForLength(otpCode, smsOtpLen) || otpVerifying ? 0.5 : 1,
                        }}
                      >
                        {otpVerifying ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <Text style={{ color: "#fff", fontWeight: "600", fontSize: 15 }}>Verify</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Required notice */}
                  <View style={{ flexDirection: "row", gap: 8, backgroundColor: "#FFFBEB", borderRadius: RADIUS_CARD, padding: 12, marginTop: 16 }}>
                    <Ionicons name="alert-circle-outline" size={16} color="#D97706" style={{ marginTop: 1 }} />
                    <Text style={{ flex: 1, fontSize: 12, color: "#92400E", lineHeight: 18 }}>
                      Phone verification is required to continue and to make bookings.
                    </Text>
                  </View>
                </>
              )}
            </View>
          )}

          {/* ── Step 5: Address ── */}
          {step === 5 && (
            <View style={{ marginTop: 24 }}>
              <StepIcon name="location" />
              <StepTitle title="Where are you based?" subtitle="Used for house-call bookings and finding services near you" />

              <AddressPicker
                visible={addressPickerOpen}
                onClose={() => setAddressPickerOpen(false)}
                onSelect={applyAddressSelection}
                onUseCurrentLocation={() => {}}
                initialQuery={addressLine1.trim() || undefined}
              />

              {alreadyHasAddress && (
                <View style={{ flexDirection: "row", gap: 8, backgroundColor: "#F0FDF4", borderRadius: RADIUS_CARD, padding: 12, marginBottom: 16 }}>
                  <Ionicons name="checkmark-circle" size={16} color="#16A34A" style={{ marginTop: 1 }} />
                  <Text style={{ flex: 1, fontSize: 13, color: "#166534", lineHeight: 18 }}>
                    You already have a saved address. You can add another below, or continue.
                  </Text>
                </View>
              )}

              {!alreadyHasAddress && (
                <>
                  <TouchableOpacity
                    onPress={() => setAddressPickerOpen(true)}
                    activeOpacity={0.85}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 10,
                      backgroundColor: PRIMARY + "12",
                      borderWidth: 1.5,
                      borderColor: PRIMARY + "55",
                      borderRadius: RADIUS_BUTTON,
                      paddingVertical: 14,
                      paddingHorizontal: 16,
                      marginBottom: 16,
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Search for your address, drop a pin on the map, or use current location"
                  >
                    <Ionicons name="map-outline" size={22} color={PRIMARY} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: "700", color: "#0F172A" }}>Find on map</Text>
                      <Text style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
                        Search, drop a pin, or use current location — same as when you book
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={PRIMARY} />
                  </TouchableOpacity>

                  {addressLatitude != null && addressLongitude != null && Number.isFinite(addressLatitude) && Number.isFinite(addressLongitude) && (
                    <View style={{ marginBottom: 14 }}>
                      <SectionLabel>Map preview</SectionLabel>
                      <StaticMapImage
                        latitude={addressLatitude}
                        longitude={addressLongitude}
                        width={Math.max(280, windowWidth - SCREEN_PADDING * 2)}
                        height={152}
                        borderRadius={12}
                      />
                      <Text style={[hintStyle, { marginTop: 6 }]}>
                        Pin shows the saved location for distances and directions. Edit the fields below if needed.
                      </Text>
                    </View>
                  )}
                </>
              )}

              <SectionLabel required={!alreadyHasAddress}>Street address</SectionLabel>
              <TextInput
                value={addressLine1}
                onChangeText={(t) => {
                  setAddressLine1(t);
                  if (!t.trim()) {
                    setAddressLatitude(null);
                    setAddressLongitude(null);
                  }
                }}
                placeholder="e.g. 12 Main Street — or open Find on map above"
                style={inputStyle}
                placeholderTextColor="#94A3B8"
              />

              <SectionLabel>Apartment, suite, unit (optional)</SectionLabel>
              <TextInput
                value={addressLine2}
                onChangeText={setAddressLine2}
                placeholder="e.g. Unit 4B, Estate name"
                style={inputStyle}
                placeholderTextColor="#94A3B8"
              />

              <SectionLabel required={!alreadyHasAddress}>City</SectionLabel>
              <TextInput
                value={city}
                onChangeText={setCity}
                placeholder="e.g. Cape Town"
                style={inputStyle}
                placeholderTextColor="#94A3B8"
              />

              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <SectionLabel>Province</SectionLabel>
                  <TextInput value={province} onChangeText={setProvince} placeholder="Gauteng" style={inputStyle} placeholderTextColor="#94A3B8" />
                </View>
                <View style={{ flex: 1 }}>
                  <SectionLabel>Postal code</SectionLabel>
                  <TextInput value={postalCode} onChangeText={setPostalCode} placeholder="0001" keyboardType="numeric" style={inputStyle} placeholderTextColor="#94A3B8" />
                </View>
              </View>

              <SectionLabel required={!alreadyHasAddress}>Country</SectionLabel>
              <TextInput
                value={country}
                onChangeText={setCountry}
                placeholder={tenantRegionName || "Country"}
                style={inputStyle}
                placeholderTextColor="#94A3B8"
              />

              {!alreadyHasAddress && (
                <View style={{ flexDirection: "row", gap: 8, backgroundColor: "#FFFBEB", borderRadius: RADIUS_CARD, padding: 12, marginTop: 8 }}>
                  <Ionicons name="alert-circle-outline" size={16} color="#D97706" style={{ marginTop: 1 }} />
                  <Text style={{ flex: 1, fontSize: 12, color: "#92400E", lineHeight: 18 }}>
                    An address is required for house-call bookings. Only shared with providers when you book a visit.
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* ── Step 6: Beauty preferences ── */}
          {step === 6 && (
            <View style={{ marginTop: 24 }}>
              <StepIcon name="sparkles" />
              <StepTitle title="Your beauty profile" subtitle="We'll personalise service recommendations just for you" />

              <SectionLabel>Hair type (select all that apply)</SectionLabel>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
                {HAIR_TYPES.map((h) => {
                  const active = hairTypes.includes(h);
                  return (
                    <Pressable
                      key={h}
                      onPress={() =>
                        setHairTypes((prev) =>
                          prev.includes(h) ? prev.filter((x) => x !== h) : [...prev, h]
                        )
                      }
                      style={{
                        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99,
                        borderWidth: 1,
                        borderColor: active ? PRIMARY : "#E2E8F0",
                        backgroundColor: active ? PRIMARY : "#fff",
                      }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: "500", color: active ? "#fff" : "#475569" }}>{h}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <SectionLabel>Skin type</SectionLabel>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {SKIN_TYPES.map((s) => {
                  const active = skinType === s;
                  return (
                    <Pressable
                      key={s}
                      onPress={() => setSkinType(active ? "" : s)}
                      style={{
                        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99,
                        borderWidth: 1,
                        borderColor: active ? PRIMARY : "#E2E8F0",
                        backgroundColor: active ? PRIMARY : "#fff",
                      }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: "500", color: active ? "#fff" : "#475569" }}>{s}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {/* ── Actions ── */}
          <View style={{ marginTop: 32, gap: 12 }}>
            <TouchableOpacity
              onPress={handleContinue}
              disabled={saving}
              style={{
                backgroundColor: PRIMARY,
                borderRadius: RADIUS_BUTTON,
                paddingVertical: 16,
                alignItems: "center",
                opacity: saving ? 0.7 : 1,
                shadowColor: PRIMARY,
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.28,
                shadowRadius: 14,
                elevation: 6,
              }}
            >
              {saving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>
                  {isLastStep ? "Finish" : "Continue"}
                </Text>
              )}
            </TouchableOpacity>

            {canSkip && (
              <TouchableOpacity onPress={handleSkip} disabled={saving} style={{ alignItems: "center", paddingVertical: 8 }}>
                <Text style={{ fontSize: 14, color: "#94A3B8" }}>{isLastStep ? "Skip and finish" : "Skip for now"}</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

/* ── Sub-components ── */

function StepIcon({ name }: { name: string }) {
  return (
    <View style={{ alignItems: "center", marginBottom: 12 }}>
      <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: Colors.primary + "18", alignItems: "center", justifyContent: "center" }}>
        <Ionicons name={name as any} size={28} color={Colors.primary} />
      </View>
    </View>
  );
}

function StepTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={{ alignItems: "center", marginBottom: 24 }}>
      <Text style={{ fontSize: 22, fontWeight: "800", color: "#0F172A", textAlign: "center", marginBottom: 6 }}>{title}</Text>
      <Text style={{ fontSize: 14, color: "#64748B", textAlign: "center", lineHeight: 20 }}>{subtitle}</Text>
    </View>
  );
}

function ScrollPickerList({
  items,
  selected,
  onSelect,
}: {
  items: readonly string[];
  selected: string;
  onSelect: (v: string) => void;
}) {
  return (
    <View style={{ maxHeight: 200, borderWidth: 1, borderColor: "#E2E8F0", borderRadius: RADIUS_CARD, marginTop: 8, overflow: "hidden" }}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {items.map((item) => (
          <TouchableOpacity
            key={item}
            onPress={() => onSelect(item)}
            style={{
              paddingVertical: 12, paddingHorizontal: 16,
              backgroundColor: selected === item ? Colors.primary + "12" : "#fff",
              borderBottomWidth: 1, borderBottomColor: "#F1F5F9",
            }}
          >
            <Text style={{ fontSize: 15, color: selected === item ? Colors.primary : "#334155", fontWeight: selected === item ? "600" : "400" }}>
              {item}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const inputStyle = {
  borderWidth: 1,
  borderColor: "#E2E8F0",
  borderRadius: RADIUS_INPUT,
  paddingHorizontal: 14,
  paddingVertical: 13,
  fontSize: 15,
  color: "#1E293B",
  backgroundColor: "#FAFAFA",
  marginBottom: 14,
};

const pickerTriggerStyle = {
  borderWidth: 1,
  borderColor: "#E2E8F0",
  borderRadius: RADIUS_INPUT,
  paddingHorizontal: 12,
  paddingVertical: 13,
  flexDirection: "row" as const,
  alignItems: "center" as const,
  justifyContent: "space-between" as const,
  backgroundColor: "#FAFAFA",
  marginBottom: 8,
};

const hintStyle = {
  fontSize: 12,
  color: "#94A3B8",
  marginTop: -8,
  marginBottom: 16,
  lineHeight: 16,
};
