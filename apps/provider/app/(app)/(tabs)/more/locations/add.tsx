/**
 * Add location – POST /api/provider/locations. Required: name, address_line1, city, country.
 */
import { useCallback, useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useTranslation } from "@beautonomi/i18n";
import { api } from "@/lib/api-client";
import { validateRequired, validatePhone } from "@/lib/validation";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ActionButton } from "@/components/ui/ActionButton";

export default function AddLocationScreen() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [address_line1, setAddressLine1] = useState("");
  const [address_line2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postal_code, setPostalCode] = useState("");
  const [country, setCountry] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { t } = useTranslation();
  const FIELD_LABELS: Record<string, string> = {
    name: "Location name",
    address_line1: "Address line 1",
    city: "City",
    country: "Country",
  };

  const handleSave = useCallback(async () => {
    const nextErrors: Record<string, string> = {};
    const nameErr = validateRequired(name);
    if (nameErr) nextErrors.name = nameErr;
    const addressErr = validateRequired(address_line1);
    if (addressErr) nextErrors.address_line1 = addressErr;
    const cityErr = validateRequired(city);
    if (cityErr) nextErrors.city = cityErr;
    const countryErr = validateRequired(country);
    if (countryErr) nextErrors.country = countryErr;
    const phoneErr = validatePhone(phone, false);
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
    const trimmedName = name.trim();
    const trimmedAddress = address_line1.trim();
    const trimmedCity = city.trim();
    const trimmedCountry = country.trim();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSaving(true);
    const res = await api.post<{ id: string }>("/api/provider/locations", {
      name: trimmedName,
      address_line1: trimmedAddress,
      address_line2: address_line2.trim() || undefined,
      city: trimmedCity,
      state: state.trim() || undefined,
      postal_code: postal_code.trim() || undefined,
      country: trimmedCountry,
      phone: phone.trim() || undefined,
    });
    setSaving(false);
    if (res.error) {
      Alert.alert("Error", res.error.message);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Saved", "Location added.", [
      { text: "OK", onPress: () => router.back() },
    ]);
  }, [name, address_line1, address_line2, city, state, postal_code, country, phone, router, t]);

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader title="Add location" onBack={() => router.back()} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View className="px-4">
            <View className="mb-4">
              <Text className="mb-1.5 text-sm font-medium text-gray-700">Location name *</Text>
              <TextInput
                className={`rounded-xl border bg-white px-4 py-3 text-base text-gray-900 ${errors.name ? "border-red-500" : "border-gray-200"}`}
                value={name}
                onChangeText={(t) => {
                  setName(t);
                  if (errors.name) setErrors((e) => ({ ...e, name: "" }));
                }}
                placeholder="e.g. Main salon"
                placeholderTextColor="#9ca3af"
              />
              {errors.name ? (
                <Text className="mt-1 text-sm text-red-500">
                  {errors.name === "validation.required"
                    ? t(errors.name, { field: FIELD_LABELS.name })
                    : t(errors.name)}
                </Text>
              ) : null}
            </View>
            <View className="mb-4">
              <Text className="mb-1.5 text-sm font-medium text-gray-700">Address line 1 *</Text>
              <TextInput
                className={`rounded-xl border bg-white px-4 py-3 text-base text-gray-900 ${errors.address_line1 ? "border-red-500" : "border-gray-200"}`}
                value={address_line1}
                onChangeText={(t) => {
                  setAddressLine1(t);
                  if (errors.address_line1) setErrors((e) => ({ ...e, address_line1: "" }));
                }}
                placeholder="Street address"
                placeholderTextColor="#9ca3af"
              />
              {errors.address_line1 ? (
                <Text className="mt-1 text-sm text-red-500">
                  {errors.address_line1 === "validation.required"
                    ? t(errors.address_line1, { field: FIELD_LABELS.address_line1 })
                    : t(errors.address_line1)}
                </Text>
              ) : null}
            </View>
            <View className="mb-4">
              <Text className="mb-1.5 text-sm font-medium text-gray-700">Address line 2</Text>
              <TextInput
                className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900"
                value={address_line2}
                onChangeText={setAddressLine2}
                placeholder="Suite, floor, etc."
                placeholderTextColor="#9ca3af"
              />
            </View>
            <View className="mb-4 flex-row gap-3">
              <View className="flex-1">
                <Text className="mb-1.5 text-sm font-medium text-gray-700">City *</Text>
                <TextInput
                  className={`rounded-xl border bg-white px-4 py-3 text-base text-gray-900 ${errors.city ? "border-red-500" : "border-gray-200"}`}
                  value={city}
                  onChangeText={(t) => {
                    setCity(t);
                    if (errors.city) setErrors((e) => ({ ...e, city: "" }));
                  }}
                  placeholder="City"
                  placeholderTextColor="#9ca3af"
                />
                {errors.city ? (
                  <Text className="mt-1 text-sm text-red-500">
                    {errors.city === "validation.required"
                      ? t(errors.city, { field: FIELD_LABELS.city })
                      : t(errors.city)}
                  </Text>
                ) : null}
              </View>
              <View className="flex-1">
                <Text className="mb-1.5 text-sm font-medium text-gray-700">Country *</Text>
                <TextInput
                  className={`rounded-xl border bg-white px-4 py-3 text-base text-gray-900 ${errors.country ? "border-red-500" : "border-gray-200"}`}
                  value={country}
                  onChangeText={(t) => {
                    setCountry(t);
                    if (errors.country) setErrors((e) => ({ ...e, country: "" }));
                  }}
                  placeholder="Country"
                  placeholderTextColor="#9ca3af"
                />
                {errors.country ? (
                  <Text className="mt-1 text-sm text-red-500">
                    {errors.country === "validation.required"
                      ? t(errors.country, { field: FIELD_LABELS.country })
                      : t(errors.country)}
                  </Text>
                ) : null}
              </View>
            </View>
            <View className="mb-4 flex-row gap-3">
              <View className="flex-1">
                <Text className="mb-1.5 text-sm font-medium text-gray-700">State / Province</Text>
                <TextInput
                  className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900"
                  value={state}
                  onChangeText={setState}
                  placeholder="Optional"
                  placeholderTextColor="#9ca3af"
                />
              </View>
              <View className="flex-1">
                <Text className="mb-1.5 text-sm font-medium text-gray-700">Postal code</Text>
                <TextInput
                  className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900"
                  value={postal_code}
                  onChangeText={setPostalCode}
                  placeholder="Optional"
                  placeholderTextColor="#9ca3af"
                  keyboardType="default"
                />
              </View>
            </View>
            <View className="mb-6">
              <Text className="mb-1.5 text-sm font-medium text-gray-700">Phone</Text>
              <TextInput
                className={`rounded-xl border bg-white px-4 py-3 text-base text-gray-900 ${errors.phone ? "border-red-500" : "border-gray-200"}`}
                value={phone}
                onChangeText={(t) => {
                  setPhone(t);
                  if (errors.phone) setErrors((e) => ({ ...e, phone: "" }));
                }}
                placeholder="Location phone"
                placeholderTextColor="#9ca3af"
                keyboardType="phone-pad"
              />
              {errors.phone ? (
                <Text className="mt-1 text-sm text-red-500">{t(errors.phone)}</Text>
              ) : null}
            </View>
            <ActionButton
              label="Add location"
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
