/**
 * Business details – name, description, contact, logo. Uses GET/PATCH /api/provider/settings/business.
 */
import { useCallback, useEffect, useState } from "react";
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
} from "react-native";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useTranslation } from "@beautonomi/i18n";
import { useApi } from "@/hooks/useApi";
import { api } from "@/lib/api-client";
import { validateRequired, validateEmail, validatePhone } from "@/lib/validation";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { ActionButton } from "@/components/ui/ActionButton";
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
};

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

export default function BusinessDetailsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { data, loading, error, refresh } = useApi<BusinessData>("/api/provider/settings/business");
  const [form, setForm] = useState<BusinessData>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!data) return;
    setForm({
      id: (data as BusinessData).id ?? "",
      business_name: (data as BusinessData).business_name ?? "",
      business_type: (data as BusinessData).business_type ?? "salon",
      description: (data as BusinessData).description ?? null,
      email: (data as BusinessData).email ?? "",
      phone: (data as BusinessData).phone ?? "",
      website: (data as BusinessData).website ?? null,
      logo_url: (data as BusinessData).logo_url ?? null,
      avatar_url: (data as BusinessData).avatar_url ?? null,
      address_line1: (data as BusinessData).address_line1 ?? null,
      city: (data as BusinessData).city ?? null,
      state: (data as BusinessData).state ?? null,
      postal_code: (data as BusinessData).postal_code ?? null,
      country: (data as BusinessData).country ?? null,
    });
  }, [data]);

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
    const phoneErr = validatePhone(form.phone, false);
    if (phoneErr) nextErrors.phone = phoneErr;
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSaving(true);
    const res = await api.patch<BusinessData>("/api/provider/settings/business", {
      business_name: form.business_name.trim() || undefined,
      description: form.description?.trim() || null,
      email: form.email.trim() || undefined,
      phone: form.phone.trim() || undefined,
      website: form.website?.trim() || null,
      address_line1: form.address_line1?.trim() || null,
      city: form.city?.trim() || null,
      state: form.state?.trim() || null,
      postal_code: form.postal_code?.trim() || null,
      country: form.country?.trim() || null,
    });
    setSaving(false);
    if (res.error) {
      Alert.alert("Error", res.error.message);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Saved", "Business details updated.");
    refresh();
  }, [form, refresh, t]);

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
              <TextInput
                style={twStyle(`rounded-xl border bg-white px-4 py-3 text-base text-gray-900 ${errors.phone ? "border-red-500" : "border-gray-200"}`)}
                value={form.phone}
                onChangeText={(t) => {
                  setForm((f) => ({ ...f, phone: t }));
                  if (errors.phone) setErrors((e) => ({ ...e, phone: "" }));
                }}
                placeholder="+27..."
                placeholderTextColor="#9ca3af"
                keyboardType="phone-pad"
              />
              {errors.phone ? (
                <Text style={twStyle("mt-1 text-sm text-red-500")}>{t(errors.phone)}</Text>
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

            <View style={twStyle("mb-2 rounded-xl border border-gray-100 bg-gray-50 p-3")}>
              <Text style={twStyle("text-xs font-medium text-gray-500 uppercase tracking-wider")}>Address (optional)</Text>
            </View>
            <View style={twStyle("mb-4")}>
              <Text style={twStyle("mb-1.5 text-sm font-medium text-gray-700")}>Address line 1</Text>
              <TextInput
                style={twStyle("rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
                value={form.address_line1 ?? ""}
                onChangeText={(t) => setForm((f) => ({ ...f, address_line1: t.trim() || null }))}
                placeholder="Street address"
                placeholderTextColor="#9ca3af"
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
    </ScreenContainer>
  );
}
