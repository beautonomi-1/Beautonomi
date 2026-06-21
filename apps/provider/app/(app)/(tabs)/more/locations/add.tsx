/**
 * Add location – POST /api/provider/locations. Required: name, address_line1, city, country.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TextInput, ScrollView, Alert, Platform, TouchableOpacity, ActivityIndicator, useWindowDimensions } from "react-native";
import { AppKeyboardAvoidingView as KeyboardAvoidingView } from "@/components/AppKeyboardAvoidingView";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "@beautonomi/i18n";
import { api } from "@/lib/api-client";
import { validateRequired } from "@/lib/validation";
import { validateE164Phone } from "@/lib/phone-country-codes";
import { E164PhoneField } from "@/components/E164PhoneField";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { AddressAutocomplete } from "@/components/ui/AddressAutocomplete";
import { AddressMapPinModal } from "@/components/AddressMapPinModal";
import { StaticMapImage } from "@/components/ui/StaticMapImage";
import { reverseGeocodeCoordinates } from "@/lib/reverse-geocode-address";
import { Colors } from "@/constants/colors";
import { ensureForegroundLocationPermission } from "@/lib/native-permissions";
import { countryFilterIso2FromStorage } from "@beautonomi/utils";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { getCachedConfigBundle } from "@/lib/config-bundle";

function tenantCountryFallback(): string {
  return getCachedConfigBundle()?.meta?.tenant_region?.name?.trim() || "";
}

export default function AddLocationScreen() {
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const { bundle } = useConfigBundle();
  const countrySeeded = useRef(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [address_line1, setAddressLine1] = useState("");
  const [address_line2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postal_code, setPostalCode] = useState("");
  const [country, setCountry] = useState("");

  useEffect(() => {
    if (countrySeeded.current) return;
    const n = bundle?.meta?.tenant_region?.name?.trim();
    if (n) {
      setCountry(n);
      countrySeeded.current = true;
    }
  }, [bundle?.meta?.tenant_region?.name]);
  const [phoneE164, setPhoneE164] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);
  const [mapPinVisible, setMapPinVisible] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const pinInitialCoordinate = useMemo(() => {
    if (latitude != null && longitude != null) {
      return { latitude, longitude };
    }
    return null;
  }, [latitude, longitude]);

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
    const res = await api.post<{ id: string }>("/api/provider/locations", {
      name: trimmedName,
      address_line1: trimmedAddress,
      address_line2: address_line2.trim() || undefined,
      city: trimmedCity,
      state: state.trim() || undefined,
      postal_code: postal_code.trim() || undefined,
      country: trimmedCountry,
      phone: phoneE164.trim() || undefined,
      latitude: latitude ?? undefined,
      longitude: longitude ?? undefined,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- FIELD_LABELS is static
  }, [name, address_line1, address_line2, city, state, postal_code, country, phoneE164, latitude, longitude, router, t]);

  const handleUseCurrentLocationPin = useCallback(async () => {
    if (locating) return;
    setLocating(true);
    try {
      const allowed = await ensureForegroundLocationPermission({
        title: "Location permission",
        message: "Allow location access to place a map pin from your current position.",
      });
      if (!allowed) {
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
      const lat = loc.coords.latitude;
      const lng = loc.coords.longitude;
      const defaultCountry = country.trim() || tenantCountryFallback() || "South Africa";
      const mapped = await reverseGeocodeCoordinates(lat, lng, defaultCountry);
      if (mapped) {
        setAddressLine1(mapped.address_line1 || address_line1 || "Current location");
        setCity(mapped.city || city || "—");
        setState(mapped.state || "");
        setPostalCode(mapped.postal_code || "");
        setCountry(mapped.country || defaultCountry);
        setLatitude(mapped.latitude);
        setLongitude(mapped.longitude);
      } else {
        setLatitude(lat);
        setLongitude(lng);
      }
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

  const handleDropPinConfirm = useCallback(
    async (lat: number, lng: number) => {
      const defaultCountry = country.trim() || tenantCountryFallback() || "South Africa";
      const mapped = await reverseGeocodeCoordinates(lat, lng, defaultCountry);
      if (mapped) {
        setAddressLine1(mapped.address_line1);
        setCity(mapped.city);
        setState(mapped.state);
        setPostalCode(mapped.postal_code);
        setCountry(mapped.country);
        setLatitude(mapped.latitude);
        setLongitude(mapped.longitude);
      } else {
        setLatitude(lat);
        setLongitude(lng);
      }
      setMapPinVisible(false);
      if (errors.address_line1 || errors.city || errors.country) {
        setErrors((e) => ({ ...e, address_line1: "", city: "", country: "" }));
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [country, errors.address_line1, errors.city, errors.country],
  );

  return (
    <ScreenContainer scrollable={false} keyboardAvoiding={false}>
      <ScreenHeader title="Add location" onBack={() => router.back()} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "padding"}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === "ios" ? 56 : 20}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 220 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={{ paddingHorizontal: 16 }}>
            <View style={{ marginBottom: 16 }}>
              <Text style={{ marginBottom: 6, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Location name *</Text>
              <TextInput
                style={{
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: errors.name ? "#ef4444" : Colors.gray[200],
                  backgroundColor: Colors.white,
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  fontSize: 16,
                  color: Colors.gray[900],
                }}
                value={name}
                onChangeText={(t) => {
                  setName(t);
                  if (errors.name) setErrors((e) => ({ ...e, name: "" }));
                }}
                placeholder="e.g. Main salon"
                placeholderTextColor="#9ca3af"
              />
              {errors.name ? (
                <Text style={{ marginTop: 4, fontSize: 14, color: "#ef4444" }}>
                  {errors.name === "validation.required"
                    ? t(errors.name, { field: FIELD_LABELS.name })
                    : t(errors.name)}
                </Text>
              ) : null}
            </View>
            <View style={{ marginBottom: 16 }}>
              <Text style={{ marginBottom: 6, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Address *</Text>
              <Text style={{ marginBottom: 8, fontSize: 12, color: Colors.gray[500] }}>
                Search for an address to fill city, state, postal code and coordinates automatically, or type manually.
              </Text>
              <AddressAutocomplete
                value={address_line1}
                onSelect={(addr) => {
                  setAddressLine1(addr.address_line1);
                  setCity(addr.city);
                  setState(addr.state);
                  setPostalCode(addr.postal_code);
                  setCountry(addr.country || tenantCountryFallback());
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
              <View style={{ marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                <TouchableOpacity
                  onPress={() => {
                    void handleUseCurrentLocationPin();
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
                  <Text style={{ marginLeft: 6, fontSize: 12, fontWeight: "600", color: "#1d4ed8" }}>
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
                    borderColor: Colors.gray[200],
                    backgroundColor: Colors.white,
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                  }}
                  accessibilityLabel="Drop pin on map"
                  accessibilityRole="button"
                >
                  <Ionicons name="map-outline" size={16} color={Colors.gray[700]} />
                  <Text style={{ marginLeft: 6, fontSize: 12, fontWeight: "600", color: Colors.gray[700] }}>
                    Drop pin on map
                  </Text>
                </TouchableOpacity>
              </View>
              {latitude != null && longitude != null ? (
                <View style={{ marginTop: 12, overflow: "hidden", borderRadius: 16 }}>
                  <StaticMapImage
                    latitude={latitude}
                    longitude={longitude}
                    width={Math.min(windowWidth - 32, 400)}
                    height={150}
                    zoom={15}
                  />
                  <Text style={{ marginTop: 6, fontSize: 12, color: Colors.gray[500], textAlign: "center" }}>
                    Map preview
                  </Text>
                </View>
              ) : null}
              {errors.address_line1 ? (
                <Text style={{ marginTop: 4, fontSize: 14, color: "#ef4444" }}>
                  {errors.address_line1 === "validation.required"
                    ? t(errors.address_line1, { field: FIELD_LABELS.address_line1 })
                    : t(errors.address_line1)}
                </Text>
              ) : null}
            </View>
            <View style={{ marginBottom: 16 }}>
              <Text style={{ marginBottom: 6, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Address line 2</Text>
              <TextInput
                style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
                value={address_line2}
                onChangeText={setAddressLine2}
                placeholder="Suite, floor, etc."
                placeholderTextColor="#9ca3af"
              />
            </View>
            <View style={{ marginBottom: 16, flexDirection: "row" }}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={{ marginBottom: 6, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>City *</Text>
                <TextInput
                  style={{
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: errors.city ? "#ef4444" : Colors.gray[200],
                    backgroundColor: Colors.white,
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    fontSize: 16,
                    color: Colors.gray[900],
                  }}
                  value={city}
                  onChangeText={(t) => {
                    setCity(t);
                    if (errors.city) setErrors((e) => ({ ...e, city: "" }));
                  }}
                  placeholder="City"
                  placeholderTextColor="#9ca3af"
                />
                {errors.city ? (
                  <Text style={{ marginTop: 4, fontSize: 14, color: "#ef4444" }}>
                    {errors.city === "validation.required" ? t(errors.city, { field: FIELD_LABELS.city }) : t(errors.city)}
                  </Text>
                ) : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ marginBottom: 6, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Country *</Text>
                <TextInput
                  style={{
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: errors.country ? "#ef4444" : Colors.gray[200],
                    backgroundColor: Colors.white,
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    fontSize: 16,
                    color: Colors.gray[900],
                  }}
                  value={country}
                  onChangeText={(t) => {
                    setCountry(t);
                    if (errors.country) setErrors((e) => ({ ...e, country: "" }));
                  }}
                  placeholder="Country"
                  placeholderTextColor="#9ca3af"
                />
                {errors.country ? (
                  <Text style={{ marginTop: 4, fontSize: 14, color: "#ef4444" }}>
                    {errors.country === "validation.required" ? t(errors.country, { field: FIELD_LABELS.country }) : t(errors.country)}
                  </Text>
                ) : null}
              </View>
            </View>
            <View style={{ marginBottom: 16, flexDirection: "row" }}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={{ marginBottom: 6, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>State / Province</Text>
                <TextInput
                  style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
                  value={state}
                  onChangeText={setState}
                  placeholder="Optional"
                  placeholderTextColor="#9ca3af"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ marginBottom: 6, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Postal code</Text>
                <TextInput
                  style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
                  value={postal_code}
                  onChangeText={setPostalCode}
                  placeholder="Optional"
                  placeholderTextColor="#9ca3af"
                  keyboardType="default"
                />
              </View>
            </View>
            <View style={{ marginBottom: 24 }}>
              <E164PhoneField
                label="Phone"
                valueE164={phoneE164}
                onChangeE164={setPhoneE164}
                showHint={false}
                accessibilityLabel="Location phone"
              />
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
