/**
 * Edit location – GET/PATCH/DELETE /api/provider/locations/[id].
 */
import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "@beautonomi/i18n";
import { useApi , useApiMutation } from "@/hooks/useApi";
import { api } from "@/lib/api-client";
import { validateRequired } from "@/lib/validation";
import { validateE164Phone } from "@/lib/phone-country-codes";
import { E164PhoneField } from "@/components/E164PhoneField";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { ActionButton } from "@/components/ui/ActionButton";
import { AddressAutocomplete } from "@/components/ui/AddressAutocomplete";
import { twStyle } from "@/lib/twStyle";
import { countryFilterIso2FromStorage, mapGeocodeFeatureToAddressParts } from "@beautonomi/utils";

type LocationData = {
  id: string;
  name: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  phone?: string;
  latitude?: number | null;
  longitude?: number | null;
  is_primary?: boolean;
  is_active?: boolean;
  location_type?: "salon" | "base";
};

export default function EditLocationScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const locationId = Array.isArray(id) ? id[0] : id;
  const { data, loading, error, refresh } = useApi<LocationData>(
    `/api/provider/locations/${locationId || ""}`,
    { enabled: !!locationId }
  );
  const { execute: deleteLocation } = useApiMutation("delete");

  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [address_line1, setAddressLine1] = useState("");
  const [address_line2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postal_code, setPostalCode] = useState("");
  const [country, setCountry] = useState("");
  const [phoneE164, setPhoneE164] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [is_primary, setIsPrimary] = useState(false);
  const [is_active, setIsActive] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [locating, setLocating] = useState(false);

  const { t } = useTranslation();
  const FIELD_LABELS: Record<string, string> = {
    name: "Location name",
    address_line1: "Address line 1",
    city: "City",
    country: "Country",
  };

  useEffect(() => {
    if (!data) return;
    const d = data as LocationData;
    setName(d.name ?? "");
    setAddressLine1(d.address_line1 ?? "");
    setAddressLine2(d.address_line2 ?? "");
    setCity(d.city ?? "");
    setState(d.state ?? "");
    setPostalCode(d.postal_code ?? "");
    setCountry(d.country ?? "");
    setPhoneE164(d.phone ?? "");
    setLatitude(d.latitude ?? null);
    setLongitude(d.longitude ?? null);
    setIsPrimary(!!d.is_primary);
    setIsActive(d.is_active !== false);
  }, [data]);

  const handleSave = useCallback(async () => {
    if (!locationId) return;
    const nextErrors: Record<string, string> = {};
    const nameErr = validateRequired(name);
    if (nameErr) nextErrors.name = nameErr;
    const addressErr = validateRequired(address_line1);
    if (addressErr) nextErrors.address_line1 = addressErr;
    const cityErr = validateRequired(city);
    if (cityErr) nextErrors.city = cityErr;
    const countryErr = validateRequired(country);
    if (countryErr) nextErrors.country = countryErr;
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
    if (phoneE164.trim()) {
      const pe = validateE164Phone(phoneE164);
      if (pe) {
        Alert.alert(t("validation.fixForm"), pe);
        return;
      }
    }
    const trimmedName = name.trim();
    const trimmedAddress = address_line1.trim();
    const trimmedCity = city.trim();
    const trimmedCountry = country.trim();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSaving(true);
    const res = await api.patch<LocationData>(`/api/provider/locations/${locationId}`, {
      name: trimmedName,
      address_line1: trimmedAddress,
      address_line2: address_line2.trim() || null,
      city: trimmedCity,
      state: state.trim() || null,
      postal_code: postal_code.trim() || null,
      country: trimmedCountry,
      phone: phoneE164.trim() || null,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      is_primary: is_primary,
      is_active: is_active,
    });
    setSaving(false);
    if (res.error) {
      Alert.alert("Error", res.error.message);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Saved", "Location updated.");
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- FIELD_LABELS is static
  }, [locationId, name, address_line1, address_line2, city, state, postal_code, country, phoneE164, latitude, longitude, is_primary, is_active, refresh, t]);

  const handleDelete = useCallback(() => {
    Alert.alert(
      "Delete location",
      "Remove this location? This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const res = await deleteLocation(`/api/provider/locations/${locationId}`);
            if (!res.error) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              router.back();
            } else {
              Alert.alert("Error", res.error);
            }
          },
        },
      ]
    );
  }, [locationId, deleteLocation, router]);

  const handleUseCurrentLocationPin = useCallback(async () => {
    if (locating) return;
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Location permission", "Allow location access to place a map pin from your current position.");
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const lat = loc.coords.latitude;
      const lng = loc.coords.longitude;
      const reverse = await api.post<any>("/api/mapbox/reverse-geocode", {
        latitude: lat,
        longitude: lng,
      });
      const feature = reverse?.data?.data ?? reverse?.data ?? null;
      if (feature) {
        const mapped = mapGeocodeFeatureToAddressParts(feature, {
          defaultCountryName: country.trim() || "South Africa",
        });
        setAddressLine1(mapped.address_line1 || address_line1 || "Current location");
        setCity(mapped.city || city || "—");
        setState(mapped.state || "");
        setPostalCode(mapped.postal_code || "");
        setCountry(mapped.country || country || "South Africa");
      }
      setLatitude(lat);
      setLongitude(lng);
      if (errors.address_line1 || errors.city || errors.country) {
        setErrors((e) => ({ ...e, address_line1: "", city: "", country: "" }));
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {
      Alert.alert("Location error", e instanceof Error ? e.message : "Could not fetch current location.");
    } finally {
      setLocating(false);
    }
  }, [locating, country, address_line1, city, errors.address_line1, errors.city, errors.country]);

  if (!locationId) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Edit location" onBack={() => router.back()} />
        <View style={twStyle("flex-1 items-center justify-center px-4")}>
          <Text style={twStyle("text-gray-500")}>Invalid location.</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Edit location" onBack={() => router.back()} />
        <View style={twStyle("flex-1 items-center justify-center py-12")}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Edit location" onBack={() => router.back()} />
        <View style={twStyle("flex-1 justify-center px-4")}>
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader title="Edit location" onBack={() => router.back()} />
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
            <View style={twStyle("mb-4")}>
              <Text style={twStyle("mb-1.5 text-sm font-medium text-gray-700")}>Location name *</Text>
              <TextInput
                style={twStyle(`rounded-xl border bg-white px-4 py-3 text-base text-gray-900 ${errors.name ? "border-red-500" : "border-gray-200"}`)}
                value={name}
                onChangeText={(t) => {
                  setName(t);
                  if (errors.name) setErrors((e) => ({ ...e, name: "" }));
                }}
                placeholder="e.g. Main salon"
                placeholderTextColor="#9ca3af"
              />
              {errors.name ? (
                <Text style={twStyle("mt-1 text-sm text-red-500")}>
                  {errors.name === "validation.required"
                    ? t(errors.name, { field: FIELD_LABELS.name })
                    : t(errors.name)}
                </Text>
              ) : null}
            </View>
            <View style={twStyle("mb-4")}>
              <Text style={twStyle("mb-1.5 text-sm font-medium text-gray-700")}>Address *</Text>
              <Text style={twStyle("mb-2 text-xs text-gray-500")}>
                Search for an address to fill city, state, postal code and coordinates automatically, or type manually.
              </Text>
              <AddressAutocomplete
                value={address_line1}
                onSelect={(addr) => {
                  setAddressLine1(addr.address_line1);
                  setCity(addr.city);
                  setState(addr.state);
                  setPostalCode(addr.postal_code);
                  setCountry(addr.country || "");
                  setLatitude(addr.latitude);
                  setLongitude(addr.longitude);
                  if (errors.address_line1) setErrors((e) => ({ ...e, address_line1: "" }));
                  if (errors.city) setErrors((e) => ({ ...e, city: "" }));
                  if (errors.country) setErrors((e) => ({ ...e, country: "" }));
                }}
                onBlur={(text) => setAddressLine1(text)}
                placeholder="Street address or search…"
                label={undefined}
                countryCode={countryFilterIso2FromStorage(country) ?? "ZA"}
                defaultCountryName={country.trim() || undefined}
                proximity={
                  latitude != null && longitude != null && !(latitude === 0 && longitude === 0)
                    ? { latitude, longitude }
                    : undefined
                }
              />
              <TouchableOpacity
                onPress={() => {
                  void handleUseCurrentLocationPin();
                }}
                disabled={locating}
                style={twStyle("mt-2.5 self-start rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 flex-row items-center")}
                accessibilityLabel="Use current location pin"
                accessibilityRole="button"
              >
                {locating ? (
                  <ActivityIndicator size="small" color="#2563eb" />
                ) : (
                  <Ionicons name="locate-outline" size={16} color="#2563eb" />
                )}
                <Text style={twStyle("ml-1.5 text-xs font-semibold text-blue-700")}>
                  {locating ? "Locating…" : "Use current location pin"}
                </Text>
              </TouchableOpacity>
              {errors.address_line1 ? (
                <Text style={twStyle("mt-1 text-sm text-red-500")}>
                  {errors.address_line1 === "validation.required"
                    ? t(errors.address_line1, { field: FIELD_LABELS.address_line1 })
                    : t(errors.address_line1)}
                </Text>
              ) : null}
            </View>
            <View style={twStyle("mb-4")}>
              <Text style={twStyle("mb-1.5 text-sm font-medium text-gray-700")}>Address line 2</Text>
              <TextInput
                style={twStyle("rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
                value={address_line2}
                onChangeText={setAddressLine2}
                placeholder="Optional"
                placeholderTextColor="#9ca3af"
              />
            </View>
            <View style={twStyle("mb-4 flex-row")}>
              <View style={[twStyle("flex-1"), { marginRight: 12 }]}>
                <Text style={twStyle("mb-1.5 text-sm font-medium text-gray-700")}>City *</Text>
                <TextInput
                  style={twStyle(`rounded-xl border bg-white px-4 py-3 text-base text-gray-900 ${errors.city ? "border-red-500" : "border-gray-200"}`)}
                  value={city}
                  onChangeText={(t) => {
                    setCity(t);
                    if (errors.city) setErrors((e) => ({ ...e, city: "" }));
                  }}
                  placeholder="City"
                  placeholderTextColor="#9ca3af"
                />
                {errors.city ? (
                  <Text style={twStyle("mt-1 text-sm text-red-500")}>
                    {errors.city === "validation.required"
                      ? t(errors.city, { field: FIELD_LABELS.city })
                      : t(errors.city)}
                  </Text>
                ) : null}
              </View>
              <View style={twStyle("flex-1")}>
                <Text style={twStyle("mb-1.5 text-sm font-medium text-gray-700")}>Country *</Text>
                <TextInput
                  style={twStyle(`rounded-xl border bg-white px-4 py-3 text-base text-gray-900 ${errors.country ? "border-red-500" : "border-gray-200"}`)}
                  value={country}
                  onChangeText={(t) => {
                    setCountry(t);
                    if (errors.country) setErrors((e) => ({ ...e, country: "" }));
                  }}
                  placeholder="Country"
                  placeholderTextColor="#9ca3af"
                />
                {errors.country ? (
                  <Text style={twStyle("mt-1 text-sm text-red-500")}>
                    {errors.country === "validation.required"
                      ? t(errors.country, { field: FIELD_LABELS.country })
                      : t(errors.country)}
                  </Text>
                ) : null}
              </View>
            </View>
            <View style={twStyle("mb-4 flex-row")}>
              <View style={[twStyle("flex-1"), { marginRight: 12 }]}>
                <Text style={twStyle("mb-1.5 text-sm font-medium text-gray-700")}>State / Province</Text>
                <TextInput
                  style={twStyle("rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
                  value={state}
                  onChangeText={setState}
                  placeholder="Optional"
                  placeholderTextColor="#9ca3af"
                />
              </View>
              <View style={twStyle("flex-1")}>
                <Text style={twStyle("mb-1.5 text-sm font-medium text-gray-700")}>Postal code</Text>
                <TextInput
                  style={twStyle("rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
                  value={postal_code}
                  onChangeText={setPostalCode}
                  placeholder="Optional"
                  placeholderTextColor="#9ca3af"
                />
              </View>
            </View>
            <View style={twStyle("mb-4")}>
              <E164PhoneField
                label="Phone"
                valueE164={phoneE164}
                onChangeE164={setPhoneE164}
                showHint={false}
                accessibilityLabel="Location phone"
              />
            </View>
            <View style={twStyle("mb-4 flex-row items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3")}>
              <Text style={twStyle("text-base text-gray-900")}>Active</Text>
              <Switch
                value={is_active}
                onValueChange={setIsActive}
                trackColor={{ true: "#14b8a6", false: "#d1d5db" }}
                thumbColor="#fff"
              />
            </View>
            <View style={twStyle("mb-6 flex-row items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3")}>
              <Text style={twStyle("text-base text-gray-900")}>Primary location</Text>
              <Switch
                value={is_primary}
                onValueChange={setIsPrimary}
                trackColor={{ true: "#14b8a6", false: "#d1d5db" }}
                thumbColor="#fff"
              />
            </View>

            <ActionButton
              label="Save changes"
              variant="primary"
              onPress={handleSave}
              loading={saving}
              fullWidth
            />

            <TouchableOpacity
              onPress={handleDelete}
              style={twStyle("mt-6 py-4 items-center")}
              accessibilityRole="button"
              accessibilityLabel="Delete location"
            >
              <Text style={twStyle("text-sm font-medium text-red-600")}>Delete location</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
