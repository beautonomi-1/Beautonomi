/**
 * My Profile – personal information, address, plan, contact support.
 * Native provider profile management.
 * Email/phone changes require Supabase OTP verification.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Pressable,
  ActivityIndicator,
  Modal,
  FlatList,
  useWindowDimensions,
  AppState,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { api } from "@/lib/api-client";
import { supabase } from "@/lib/supabase/client";
import {
  COUNTRY_CODES,
  type CountryCodeOption,
  splitPhoneForNationalInput,
  composeE164FromNational,
  validateNationalPhoneDigits,
} from "@/lib/phone-country-codes";
import { getDeviceDefaultCountryDial } from "@/lib/phone";
import {
  normalizeSupabaseAuthPhone,
  normalizeSupabaseSmsOtpToken,
  isCompleteSupabaseSmsOtp,
  SUPABASE_AUTH_OTP_LENGTH,
  SUPABASE_AUTH_SMS_OTP_EXPIRY_SECONDS,
} from "@/lib/supabase-sms-otp";
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { twStyle } from "@/lib/twStyle";
import { verticalFlatListPerf } from "@/lib/flatListPerformance";
import { OtpDigitRow } from "@/components/OtpDigitRow";
import { formatPhone } from "@/lib/format";
import { useProvider } from "@/providers/ProviderContext";
import { getApiErrorMessage, getApiErrorCode } from "@/lib/api-error";
import { isMailableEmail } from "@beautonomi/utils";
import { appendFormDataFileNative, countryFilterIso2FromStorage } from "@beautonomi/utils";
import { AddressAutocomplete } from "@/components/ui/AddressAutocomplete";
import { AddressMapPinModal } from "@/components/AddressMapPinModal";
import { StaticMapImage } from "@/components/ui/StaticMapImage";
import { reverseGeocodeCoordinates } from "@/lib/reverse-geocode-address";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { ensureForegroundLocationPermission } from "@/lib/native-permissions";
import { useImagePicker } from "@/hooks/useImagePicker";

const IMAGE_CONSTRAINTS = { maxSizeBytes: 2 * 1024 * 1024 }; // 2MB
const PRIMARY = Colors.primary;

interface ProfileData {
  email: string;
  phone: string;
  avatar_url: string | null;
  address: {
    line1: string;
    line2?: string;
    city: string;
    state?: string;
    postal_code?: string;
    country: string;
    latitude?: number | null;
    longitude?: number | null;
  } | null;
  plan?: string;
}

export default function ProfileScreen() {
  const router = useRouter();
  const { role } = useProvider();
  const canManageSubscription = role === "provider_owner" || role === "superadmin";
  const { screenPadding } = useResponsive();
  const { width: windowWidth } = useWindowDimensions();
  const { bundle } = useConfigBundle();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [plan, setPlan] = useState<string>("Free");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phoneStep, setPhoneStep] = useState<"enter" | "otp" | null>(null);
  const [emailStep, setEmailStep] = useState<"otp" | null>(null);
  const [pendingPhoneE164, setPendingPhoneE164] = useState("");
  const [pendingEmailForOtp, setPendingEmailForOtp] = useState("");
  const [phoneOtpCode, setPhoneOtpCode] = useState("");
  const [emailOtpCode, setEmailOtpCode] = useState("");
  const [sendingOtp, setSendingOtp] = useState(false);
  const [sendingEmailOtp, setSendingEmailOtp] = useState(false);
  const [locating, setLocating] = useState(false);
  const [mapPinVisible, setMapPinVisible] = useState(false);
  const deviceDefaultDialRef = useRef(getDeviceDefaultCountryDial());
  const [phoneCountryCode, setPhoneCountryCode] = useState(() => deviceDefaultDialRef.current);
  const [phoneNational, setPhoneNational] = useState("");
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const [phoneFieldError, setPhoneFieldError] = useState<string | null>(null);
  /** Last loaded phone from server (for “on file” line; updates after save / OTP). */
  const [savedPhoneForDisplay, setSavedPhoneForDisplay] = useState("");
  const [savedEmailForDisplay, setSavedEmailForDisplay] = useState("");
  const initialProfileRef = useRef<{ email: string; phone: string }>({ email: "", phone: "" });
  const canUseQuietRefresh = useRef(false);
  const { pickWithOptions } = useImagePicker();

  const tenantCountryFallback = useCallback(
    () => bundle?.meta?.tenant_region?.name?.trim() || "",
    [bundle?.meta?.tenant_region?.name],
  );

  const pinInitialCoordinate = useMemo(() => {
    const lat = profile?.address?.latitude;
    const lng = profile?.address?.longitude;
    if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
      return { latitude: lat, longitude: lng };
    }
    return null;
  }, [profile?.address?.latitude, profile?.address?.longitude]);

  const applyResolvedAddress = useCallback(
    (parts: {
      address_line1?: string;
      city?: string;
      state?: string;
      postal_code?: string;
      country?: string;
      latitude?: number | null;
      longitude?: number | null;
    }) => {
      setProfile((p) => {
        if (!p) return p;
        const prev = p.address ?? {
          line1: "",
          city: "",
          state: "",
          postal_code: "",
          country: "",
          latitude: null,
          longitude: null,
        };
        return {
          ...p,
          address: {
            ...prev,
            line1: parts.address_line1 ?? prev.line1,
            city: parts.city ?? prev.city,
            state: parts.state ?? prev.state,
            postal_code: parts.postal_code ?? prev.postal_code,
            country: (parts.country?.trim() || prev.country || tenantCountryFallback()) ?? "",
            latitude: parts.latitude ?? null,
            longitude: parts.longitude ?? null,
          },
        };
      });
    },
    [tenantCountryFallback],
  );

  const handleUseCurrentLocation = useCallback(async () => {
    if (locating) return;
    setLocating(true);
    try {
      const allowed = await ensureForegroundLocationPermission({
        title: "Location permission",
        message: "Allow location access to place a pin from your current position.",
      });
      if (!allowed) {
        return;
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest,
      });
      const lat = loc.coords.latitude;
      const lng = loc.coords.longitude;
      const defaultCountry =
        profile?.address?.country?.trim() ||
        tenantCountryFallback() ||
        "South Africa";
      const mapped = await reverseGeocodeCoordinates(lat, lng, defaultCountry);
      if (mapped) {
        applyResolvedAddress({
          address_line1: mapped.address_line1 || profile?.address?.line1 || "Current location",
          city: mapped.city || profile?.address?.city || "",
          state: mapped.state || "",
          postal_code: mapped.postal_code || "",
          country: mapped.country || defaultCountry,
          latitude: mapped.latitude,
          longitude: mapped.longitude,
        });
      } else {
        applyResolvedAddress({ latitude: lat, longitude: lng });
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {
      Alert.alert(
        "Location error",
        e instanceof Error ? e.message : "Could not fetch current location.",
      );
    } finally {
      setLocating(false);
    }
  }, [
    locating,
    profile?.address?.country,
    profile?.address?.line1,
    profile?.address?.city,
    tenantCountryFallback,
    applyResolvedAddress,
  ]);

  const handleDropPinConfirm = useCallback(
    async (lat: number, lng: number) => {
      const defaultCountry =
        profile?.address?.country?.trim() ||
        tenantCountryFallback() ||
        "South Africa";
      const mapped = await reverseGeocodeCoordinates(lat, lng, defaultCountry);
      if (mapped) {
        applyResolvedAddress({
          address_line1: mapped.address_line1,
          city: mapped.city,
          state: mapped.state,
          postal_code: mapped.postal_code,
          country: mapped.country,
          latitude: mapped.latitude,
          longitude: mapped.longitude,
        });
      } else {
        applyResolvedAddress({ latitude: lat, longitude: lng });
      }
      setMapPinVisible(false);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [profile?.address?.country, tenantCountryFallback, applyResolvedAddress],
  );

  const load = useCallback(async () => {
    const quiet = canUseQuietRefresh.current;
    if (!quiet) {
      setLoading(true);
      setError(null);
    }
    try {
      const [profileRes, subscriptionRes] = await Promise.all([
        api.get<Record<string, unknown>>("/api/me/profile"),
        api.get<Record<string, unknown> | null>("/api/provider/subscription").catch(() => ({ data: null, error: null })),
      ]);
      if (profileRes.error || !profileRes.data) {
        const code = profileRes.error ? getApiErrorCode(profileRes.error) : null;
        const transient = code === "CANCELLED" || code === "TIMEOUT" || code === "NETWORK_ERROR";
        if (quiet || transient) return;
        setError(
          typeof profileRes.error === "object" && profileRes.error && "message" in profileRes.error
            ? String((profileRes.error as { message: string }).message)
            : "Failed to load profile",
        );
        setProfile(null);
        return;
      }
      const data = profileRes.data as Record<string, unknown>;
      let planName = "Free";
      const subRaw = subscriptionRes?.data;
      const sub =
        subRaw && typeof subRaw === "object" && "plan_id" in (subRaw as object)
          ? (subRaw as { plan?: { name?: string }; plan_name?: string })
          : null;
      if (sub?.plan?.name) planName = String(sub.plan.name);
      else if (sub?.plan_name) planName = String(sub.plan_name);
      setPlan(planName);
      const loadedEmail = typeof data.email === "string" ? data.email : "";
      const loadedPhone = typeof data.phone === "string" ? data.phone : "";
      initialProfileRef.current = { email: loadedEmail, phone: loadedPhone };
      const { countryCode, nationalDisplay } = splitPhoneForNationalInput(
        loadedPhone,
        deviceDefaultDialRef.current,
      );
      setPhoneCountryCode(countryCode);
      setPhoneNational(nationalDisplay);
      setPhoneFieldError(null);
      setSavedPhoneForDisplay(loadedPhone || "");
      setSavedEmailForDisplay(loadedEmail || "");

      setProfile({
        email: loadedEmail,
        phone: loadedPhone,
        avatar_url: typeof data.avatar_url === "string" ? data.avatar_url : null,
        address: (() => {
          const a = data.address as Record<string, unknown> | null | undefined;
          if (!a || typeof a !== "object") {
            return {
              line1: "",
              city: "",
              state: "",
              postal_code: "",
              country: "",
              latitude: null,
              longitude: null,
            };
          }
          const lat =
            typeof a.latitude === "number"
              ? a.latitude
              : a.latitude != null && a.latitude !== ""
                ? Number(a.latitude)
                : null;
          const lng =
            typeof a.longitude === "number"
              ? a.longitude
              : a.longitude != null && a.longitude !== ""
                ? Number(a.longitude)
                : null;
          return {
            line1: (typeof a.line1 === "string" ? a.line1 : typeof a.street === "string" ? a.street : "") || "",
            line2: (typeof a.line2 === "string" ? a.line2 : typeof a.apt === "string" ? a.apt : "") || "",
            city: typeof a.city === "string" ? a.city : "",
            state: typeof a.state === "string" ? a.state : "",
            postal_code:
              (typeof a.postal_code === "string" ? a.postal_code : typeof a.zip === "string" ? a.zip : "") || "",
            country: typeof a.country === "string" ? a.country : "",
            latitude: lat != null && Number.isFinite(lat) ? lat : null,
            longitude: lng != null && Number.isFinite(lng) ? lng : null,
          };
        })(),
        plan: planName,
      });
      canUseQuietRefresh.current = true;
      if (!quiet) setError(null);
    } catch (e) {
      const code = getApiErrorCode(e);
      const transient = code === "CANCELLED" || code === "TIMEOUT" || code === "NETWORK_ERROR";
      if (quiet || transient) return;
      setError(e instanceof Error ? e.message : "Failed to load");
      setProfile(null);
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    canUseQuietRefresh.current = false;
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      if (canUseQuietRefresh.current) void load();
    }, [load]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active" && canUseQuietRefresh.current) {
        void load();
      }
    });
    return () => sub.remove();
  }, [load]);

  const selectedCountry = COUNTRY_CODES.find((c) => c.code === phoneCountryCode);
  const filteredCountries = countrySearch
    ? COUNTRY_CODES.filter((c) => c.label.toLowerCase().includes(countrySearch.toLowerCase()))
    : COUNTRY_CODES;

  const handlePhoneNationalChange = useCallback(
    (text: string) => {
      const digits = text.replace(/[^\d\s]/g, "");
      setPhoneNational(digits);
      if (digits.replace(/\s/g, "").length > 0) {
        setPhoneFieldError(validateNationalPhoneDigits(digits, phoneCountryCode));
      } else {
        setPhoneFieldError(null);
      }
    },
    [phoneCountryCode],
  );

  const phoneE164FromUi = useCallback((): string => {
    if (!phoneNational.trim()) return "";
    const composed = composeE164FromNational(phoneCountryCode, phoneNational);
    return composed ? normalizeSupabaseAuthPhone(composed) : "";
  }, [phoneCountryCode, phoneNational]);

  const uploadAvatar = useCallback(async () => {
    const picked = await pickWithOptions({ quality: 0.8, base64: false });
    if (!picked) return;
    if (picked.fileSize && picked.fileSize > IMAGE_CONSTRAINTS.maxSizeBytes) {
      Alert.alert("File too large", "Please choose an image under 2MB.");
      return;
    }
    setUploading(true);
    try {
      const uri = picked.uri;
      const name = picked.fileName || uri.split("/").pop() || "photo.jpg";
      const formData = new FormData();
      appendFormDataFileNative(formData, "file", {
        uri,
        name,
        type: picked.mimeType || "image/jpeg",
      });
      const res = await api.fetch<{ url?: string }>("/api/me/avatar", {
        method: "POST",
        body: formData,
      });
      const url = res.data?.url;
      if (res.error || !url) {
        Alert.alert("Upload failed", getApiErrorMessage(res.error, "Could not upload photo."));
        return;
      }
      const patchRes = await api.patch<{ data?: { avatar_url?: string } }>("/api/me/profile", { avatar_url: url });
      if (!patchRes.error) await load();
      else Alert.alert("Error", getApiErrorMessage(patchRes.error, "Failed to update profile."));
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }, [load, pickWithOptions]);

  const save = useCallback(async () => {
    if (!profile) return;
    if (phoneNational.trim()) {
      const pErr = validateNationalPhoneDigits(phoneNational, phoneCountryCode);
      if (pErr) {
        setPhoneFieldError(pErr);
        Alert.alert("Invalid phone", pErr);
        return;
      }
    }
    setPhoneFieldError(null);

    const newPhoneE164 = phoneE164FromUi();
    const oldPhoneE164 = normalizeSupabaseAuthPhone(initialProfileRef.current.phone?.trim() || "");
    const phoneChanged = newPhoneE164 !== "" && newPhoneE164 !== oldPhoneE164;
    const trimmedEmail = (profile.email ?? "").trim();
    const initialEmail = (initialProfileRef.current.email ?? "").trim();
    const emailChanged =
      trimmedEmail.length > 0 && trimmedEmail.toLowerCase() !== initialEmail.toLowerCase();

    if (emailChanged) {
      if (!isMailableEmail(trimmedEmail)) {
        Alert.alert("Invalid email", "Please enter a valid email address.");
        return;
      }
      setSendingEmailOtp(true);
      try {
        const { error: updateError } = await supabase.auth.updateUser({ email: trimmedEmail });
        if (updateError) throw updateError;
        setPendingEmailForOtp(trimmedEmail);
        setEmailOtpCode("");
        setEmailStep("otp");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("Code sent", `We sent a verification code to ${trimmedEmail}.`);
      } catch (e: unknown) {
        Alert.alert("Error", e instanceof Error ? e.message : "Failed to send code.");
      } finally {
        setSendingEmailOtp(false);
      }
      return;
    }

    if (phoneChanged) {
      setSendingOtp(true);
      try {
        const { error: updateError } = await supabase.auth.updateUser({
          phone: newPhoneE164,
        });
        if (updateError) throw updateError;
        setPendingPhoneE164(newPhoneE164);
        setPhoneOtpCode("");
        setPhoneStep("otp");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("Code sent", "We sent a verification code to your phone. Enter it below.");
      } catch (e: unknown) {
        Alert.alert("Error", e instanceof Error ? e.message : "Failed to send code.");
      } finally {
        setSendingOtp(false);
      }
      return;
    }

    setSaving(true);
    try {
      // §provider-profile-auth-fix 2026-05: only include `email` in the PATCH
      // payload when the user actually changed it. Always sending the current
      // email made the server call `supabase.auth.updateUser({ email })`,
      // which throws "Auth session missing" on the bearer-token-only client
      // even though the email wasn't being changed.
      const payload: Record<string, unknown> = {
        address: profile.address
          ? {
              line1: profile.address.line1,
              line2: profile.address.line2,
              city: profile.address.city,
              state: profile.address.state,
              postal_code: profile.address.postal_code,
              country: profile.address.country,
              latitude: profile.address.latitude ?? null,
              longitude: profile.address.longitude ?? null,
            }
          : undefined,
      };
      const res = await api.patch<{
        data?: {
          email?: string;
          phone?: string;
        };
      }>("/api/me/profile", payload);
      if (res.error) {
        Alert.alert("Error", getApiErrorMessage(res.error, "Failed to save."));
      } else {
        const raw = res.data;
        const data =
          raw && typeof raw === "object" && "data" in raw && raw.data != null && typeof raw.data === "object"
            ? (raw as { data: { email?: string; phone?: string } }).data
            : (raw as { email?: string; phone?: string } | undefined);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("Saved", "Your profile has been updated.");
        if (data?.email) {
          initialProfileRef.current.email = data.email;
          setSavedEmailForDisplay(data.email);
        }
        if (data?.phone) {
          initialProfileRef.current.phone = data.phone;
          setSavedPhoneForDisplay(data.phone);
        }
        load();
      }
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }, [profile, load, phoneNational, phoneCountryCode, phoneE164FromUi]);

  const verifyPhoneOtp = useCallback(async (otpOverride?: string) => {
    const token = normalizeSupabaseSmsOtpToken(otpOverride ?? phoneOtpCode);
    if (!pendingPhoneE164 || !isCompleteSupabaseSmsOtp(token)) return;
    setSaving(true);
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        phone: normalizeSupabaseAuthPhone(pendingPhoneE164),
        token,
        type: "phone_change",
      });
      if (verifyError) throw verifyError;
      const res = await api.patch<{ data?: { phone?: string } }>("/api/me/profile", {
        phone: normalizeSupabaseAuthPhone(pendingPhoneE164),
      });
      if (res.error) throw new Error(getApiErrorMessage(res.error, "Failed to save phone"));
      initialProfileRef.current.phone = normalizeSupabaseAuthPhone(pendingPhoneE164);
      setSavedPhoneForDisplay(normalizeSupabaseAuthPhone(pendingPhoneE164));
      setPhoneStep(null);
      setPendingPhoneE164("");
      setPhoneOtpCode("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Saved", "Your phone number has been updated.");
      load();
    } catch (e: unknown) {
      Alert.alert("Verification failed", e instanceof Error ? e.message : "Invalid code.");
    } finally {
      setSaving(false);
    }
  }, [phoneOtpCode, pendingPhoneE164, load]);

  const verifyEmailOtp = useCallback(async (otpOverride?: string) => {
    const token = normalizeSupabaseSmsOtpToken(otpOverride ?? emailOtpCode);
    if (!pendingEmailForOtp || !isCompleteSupabaseSmsOtp(token)) return;
    setSaving(true);
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: pendingEmailForOtp,
        token,
        type: "email_change",
      });
      if (verifyError) throw verifyError;
      const res = await api.post("/api/me/email/verify", { email: pendingEmailForOtp });
      if (res.error) throw new Error(getApiErrorMessage(res.error, "Failed to save email"));
      initialProfileRef.current.email = pendingEmailForOtp;
      setSavedEmailForDisplay(pendingEmailForOtp);
      setProfile((p) => (p ? { ...p, email: pendingEmailForOtp } : p));
      setEmailStep(null);
      setPendingEmailForOtp("");
      setEmailOtpCode("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Saved", "Your email address has been updated.");
      load();
    } catch (e: unknown) {
      Alert.alert("Verification failed", e instanceof Error ? e.message : "Invalid code.");
    } finally {
      setSaving(false);
    }
  }, [emailOtpCode, pendingEmailForOtp, load]);

  if (loading && !profile) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Profile" onBack={() => router.back()} />
        <View style={twStyle("flex-1 items-center justify-center")}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={twStyle("mt-3 text-gray-500")}>Loading profile…</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (error && !profile) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Profile" onBack={() => router.back()} />
        <View style={twStyle("flex-1 items-center justify-center px-6")}>
          <Text style={twStyle("text-center text-gray-600")}>{error}</Text>
          <TouchableOpacity onPress={load} style={twStyle("mt-4 rounded-xl bg-gray-900 px-6 py-3")}>
            <Text style={twStyle("font-medium text-white")}>Retry</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  if (!profile) return null;

  const getInitials = () => {
    const e = (profile.email || "").trim();
    if (e) return e.slice(0, 2).toUpperCase();
    return "?";
  };

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader title="Profile" subtitle="Manage your personal information" onBack={() => router.back()} />
      <ScrollView
        style={twStyle("flex-1")}
        contentContainerStyle={{ paddingBottom: 200 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={twStyle("px-2 pt-4")}>
          {/* Profile Picture */}
          <View style={twStyle("mb-6 rounded-2xl border border-gray-200 bg-white p-4")}>
            <Text style={twStyle("mb-3 text-sm font-semibold text-gray-900")}>Profile Picture</Text>
            <View style={twStyle("flex-row items-center")}>
              <Pressable onPress={uploadAvatar} disabled={uploading} style={{ marginRight: 16 }}>
                {profile.avatar_url ? (
                  <Image
                    source={{ uri: profile.avatar_url }}
                    style={{ width: 96, height: 96, borderRadius: 48 }}
                    contentFit="cover"
                  />
                ) : (
                  <View style={twStyle("h-24 w-24 items-center justify-center rounded-full bg-primary/10")}>
                    <Text style={twStyle("text-2xl font-medium text-primary")}>{getInitials()}</Text>
                  </View>
                )}
              </Pressable>
              <View style={twStyle("flex-1")}>
                <TouchableOpacity
                  onPress={uploadAvatar}
                  disabled={uploading}
                  style={twStyle("rounded-xl border border-gray-200 bg-white py-2.5 px-4")}
                >
                  {uploading ? (
                    <ActivityIndicator size="small" color={Colors.primary} />
                  ) : (
                    <Text style={twStyle("font-medium text-gray-900")}>Upload Photo</Text>
                  )}
                </TouchableOpacity>
                <Text style={twStyle("mt-1.5 text-xs text-gray-500")}>JPG, PNG or GIF. Max size 2MB</Text>
              </View>
            </View>
          </View>

          {/* Personal Information */}
          <View style={twStyle("mb-6 rounded-2xl border border-gray-200 bg-white p-4")}>
            <Text style={twStyle("mb-3 text-sm font-semibold text-gray-900")}>Personal Information</Text>
            <View>
              <View>
                <Text style={twStyle("mb-1 text-xs font-medium text-gray-500")}>Email</Text>
                {savedEmailForDisplay.trim() ? (
                  <Text style={twStyle("mb-2 text-sm text-gray-700")}>On file: {savedEmailForDisplay}</Text>
                ) : (
                  <Text style={twStyle("mb-2 text-sm text-gray-500")}>On file: none yet</Text>
                )}
                <TextInput
                  value={profile.email}
                  onChangeText={(email) => setProfile((p) => (p ? { ...p, email } : p))}
                  placeholder="Email"
                  placeholderTextColor="#9ca3af"
                  style={twStyle("rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <Text style={twStyle("mt-1 text-xs text-gray-500")}>
                  Changing your email sends a {SUPABASE_AUTH_OTP_LENGTH}-digit verification code.
                </Text>
              </View>
              <View style={{ marginTop: 12 }}>
                <Text style={twStyle("mb-1 text-xs font-medium text-gray-500")}>Phone</Text>
                {savedPhoneForDisplay.trim() ? (
                  <Text style={twStyle("mb-2 text-sm text-gray-700")}>
                    On file: {formatPhone(savedPhoneForDisplay)}
                  </Text>
                ) : (
                  <Text style={twStyle("mb-2 text-sm text-gray-500")}>On file: none yet</Text>
                )}
                <View
                  style={{
                    flexDirection: "row",
                    borderWidth: 1.5,
                    borderColor: phoneFieldError ? "#EF4444" : "#E5E7EB",
                    borderRadius: 12,
                    overflow: "hidden",
                  }}
                >
                  <TouchableOpacity
                    onPress={() => {
                      setShowCountryPicker(true);
                      setCountrySearch("");
                    }}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: "#F3F4F6",
                      paddingHorizontal: 12,
                      paddingVertical: 12,
                      borderRightWidth: 1,
                      borderRightColor: "#E5E7EB",
                    }}
                    accessibilityLabel="Select country code"
                    accessibilityRole="button"
                  >
                    <Text style={{ fontSize: 18, marginRight: 4 }}>{selectedCountry?.flag ?? "🌍"}</Text>
                    <Text style={{ fontSize: 15, fontWeight: "600", color: "#111827", marginRight: 4 }}>
                      {phoneCountryCode}
                    </Text>
                    <Ionicons name="chevron-down" size={14} color="#6B7280" />
                  </TouchableOpacity>
                  <TextInput
                    value={phoneNational}
                    onChangeText={handlePhoneNationalChange}
                    placeholder="82 123 4567"
                    placeholderTextColor="#9ca3af"
                    style={{
                      flex: 1,
                      backgroundColor: "#FAFAFA",
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      fontSize: 16,
                      color: "#111827",
                    }}
                    keyboardType="phone-pad"
                    accessibilityLabel="Phone number without country code"
                  />
                </View>
                <Text style={twStyle("mt-1 text-xs text-gray-500 leading-5")}>
                  Pick your country code, then enter the rest (leading 0 is optional). Changing your number sends a
                  verification code (E.164 for Supabase).
                </Text>
                {phoneFieldError ? (
                  <Text style={twStyle("mt-1 text-xs text-red-500")}>{phoneFieldError}</Text>
                ) : null}
              </View>
            </View>
          </View>

          {/* Address */}
          <View style={twStyle("mb-6 rounded-2xl border border-gray-200 bg-white p-4")}>
            <Text style={twStyle("mb-3 text-sm font-semibold text-gray-900")}>Address</Text>
            <View>
              <View>
                <Text style={twStyle("mb-1 text-xs font-medium text-gray-500")}>Address</Text>
                <Text style={twStyle("mb-2 text-xs text-gray-500 leading-5")}>
                  Search for an address to fill city, state, postal code and coordinates automatically, or type
                  manually.
                </Text>
                <AddressAutocomplete
                  value={profile.address?.line1 ?? ""}
                  onSelect={(addr) =>
                    applyResolvedAddress({
                      address_line1: addr.address_line1,
                      city: addr.city,
                      state: addr.state,
                      postal_code: addr.postal_code,
                      country: addr.country,
                      latitude: addr.latitude,
                      longitude: addr.longitude,
                    })
                  }
                  onBlur={(text) =>
                    setProfile((p) =>
                      p
                        ? {
                            ...p,
                            address: {
                              ...(p.address ?? {
                                line1: "",
                                city: "",
                                state: "",
                                postal_code: "",
                                country: "",
                                latitude: null,
                                longitude: null,
                              }),
                              line1: text,
                            },
                          }
                        : p,
                    )
                  }
                  placeholder="Street address or search…"
                  countryCode={
                    countryFilterIso2FromStorage(profile.address?.country ?? "") ?? "ZA"
                  }
                  defaultCountryName={profile.address?.country?.trim() || undefined}
                  proximity={
                    profile.address?.latitude != null &&
                    profile.address?.longitude != null &&
                    !(profile.address.latitude === 0 && profile.address.longitude === 0)
                      ? { latitude: profile.address.latitude, longitude: profile.address.longitude }
                      : undefined
                  }
                />
                <View
                  style={{
                    marginTop: 10,
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 8,
                  }}
                >
                  <TouchableOpacity
                    onPress={() => {
                      void handleUseCurrentLocation();
                    }}
                    disabled={locating}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: "#bfdbfe",
                      backgroundColor: "#eff6ff",
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                    }}
                    accessibilityLabel="Use current location"
                    accessibilityRole="button"
                  >
                    {locating ? (
                      <ActivityIndicator size="small" color="#2563eb" />
                    ) : (
                      <Ionicons name="locate-outline" size={16} color="#2563eb" />
                    )}
                    <Text
                      style={{
                        marginLeft: 6,
                        fontSize: 12,
                        fontWeight: "600",
                        color: "#1d4ed8",
                      }}
                    >
                      {locating ? "Locating…" : "Current location"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setMapPinVisible(true)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: "#e5e7eb",
                      backgroundColor: "#ffffff",
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                    }}
                    accessibilityLabel="Drop pin on map"
                    accessibilityRole="button"
                  >
                    <Ionicons name="map-outline" size={16} color="#374151" />
                    <Text
                      style={{
                        marginLeft: 6,
                        fontSize: 12,
                        fontWeight: "600",
                        color: "#374151",
                      }}
                    >
                      Drop pin on map
                    </Text>
                  </TouchableOpacity>
                </View>
                {profile.address?.latitude != null && profile.address?.longitude != null ? (
                  <View style={{ marginTop: 12, overflow: "hidden", borderRadius: 16 }}>
                    <StaticMapImage
                      latitude={profile.address.latitude}
                      longitude={profile.address.longitude}
                      width={Math.min(windowWidth - 48, 400)}
                      height={150}
                      zoom={15}
                    />
                    <Text
                      style={{
                        marginTop: 6,
                        fontSize: 12,
                        color: "#6b7280",
                        textAlign: "center",
                      }}
                    >
                      Map preview
                    </Text>
                  </View>
                ) : null}
              </View>
              <View style={{ marginTop: 12 }}>
                <Text style={twStyle("mb-1 text-xs font-medium text-gray-500")}>Country</Text>
                <TextInput
                  value={profile.address?.country ?? ""}
                  onChangeText={(country) =>
                    setProfile((p) =>
                      p ? { ...p, address: { ...p.address!, country } } : p
                    )
                  }
                  placeholder="Country"
                  placeholderTextColor="#9ca3af"
                  style={twStyle("rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
                />
              </View>
              <View style={{ marginTop: 12 }}>
                <Text style={twStyle("mb-1 text-xs font-medium text-gray-500")}>State/Province</Text>
                <TextInput
                  value={profile.address?.state ?? ""}
                  onChangeText={(state) =>
                    setProfile((p) =>
                      p ? { ...p, address: { ...p.address!, state } } : p
                    )
                  }
                  placeholder="State / Province"
                  placeholderTextColor="#9ca3af"
                  style={twStyle("rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
                />
              </View>
              <View style={{ marginTop: 12 }}>
                <Text style={twStyle("mb-1 text-xs font-medium text-gray-500")}>City</Text>
                <TextInput
                  value={profile.address?.city ?? ""}
                  onChangeText={(city) =>
                    setProfile((p) =>
                      p ? { ...p, address: { ...p.address!, city } } : p
                    )
                  }
                  placeholder="City"
                  placeholderTextColor="#9ca3af"
                  style={twStyle("rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
                />
              </View>
              <View style={{ marginTop: 12 }}>
                <Text style={twStyle("mb-1 text-xs font-medium text-gray-500")}>Zip/Postal Code</Text>
                <TextInput
                  value={profile.address?.postal_code ?? ""}
                  onChangeText={(postal_code) =>
                    setProfile((p) =>
                      p ? { ...p, address: { ...p.address!, postal_code } } : p
                    )
                  }
                  placeholder="Zip / Postal code"
                  placeholderTextColor="#9ca3af"
                  style={twStyle("rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
                  keyboardType="number-pad"
                />
              </View>
            </View>
          </View>

          {/* Plan */}
          <View style={twStyle("mb-6 rounded-2xl border border-gray-200 bg-white p-4")}>
            <Text style={twStyle("mb-3 text-sm font-semibold text-gray-900")}>Plan</Text>
            <View>
              <Text style={twStyle("mb-1 text-xs font-medium text-gray-500")}>Current plan</Text>
              <View style={twStyle("rounded-xl border border-gray-100 bg-gray-50 px-4 py-3")}>
                <Text style={twStyle("text-base text-gray-700")}>{plan}</Text>
              </View>
              {canManageSubscription ? (
                <TouchableOpacity
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push("/(app)/(tabs)/more/settings/subscription" as never);
                  }}
                  style={twStyle("mt-3 rounded-xl bg-gray-900 py-3 items-center")}
                  accessibilityLabel="Manage subscription and billing"
                  accessibilityRole="button"
                >
                  <Text style={twStyle("font-semibold text-white")}>Manage subscription & billing</Text>
                </TouchableOpacity>
              ) : (
                <Text style={twStyle("mt-2 text-xs text-gray-500")}>
                  Subscription changes are available to the business owner.
                </Text>
              )}
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push("/(app)/(tabs)/more/contact-support" as never);
                }}
                style={twStyle("mt-3")}
                accessibilityRole="button"
              >
                <Text style={twStyle("text-sm font-medium text-primary")}>Contact support</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            onPress={save}
            disabled={saving || sendingOtp}
            style={twStyle("rounded-xl bg-gray-900 py-3.5 items-center")}
          >
            {saving || sendingOtp || sendingEmailOtp ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={twStyle("font-semibold text-white")}>Save changes</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Email verification OTP modal */}
      <Modal
        visible={emailStep === "otp"}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setEmailStep(null)}
      >
        <View style={twStyle("flex-1 bg-white p-6 pt-12")}>
          <Text style={twStyle("text-lg font-semibold text-gray-900")}>Verify email address</Text>
          <Text style={twStyle("mt-2 text-sm text-gray-600")}>
            We sent a {SUPABASE_AUTH_OTP_LENGTH}-digit code to {pendingEmailForOtp}. Enter it below.
          </Text>
          <View style={twStyle("mt-4")}>
            <OtpDigitRow
              value={emailOtpCode}
              onChange={setEmailOtpCode}
              onComplete={(code) => {
                if (!saving && isCompleteSupabaseSmsOtp(code)) void verifyEmailOtp(code);
              }}
              disabled={saving}
              autoFocus
              accessibilityLabelPrefix="Email change verification code"
            />
          </View>
          <TouchableOpacity
            onPress={() => void verifyEmailOtp()}
            disabled={!isCompleteSupabaseSmsOtp(emailOtpCode) || saving}
            style={twStyle("mt-6 rounded-xl bg-gray-900 py-3.5 items-center")}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={twStyle("font-semibold text-white")}>Verify and save</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              setEmailStep(null);
              setPendingEmailForOtp("");
              setEmailOtpCode("");
              setProfile((p) =>
                p ? { ...p, email: initialProfileRef.current.email } : p,
              );
            }}
            style={twStyle("mt-4")}
          >
            <Text style={twStyle("text-sm font-medium text-primary")}>Wrong email? Go back</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Phone verification OTP modal */}
      <Modal
        visible={phoneStep === "otp"}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPhoneStep(null)}
      >
        <View style={twStyle("flex-1 bg-white p-6 pt-12")}>
          <Text style={twStyle("text-lg font-semibold text-gray-900")}>Verify phone number</Text>
          <Text style={twStyle("mt-2 text-sm text-gray-600")}>
            We sent a {SUPABASE_AUTH_OTP_LENGTH}-digit code to {pendingPhoneE164} (valid about{" "}
            {Math.max(1, Math.round(SUPABASE_AUTH_SMS_OTP_EXPIRY_SECONDS / 60))}{" "}
            {Math.round(SUPABASE_AUTH_SMS_OTP_EXPIRY_SECONDS / 60) === 1 ? "minute" : "minutes"}). Enter it below.
          </Text>
          <Text style={twStyle("mt-2 text-xs text-gray-500")}>
            Enter the {SUPABASE_AUTH_OTP_LENGTH}-digit code from your SMS
          </Text>
          <View style={twStyle("mt-4")}>
            <OtpDigitRow
              value={phoneOtpCode}
              onChange={setPhoneOtpCode}
              onComplete={(code) => {
                if (!saving && isCompleteSupabaseSmsOtp(code)) void verifyPhoneOtp(code);
              }}
              disabled={saving}
              autoFocus
              smsAutofill
              accessibilityLabelPrefix="Phone change verification code"
            />
          </View>
          <TouchableOpacity
            onPress={() => void verifyPhoneOtp()}
            disabled={!isCompleteSupabaseSmsOtp(phoneOtpCode) || saving}
            style={twStyle("mt-6 rounded-xl bg-gray-900 py-3.5 items-center")}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={twStyle("font-semibold text-white")}>Verify and save</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              setPhoneStep(null);
              setPendingPhoneE164("");
              setPhoneOtpCode("");
              const { countryCode, nationalDisplay } = splitPhoneForNationalInput(
                initialProfileRef.current.phone,
                deviceDefaultDialRef.current,
              );
              setPhoneCountryCode(countryCode);
              setPhoneNational(nationalDisplay);
              setPhoneFieldError(null);
            }}
            style={twStyle("mt-4")}
          >
            <Text style={twStyle("text-sm font-medium text-primary")}>Wrong number? Go back</Text>
          </TouchableOpacity>
        </View>
      </Modal>

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
            <View
              style={{
                paddingHorizontal: screenPadding,
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderColor: "#F3F4F6",
              }}
            >
              <Text style={{ textAlign: "center", fontWeight: "700", fontSize: 17, color: "#111827", marginBottom: 12 }}>
                Select country
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
            <FlatList<CountryCodeOption>
              {...verticalFlatListPerf}
              data={filteredCountries}
              keyExtractor={(c: CountryCodeOption) => c.code}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item: c }: { item: CountryCodeOption }) => (
                <TouchableOpacity
                  onPress={() => {
                    setPhoneCountryCode(c.code);
                    setShowCountryPicker(false);
                    setPhoneFieldError(
                      phoneNational.trim() ? validateNationalPhoneDigits(phoneNational, c.code) : null,
                    );
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
                      color: phoneCountryCode === c.code ? PRIMARY : "#111827",
                      fontWeight: phoneCountryCode === c.code ? "700" : "400",
                    }}
                  >
                    {c.label}
                  </Text>
                  {phoneCountryCode === c.code && <Ionicons name="checkmark-circle" size={20} color={PRIMARY} />}
                </TouchableOpacity>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>

      <AddressMapPinModal
        visible={mapPinVisible}
        onClose={() => setMapPinVisible(false)}
        onPickCoordinates={(lat: number, lng: number) => {
          void handleDropPinConfirm(lat, lng);
        }}
        initialCoordinate={pinInitialCoordinate}
      />
    </ScreenContainer>
  );
}
