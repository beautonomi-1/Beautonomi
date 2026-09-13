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
import { ensureForegroundLocationPermission, PERMISSION_COPY } from "@/lib/native-permissions";
import { countryFilterIso2FromStorage } from "@beautonomi/utils";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { getCachedConfigBundle } from "@/lib/config-bundle";
import { isPlanGateErrorCode, showPlanGateAlert } from "@/lib/plan-gate";

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
  const al = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t("provider.mobile.screens.addLocation." + key, opts) as string,
    [t],
  );
  const FIELD_LABELS: Record<string, string> = {
    name: al("fieldName"),
    address_line1: al("fieldAddressLine1"),
    city: al("fieldCity"),
    country: al("fieldCountry"),
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
      const code = (res.error as { code?: string }).code;
      const msg = res.error.message || al("addFailed");
      if (isPlanGateErrorCode(code)) {
        showPlanGateAlert({ message: msg, errorCode: code, router });
      } else {
        Alert.alert(al("errorTitle"), msg);
      }
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert(al("savedTitle"), al("savedBody"), [
      { text: al("ok"), onPress: () => router.back() },
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- FIELD_LABELS is static
  }, [name, address_line1, address_line2, city, state, postal_code, country, phoneE164, latitude, longitude, router, t, al]);

  const handleUseCurrentLocationPin = useCallback(async () => {
    if (locating) return;
    setLocating(true);
    try {
      const allowed = await ensureForegroundLocationPermission(PERMISSION_COPY.locationPin);
      if (!allowed) {
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
      const lat = loc.coords.latitude;
      const lng = loc.coords.longitude;
      const defaultCountry = country.trim() || tenantCountryFallback() || al("defaultCountry");
      const mapped = await reverseGeocodeCoordinates(lat, lng, defaultCountry);
      if (mapped) {
        setAddressLine1(mapped.address_line1 || address_line1 || al("currentLocationFallback"));
        setCity(mapped.city || city || al("dash"));
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
      Alert.alert(al("locationErrorTitle"), e instanceof Error ? e.message : al("locationErrorBody"));
    } finally {
      setLocating(false);
    }
  }, [locating, country, address_line1, city, errors.address_line1, errors.city, errors.country, al]);

  const handleDropPinConfirm = useCallback(
    async (lat: number, lng: number) => {
      const defaultCountry = country.trim() || tenantCountryFallback() || al("defaultCountry");
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
    [country, errors.address_line1, errors.city, errors.country, al],
  );

  return (
    <ScreenContainer scrollable={false} keyboardAvoiding={false}>
      <ScreenHeader title={al("title")} onBack={() => router.back()} />
      <KeyboardAvoidingView
        behavior="padding"
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === "ios" ? 56 : 0}
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
              <Text style={{ marginBottom: 6, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>{al("nameLabel")}</Text>
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
                placeholder={al("namePlaceholder")}
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
              <Text style={{ marginBottom: 6, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>{al("addressLabel")}</Text>
              <Text style={{ marginBottom: 8, fontSize: 12, color: Colors.gray[500] }}>
                {al("addressHint")}
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
                placeholder={al("addressPlaceholder")}
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
                  accessibilityLabel={al("useCurrentLocationA11y")}
                  accessibilityRole="button"
                >
                  {locating ? (
                    <ActivityIndicator size="small" color="#2563eb" />
                  ) : (
                    <Ionicons name="locate-outline" size={16} color="#2563eb" />
                  )}
                  <Text style={{ marginStart: 6, fontSize: 12, fontWeight: "600", color: "#1d4ed8" }}>
                    {locating ? al("locating") : al("currentLocation")}
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
                  accessibilityLabel={al("dropPinA11y")}
                  accessibilityRole="button"
                >
                  <Ionicons name="map-outline" size={16} color={Colors.gray[700]} />
                  <Text style={{ marginStart: 6, fontSize: 12, fontWeight: "600", color: Colors.gray[700] }}>
                    {al("dropPin")}
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
                    {al("mapPreview")}
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
              <Text style={{ marginBottom: 6, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>{al("addressLine2")}</Text>
              <TextInput
                style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
                value={address_line2}
                onChangeText={setAddressLine2}
                placeholder={al("addressLine2Placeholder")}
                placeholderTextColor="#9ca3af"
              />
            </View>
            <View style={{ marginBottom: 16, flexDirection: "row" }}>
              <View style={{ flex: 1, marginEnd: 12 }}>
                <Text style={{ marginBottom: 6, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>{al("cityLabel")}</Text>
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
                  placeholder={al("cityPlaceholder")}
                  placeholderTextColor="#9ca3af"
                />
                {errors.city ? (
                  <Text style={{ marginTop: 4, fontSize: 14, color: "#ef4444" }}>
                    {errors.city === "validation.required" ? t(errors.city, { field: FIELD_LABELS.city }) : t(errors.city)}
                  </Text>
                ) : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ marginBottom: 6, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>{al("countryLabel")}</Text>
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
                  placeholder={al("countryPlaceholder")}
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
              <View style={{ flex: 1, marginEnd: 12 }}>
                <Text style={{ marginBottom: 6, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>{al("stateLabel")}</Text>
                <TextInput
                  style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
                  value={state}
                  onChangeText={setState}
                  placeholder={al("optionalPlaceholder")}
                  placeholderTextColor="#9ca3af"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ marginBottom: 6, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>{al("postalCode")}</Text>
                <TextInput
                  style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
                  value={postal_code}
                  onChangeText={setPostalCode}
                  placeholder={al("optionalPlaceholder")}
                  placeholderTextColor="#9ca3af"
                  keyboardType="default"
                />
              </View>
            </View>
            <View style={{ marginBottom: 24 }}>
              <E164PhoneField
                label={al("phoneLabel")}
                valueE164={phoneE164}
                onChangeE164={setPhoneE164}
                showHint={false}
                accessibilityLabel={al("phoneA11y")}
              />
            </View>
            <ActionButton
              label={al("addCta")}
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
