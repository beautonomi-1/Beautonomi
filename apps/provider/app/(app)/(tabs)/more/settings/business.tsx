/**
 * Business details – name, description, contact, logo. Uses GET/PATCH /api/provider/settings/business.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Alert,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Pressable,
  FlatList,
} from "react-native";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useTranslation } from "@beautonomi/i18n";
import { useApi } from "@/hooks/useApi";
import { useResponsive } from "@/hooks/useResponsive";
import { api } from "@/lib/api-client";
import { validateRequired, validateEmail } from "@/lib/validation";
import {
  COUNTRY_CODES,
  type CountryCodeOption,
  splitPhoneForNationalInput,
  composeE164FromNational,
  validateNationalPhoneDigits,
} from "@/lib/phone-country-codes";
import { getDeviceDefaultCountryDial } from "@/lib/phone";
import { normalizeSupabaseAuthPhone } from "@/lib/supabase-sms-otp";
import { Colors } from "@/constants/colors";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { ActionButton } from "@/components/ui/ActionButton";
import { AddressAutocomplete, type ParsedAddress } from "@/components/ui/AddressAutocomplete";
import { twStyle } from "@/lib/twStyle";

type BusinessData = {
  id: string;
  business_name: string;
  business_type: string;
  description: string | null;
  email: string;
  phone: string;
  website: string | null;
  logo_url: string | null;
  avatar_url: string | null;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  yearsInBusiness: number | null;
  languagesSpoken: string[];
  instagram_url: string | null;
  facebook_url: string | null;
  tiktok_url: string | null;
  twitter_url: string | null;
};

const EMPTY: BusinessData = {
  id: "",
  business_name: "",
  business_type: "salon",
  description: null,
  email: "",
  phone: "",
  website: null,
  logo_url: null,
  avatar_url: null,
  address_line1: null,
  city: null,
  state: null,
  postal_code: null,
  country: null,
  yearsInBusiness: null,
  languagesSpoken: [],
  instagram_url: null,
  facebook_url: null,
  tiktok_url: null,
  twitter_url: null,
};

const COMMON_LANGUAGES = [
  "English", "Zulu", "Xhosa", "Afrikaans", "Sotho",
  "Setswana", "Tsonga", "Venda", "Ndebele", "Swazi",
  "French", "Portuguese", "Arabic", "Hindi", "Mandarin",
];

const FIELD_LABELS: Record<string, string> = {
  business_name: "Business name",
  email: "Email",
  phone: "Phone",
  description: "Description",
  website: "Website",
  address_line1: "Address",
  city: "City",
  state: "State / Province",
  postal_code: "Postal code",
  country: "Country",
};

const PRIMARY = Colors.primary;

export default function BusinessDetailsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { screenPadding } = useResponsive();
  const { data, loading, error, refresh } = useApi<BusinessData>("/api/provider/settings/business");
  const [form, setForm] = useState<BusinessData>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const deviceDefaultDialRef = useRef(getDeviceDefaultCountryDial());
  const [phoneCountryCode, setPhoneCountryCode] = useState(() => deviceDefaultDialRef.current);
  const [phoneNational, setPhoneNational] = useState("");
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const [phoneFieldError, setPhoneFieldError] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    const d = data as any;
    setForm({
      id: d.id ?? "",
      business_name: d.business_name ?? "",
      business_type: d.business_type ?? "salon",
      description: d.description ?? null,
      email: d.email ?? "",
      phone: d.phone ?? "",
      website: d.website ?? null,
      logo_url: d.logo_url ?? null,
      avatar_url: d.avatar_url ?? null,
      address_line1: d.address_line1 ?? null,
      city: d.city ?? null,
      state: d.state ?? null,
      postal_code: d.postal_code ?? null,
      country: d.country ?? null,
      yearsInBusiness: d.yearsInBusiness ?? null,
      languagesSpoken: Array.isArray(d.languagesSpoken) ? d.languagesSpoken : [],
      instagram_url: d.instagram_url ?? null,
      facebook_url: d.facebook_url ?? null,
      tiktok_url: d.tiktok_url ?? null,
      twitter_url: d.twitter_url ?? null,
    });
    const { countryCode, nationalDisplay } = splitPhoneForNationalInput(
      d.phone,
      deviceDefaultDialRef.current,
    );
    setPhoneCountryCode(countryCode);
    setPhoneNational(nationalDisplay);
    setPhoneFieldError(null);
  }, [data]);

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

  const pickLogo = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow access to photos to choose a logo.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      base64: true,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const base64 = asset.base64;
    const mime = asset.mimeType ?? "image/jpeg";
    if (!base64) {
      Alert.alert("Upload failed", "Could not read image. Try another photo.");
      return;
    }
    setUploadingLogo(true);
    try {
      const dataUrl = `data:${mime};base64,${base64}`;
      const res = await api.patch<BusinessData>("/api/provider/settings/business", {
        logo_base64: dataUrl,
      });
      if (res.error) {
        Alert.alert("Upload failed", res.error.message);
        return;
      }
      await refresh();
    } catch (e) {
      Alert.alert("Upload failed", e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setUploadingLogo(false);
    }
  }, [refresh]);

  const handleSave = useCallback(async () => {
    const nextErrors: Record<string, string> = {};
    const nameErr = validateRequired(form.business_name);
    if (nameErr) nextErrors.business_name = nameErr;
    const emailErr = validateEmail(form.email, true);
    if (emailErr) nextErrors.email = emailErr;
    const nationalPhoneErr =
      phoneNational.trim() ? validateNationalPhoneDigits(phoneNational, phoneCountryCode) : null;
    setPhoneFieldError(nationalPhoneErr);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      const firstKey = Object.keys(nextErrors)[0];
      const firstMsg = nextErrors[firstKey];
      const message = firstMsg === "validation.required"
        ? t(firstMsg, { field: FIELD_LABELS[firstKey] ?? firstKey })
        : t(firstMsg);
      Alert.alert(t("validation.fixForm"), message);
      return;
    }
    if (nationalPhoneErr) {
      Alert.alert(t("validation.fixForm"), nationalPhoneErr);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSaving(true);
    const composed = composeE164FromNational(phoneCountryCode, phoneNational);
    const phoneE164 =
      composed && phoneNational.trim() ? normalizeSupabaseAuthPhone(composed) : undefined;

    const res = await api.patch<BusinessData>("/api/provider/settings/business", {
      business_name: form.business_name.trim() || undefined,
      description: form.description?.trim() || null,
      email: form.email.trim() || undefined,
      phone: phoneE164,
      website: form.website?.trim() || null,
      address_line1: form.address_line1?.trim() || null,
      city: form.city?.trim() || null,
      state: form.state?.trim() || null,
      postal_code: form.postal_code?.trim() || null,
      country: form.country?.trim() || null,
      yearsInBusiness: form.yearsInBusiness,
      languagesSpoken: form.languagesSpoken,
      instagram_url: form.instagram_url?.trim() || null,
      facebook_url: form.facebook_url?.trim() || null,
      tiktok_url: form.tiktok_url?.trim() || null,
      twitter_url: form.twitter_url?.trim() || null,
    });
    setSaving(false);
    if (res.error) {
      Alert.alert("Error", res.error.message);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Saved", "Business details updated.");
    refresh();
  }, [form, refresh, t, phoneCountryCode, phoneNational]);

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Business details" onBack={() => router.back()} />
        <View style={twStyle("flex-1 items-center justify-center py-12")}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Business details" onBack={() => router.back()} />
        <View style={twStyle("flex-1 justify-center px-4")}>
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader title="Business details" onBack={() => router.back()} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "padding"}
        style={twStyle("flex-1")}
        keyboardVerticalOffset={Platform.OS === "ios" ? 56 : 20}
      >
        <ScrollView
          style={twStyle("flex-1")}
          contentContainerStyle={{ paddingBottom: 220 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={twStyle("px-4")}>
            {/* Logo */}
            <View style={twStyle("mb-6 items-center")}>
              <TouchableOpacity
                onPress={pickLogo}
                disabled={uploadingLogo}
                style={[twStyle("overflow-hidden rounded-full border-2 border-gray-200"), { width: 96, height: 96 }]}
                accessibilityRole="button"
                accessibilityLabel="Change logo"
              >
                {form.logo_url ? (
                  <Image
                    source={{ uri: form.logo_url }}
                    style={{ width: 96, height: 96 }}
                    contentFit="cover"
                  />
                ) : (
                  <View style={twStyle("h-full w-full items-center justify-center bg-gray-100")}>
                    <Ionicons name="business-outline" size={40} color="#9ca3af" />
                  </View>
                )}
                {uploadingLogo && (
                  <View style={twStyle("absolute inset-0 items-center justify-center bg-black/40")}>
                    <ActivityIndicator color="#fff" />
                  </View>
                )}
              </TouchableOpacity>
              <Text style={twStyle("mt-2 text-sm text-gray-500")}>Tap to change logo</Text>
            </View>

            <View style={twStyle("mb-4")}>
              <Text style={twStyle("mb-1.5 text-sm font-medium text-gray-700")}>Business name *</Text>
              <TextInput
                style={twStyle(`rounded-xl border bg-white px-4 py-3 text-base text-gray-900 ${errors.business_name ? "border-red-500" : "border-gray-200"}`)}
                value={form.business_name}
                onChangeText={(t) => {
                  setForm((f) => ({ ...f, business_name: t }));
                  if (errors.business_name) setErrors((e) => ({ ...e, business_name: "" }));
                }}
                placeholder="Your business name"
                placeholderTextColor="#9ca3af"
                autoCapitalize="words"
              />
              {errors.business_name ? (
                <Text style={twStyle("mt-1 text-sm text-red-500")}>
                  {errors.business_name === "validation.required"
                    ? t(errors.business_name, { field: FIELD_LABELS.business_name })
                    : t(errors.business_name)}
                </Text>
              ) : null}
            </View>

            <View style={twStyle("mb-4")}>
              <Text style={twStyle("mb-1.5 text-sm font-medium text-gray-700")}>Description</Text>
              <TextInput
                style={twStyle("min-h-[100px] rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
                value={form.description ?? ""}
                onChangeText={(t) => setForm((f) => ({ ...f, description: t || null }))}
                placeholder="What you offer (shown to clients)"
                placeholderTextColor="#9ca3af"
                multiline
                textAlignVertical="top"
              />
            </View>

            <View style={twStyle("mb-4")}>
              <Text style={twStyle("mb-1.5 text-sm font-medium text-gray-700")}>Email *</Text>
              <TextInput
                style={twStyle(`rounded-xl border bg-white px-4 py-3 text-base text-gray-900 ${errors.email ? "border-red-500" : "border-gray-200"}`)}
                value={form.email}
                onChangeText={(t) => {
                  setForm((f) => ({ ...f, email: t }));
                  if (errors.email) setErrors((e) => ({ ...e, email: "" }));
                }}
                placeholder="contact@example.com"
                placeholderTextColor="#9ca3af"
                keyboardType="email-address"
                autoCapitalize="none"
              />
              {errors.email ? (
                <Text style={twStyle("mt-1 text-sm text-red-500")}>{t(errors.email)}</Text>
              ) : null}
            </View>

            <View style={twStyle("mb-4")}>
              <Text style={twStyle("mb-1.5 text-sm font-medium text-gray-700")}>Phone</Text>
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
                  style={{
                    flex: 1,
                    backgroundColor: "#FAFAFA",
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    fontSize: 16,
                    color: "#111827",
                  }}
                  value={phoneNational}
                  onChangeText={handlePhoneNationalChange}
                  placeholder="82 123 4567"
                  placeholderTextColor="#9ca3af"
                  keyboardType="phone-pad"
                  accessibilityLabel="Business phone number without country code"
                />
              </View>
              <Text style={twStyle("mt-1.5 text-xs text-gray-500 leading-5")}>
                Use your country code on the left. Enter the rest without + — a leading 0 is optional (we save E.164 for SMS and Supabase, e.g. +27821234567).
              </Text>
              {phoneFieldError ? (
                <Text style={twStyle("mt-1 text-sm text-red-500")}>{phoneFieldError}</Text>
              ) : null}
            </View>

            <View style={twStyle("mb-4")}>
              <Text style={twStyle("mb-1.5 text-sm font-medium text-gray-700")}>Website</Text>
              <TextInput
                style={twStyle("rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
                value={form.website ?? ""}
                onChangeText={(t) => setForm((f) => ({ ...f, website: t.trim() || null }))}
                placeholder="https://..."
                placeholderTextColor="#9ca3af"
                keyboardType="url"
                autoCapitalize="none"
              />
            </View>

            {/* ── Years in business ── */}
            <View style={twStyle("mb-4")}>
              <Text style={twStyle("mb-1.5 text-sm font-medium text-gray-700")}>Years in business</Text>
              <TextInput
                style={twStyle("rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
                value={form.yearsInBusiness != null ? String(form.yearsInBusiness) : ""}
                onChangeText={(t) => {
                  const n = parseInt(t, 10);
                  setForm((f) => ({ ...f, yearsInBusiness: t === "" ? null : Number.isFinite(n) ? n : f.yearsInBusiness }));
                }}
                placeholder="e.g. 5"
                placeholderTextColor="#9ca3af"
                keyboardType="number-pad"
                accessibilityLabel="Years in business"
              />
              <Text style={twStyle("mt-1 text-xs text-gray-400")}>
                Helps customers understand your experience level.
              </Text>
            </View>

            {/* ── Languages ── */}
            <View style={twStyle("mb-4")}>
              <Text style={twStyle("mb-1.5 text-sm font-medium text-gray-700")}>Languages you speak</Text>
              <View style={twStyle("flex-row flex-wrap gap-2")}>
                {COMMON_LANGUAGES.map((lang) => {
                  const selected = form.languagesSpoken.includes(lang);
                  return (
                    <TouchableOpacity
                      key={lang}
                      onPress={() =>
                        setForm((f) => ({
                          ...f,
                          languagesSpoken: selected
                            ? f.languagesSpoken.filter((l) => l !== lang)
                            : [...f.languagesSpoken, lang],
                        }))
                      }
                      style={twStyle(
                        `rounded-full px-3.5 py-1.5 border ${
                          selected
                            ? "bg-gray-900 border-gray-900"
                            : "bg-white border-gray-200"
                        }`
                      )}
                      accessibilityLabel={`${selected ? "Remove" : "Add"} ${lang}`}
                    >
                      <Text style={twStyle(`text-sm font-medium ${selected ? "text-white" : "text-gray-600"}`)}>
                        {lang}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={twStyle("mt-1 text-xs text-gray-400")}>
                Tap to select languages you communicate in.
              </Text>
            </View>

            {/* ── Social media ── */}
            <View style={twStyle("mb-2 rounded-xl border border-gray-100 bg-gray-50 p-3")}>
              <Text style={twStyle("text-xs font-medium text-gray-500 uppercase tracking-wider")}>Social media (optional)</Text>
            </View>
            {([
              { key: "instagram_url", label: "Instagram", placeholder: "https://instagram.com/yourhandle" },
              { key: "facebook_url", label: "Facebook", placeholder: "https://facebook.com/yourpage" },
              { key: "tiktok_url", label: "TikTok", placeholder: "https://tiktok.com/@yourhandle" },
              { key: "twitter_url", label: "X", placeholder: "https://x.com/yourhandle" },
            ] as const).map(({ key, label, placeholder }) => (
              <View key={key} style={twStyle("mb-4")}>
                <Text style={twStyle("mb-1.5 text-sm font-medium text-gray-700")}>{label}</Text>
                <TextInput
                  style={twStyle("rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
                  value={(form[key] as string | null) ?? ""}
                  onChangeText={(t) => setForm((f) => ({ ...f, [key]: t.trim() || null }))}
                  placeholder={placeholder}
                  placeholderTextColor="#9ca3af"
                  keyboardType="url"
                  autoCapitalize="none"
                  autoCorrect={false}
                  accessibilityLabel={label}
                />
              </View>
            ))}

            <View style={twStyle("mb-2 rounded-xl border border-gray-100 bg-gray-50 p-3")}>
              <Text style={twStyle("text-xs font-medium text-gray-500 uppercase tracking-wider")}>Address (optional)</Text>
            </View>
            <View style={twStyle("mb-4")}>
              <Text style={twStyle("mb-1.5 text-sm font-medium text-gray-700")}>Address line 1</Text>
              <AddressAutocomplete
                value={form.address_line1 ?? ""}
                onSelect={(addr: ParsedAddress) => {
                  setForm((f) => ({
                    ...f,
                    address_line1: addr.address_line1 || f.address_line1,
                    city: addr.city || f.city,
                    state: addr.state || f.state,
                    postal_code: addr.postal_code || f.postal_code,
                    country: addr.country || f.country,
                  }));
                }}
                onBlur={(query) => {
                  if (query.trim()) setForm((f) => ({ ...f, address_line1: query.trim() }));
                }}
                placeholder="Start typing address…"
              />
            </View>
            <View style={twStyle("mb-4 flex-row")}>
              <View style={[twStyle("flex-1"), { marginRight: 12 }]}>
                <Text style={twStyle("mb-1.5 text-sm font-medium text-gray-700")}>City</Text>
                <TextInput
                  style={twStyle("rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
                  value={form.city ?? ""}
                  onChangeText={(t) => setForm((f) => ({ ...f, city: t.trim() || null }))}
                  placeholder="City"
                  placeholderTextColor="#9ca3af"
                />
              </View>
              <View style={twStyle("flex-1")}>
                <Text style={twStyle("mb-1.5 text-sm font-medium text-gray-700")}>Country</Text>
                <TextInput
                  style={twStyle("rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
                  value={form.country ?? ""}
                  onChangeText={(t) => setForm((f) => ({ ...f, country: t.trim() || null }))}
                  placeholder="Country"
                  placeholderTextColor="#9ca3af"
                />
              </View>
            </View>

            <ActionButton
              label="Save changes"
              variant="primary"
              onPress={handleSave}
              loading={saving}
              fullWidth
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

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
    </ScreenContainer>
  );
}
