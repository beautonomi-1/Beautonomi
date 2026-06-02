/**
 * Bottom-sheet address picker: saved addresses + Mapbox search + optional map pin.
 * Search suggestions render directly under the search field so they stay visible.
 */
import { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Pressable,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Alert,
  FlatList,
  StyleSheet,
} from "react-native";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { useAuth } from "@/providers/AuthProvider";
import {
  useAddresses,
  searchAddress,
  reverseGeocode,
  type SavedAddress,
  type GeocodeSuggestion,
} from "@/hooks/useAddresses";
import { mapGeocodeFeatureToAddressParts } from "@beautonomi/utils";
import { haptic } from "@/lib/haptics";
import { ensureForegroundLocationPermission } from "@/lib/native-permissions";
import { useResponsive } from "@/hooks/useResponsive";
import { RADIUS_INPUT, RADIUS_CARD } from "@/constants/layout";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { AddressMapPinModal, type ResolvedPinAddress } from "./AddressMapPinModal";
import { useTranslation } from "@beautonomi/i18n";

export interface AddressPickerSelection {
  label: string;
  latitude: number;
  longitude: number;
  displayName: string;
  /** When selecting a saved address, its id so caller can skip "save?" modal */
  addressId?: string;
  /** When selecting a Mapbox suggestion or saved address, full fields for save/hold */
  structured?: {
    address_line1: string;
    address_line2?: string;
    city: string;
    state?: string;
    postal_code?: string;
    country: string;
  };
}

interface AddressPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (address: AddressPickerSelection) => void;
  onUseCurrentLocation: () => void;
  /** Prefill the search box (e.g. when editing an existing address). */
  initialQuery?: string;
}

const SUGGESTIONS_MAX_HEIGHT = 280;

export function AddressPicker({
  visible,
  onClose,
  onSelect,
  onUseCurrentLocation,
  initialQuery,
}: AddressPickerProps) {
  const { t } = useTranslation();
  const { contentPadding } = useResponsive();
  const { bundle } = useConfigBundle();
  const defaultCountryLabel = bundle?.meta?.tenant_region?.name?.trim() || "—";
  // Scope address search to the tenant's active market (ISO 3166-1 alpha-2),
  // mirroring the provider location step. Falls back to undefined (no country
  // filter, proximity-biased) when the bundle hasn't resolved a market yet.
  const marketCountryIso = (() => {
    const raw = (
      bundle?.meta?.active_market_country ||
      bundle?.meta?.tenant_region?.code ||
      ""
    )
      .trim()
      .toUpperCase();
    return /^[A-Z]{2}$/.test(raw) ? raw : undefined;
  })();
  const { user } = useAuth();
  const {
    addresses,
    loading: addressesLoading,
    error: addressesError,
    reload: reloadAddresses,
  } = useAddresses(visible && !!user);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<GeocodeSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [mapPinVisible, setMapPinVisible] = useState(false);
  const lastKnownCoordsRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) {
      setQuery("");
      setSuggestions([]);
      setMapPinVisible(false);
    } else if (initialQuery?.trim()) {
      setQuery(initialQuery.trim());
      if (initialQuery.trim().length >= 3) {
        setSearching(true);
        const proximity = lastKnownCoordsRef.current
          ? { longitude: lastKnownCoordsRef.current.longitude, latitude: lastKnownCoordsRef.current.latitude }
          : undefined;
        searchAddress(initialQuery.trim(), { proximity, country: marketCountryIso }).then((results) => {
          setSuggestions(results);
          setSearching(false);
        });
      }
    }
  }, [visible, initialQuery, marketCountryIso]);

  const handleSearch = useCallback(
    (text: string) => {
      setQuery(text);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (text.length < 2) {
        setSuggestions([]);
        return;
      }
      debounceRef.current = setTimeout(async () => {
        setSearching(true);
        const proximity = lastKnownCoordsRef.current
          ? { longitude: lastKnownCoordsRef.current.longitude, latitude: lastKnownCoordsRef.current.latitude }
          : undefined;
        const results = await searchAddress(text, { proximity, country: marketCountryIso });
        setSuggestions(results);
        setSearching(false);
      }, 300);
    },
    [marketCountryIso],
  );

  const parseStructuredFromSuggestion = useCallback(
    (s: GeocodeSuggestion): AddressPickerSelection["structured"] => {
      const mapped = mapGeocodeFeatureToAddressParts(s, {
        defaultCountryName: defaultCountryLabel,
      });
      const parts = (s.place_name || "").split(",").map((p) => p.trim()).filter(Boolean);
      return {
        address_line1: mapped.address_line1 || parts[0] || s.text || "",
        city: mapped.city || parts[1] || "—",
        state: mapped.state || undefined,
        postal_code: mapped.postal_code || undefined,
        country: mapped.country || defaultCountryLabel,
      };
    },
    [defaultCountryLabel],
  );

  const applyGeocodeFeature = useCallback(
    (s: GeocodeSuggestion) => {
      const structured = parseStructuredFromSuggestion(s);
      onSelect({
        label: s.text,
        latitude: s.center[1],
        longitude: s.center[0],
        displayName: s.place_name,
        structured,
      });
      onClose();
    },
    [onSelect, onClose, parseStructuredFromSuggestion],
  );

  const handleSavedSelect = useCallback(
    (addr: SavedAddress) => {
      haptic.light();
      Keyboard.dismiss();
      if (addr.latitude != null && addr.longitude != null) {
        onSelect({
          label: addr.label,
          latitude: addr.latitude,
          longitude: addr.longitude,
          displayName: `${addr.address_line1}, ${addr.city}`,
          addressId: addr.id,
          structured: {
            address_line1: addr.address_line1,
            address_line2: addr.address_line2 ?? undefined,
            city: addr.city,
            state: addr.state ?? undefined,
            postal_code: addr.postal_code ?? undefined,
            country: addr.country,
          },
        });
        onClose();
      } else {
        Alert.alert(
          "No location data",
          "This address doesn’t have coordinates. Drop a pin on the map, or delete and add this address again.",
          [{ text: "OK" }],
        );
      }
    },
    [onSelect, onClose],
  );

  const handleSuggestionSelect = useCallback(
    (s: GeocodeSuggestion) => {
      haptic.light();
      Keyboard.dismiss();
      applyGeocodeFeature(s);
    },
    [applyGeocodeFeature],
  );

  const handleMapPinCoordinates = useCallback(
    async (lat: number, lng: number, resolved?: ResolvedPinAddress) => {
      lastKnownCoordsRef.current = { latitude: lat, longitude: lng };
      haptic.light();
      Keyboard.dismiss();

      const fallbackCountry = defaultCountryLabel !== "—" ? defaultCountryLabel : "";

      // 1) Prefer the address the map modal already resolved via Mapbox v6 — the
      //    same lookup that powered the live preview, with the best coverage.
      const resolvedLine1 = resolved?.address_line1?.trim();
      const resolvedName = resolved?.place_name?.trim();
      if (resolvedLine1 || resolvedName) {
        const line1 = resolvedLine1 || resolvedName || "Pinned location";
        onSelect({
          label: line1,
          latitude: lat,
          longitude: lng,
          displayName: resolvedName || line1,
          structured: {
            address_line1: line1,
            city: resolved?.city?.trim() || "",
            state: resolved?.state?.trim() || undefined,
            postal_code: resolved?.postal_code?.trim() || undefined,
            country: resolved?.country?.trim() || fallbackCountry,
          },
        });
        onClose();
        return;
      }

      // 2) Fall back to the server reverse-geocode (v5) used elsewhere.
      let feature: GeocodeSuggestion | null = null;
      try {
        feature = await reverseGeocode(lat, lng);
      } catch {
        feature = null;
      }
      if (feature?.place_name) {
        applyGeocodeFeature(feature);
        return;
      }

      // 3) Provider-parity soft-fail: a dropped pin always gives valid
      //    coordinates, which is exactly what house-call bookings need. Rather
      //    than dead-ending with "could not resolve address" (the old behavior),
      //    accept the coordinates with a "Pinned location" starter so the
      //    caller's editable address form (with the map preview) appears and the
      //    user can fill in the street/suburb.
      onSelect({
        label: "Pinned location",
        latitude: lat,
        longitude: lng,
        displayName: "Pinned location",
        structured: {
          address_line1: "Pinned location",
          city: "",
          country: fallbackCountry,
        },
      });
      onClose();
    },
    [applyGeocodeFeature, onSelect, onClose, defaultCountryLabel],
  );

  const resolveTypedAddress = useCallback(async () => {
    const q = query.trim();
    if (q.length < 2) return;
    const proximity = lastKnownCoordsRef.current
      ? { longitude: lastKnownCoordsRef.current.longitude, latitude: lastKnownCoordsRef.current.latitude }
      : undefined;
    setSearching(true);
    try {
      const results = await searchAddress(q, { proximity, country: marketCountryIso });
      if (results.length > 0) {
        handleSuggestionSelect(results[0]);
        return;
      }
      Alert.alert(
        t("customer.mobile.components.addressPicker.noResultsTitle"),
        t("customer.mobile.components.addressPicker.noResultsBody"),
      );
    } finally {
      setSearching(false);
    }
  }, [query, handleSuggestionSelect, marketCountryIso, t]);

  const handleUseCurrentLocation = useCallback(async () => {
    if (gettingLocation) return;
    haptic.light();
    Keyboard.dismiss();
    setGettingLocation(true);
    try {
      const allowed = await ensureForegroundLocationPermission({
        title: t("customer.mobile.components.addressPicker.locationAccessTitle"),
        message: t("customer.mobile.components.addressPicker.locationAccessBody"),
      });
      if (!allowed) {
        return;
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const lat = loc.coords.latitude;
      const lng = loc.coords.longitude;
      lastKnownCoordsRef.current = { latitude: lat, longitude: lng };

      let structured: AddressPickerSelection["structured"] | undefined;
      let displayName = "Current location";

      const feature = await reverseGeocode(lat, lng);
      if (feature?.place_name && feature?.center) {
        displayName = feature.place_name;
        const mapped = mapGeocodeFeatureToAddressParts(feature, {
          defaultCountryName: defaultCountryLabel,
        });
        structured = {
          address_line1: mapped.address_line1 || "Current location",
          city: mapped.city || "—",
          state: mapped.state || undefined,
          postal_code: mapped.postal_code || undefined,
          country: mapped.country || defaultCountryLabel,
        };
      } else {
        structured = {
          address_line1: "Current location",
          city: "—",
          country: defaultCountryLabel,
        };
      }

      onSelect({
        label: "Current location",
        latitude: lat,
        longitude: lng,
        displayName,
        structured,
      });
      onUseCurrentLocation();
      onClose();
    } catch (e) {
      Alert.alert(
        t("customer.mobile.components.addressPicker.locationErrorTitle"),
        e instanceof Error ? e.message : t("customer.mobile.components.addressPicker.locationErrorBody"),
      );
    } finally {
      setGettingLocation(false);
    }
  }, [onSelect, onUseCurrentLocation, onClose, gettingLocation, defaultCountryLabel, t]);

  const searchActive = query.trim().length >= 2;
  const showSuggestionPanel = searchActive && (searching || suggestions.length > 0);
  const showNoMatches = searchActive && !searching && suggestions.length === 0;

  const renderSuggestionItem = useCallback(
    ({ item }: { item: GeocodeSuggestion }) => (
      <TouchableOpacity
        onPress={() => handleSuggestionSelect(item)}
        delayPressIn={80}
        style={styles.suggestionRow}
        accessibilityRole="button"
      >
        <Ionicons name="location-outline" size={18} color={Colors.gray[500]} style={{ marginRight: 10 }} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[900] }} numberOfLines={2}>
            {item.text}
          </Text>
          <Text style={{ fontSize: 12, color: Colors.gray[400], marginTop: 2 }} numberOfLines={2}>
            {item.place_name}
          </Text>
        </View>
      </TouchableOpacity>
    ),
    [handleSuggestionSelect],
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}
        onPress={onClose}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ width: "100%", maxHeight: Platform.OS === "android" ? "92%" : "90%" }}
          keyboardVerticalOffset={Platform.OS === "ios" ? 48 : 0}
        >
          <Pressable
            style={{
              backgroundColor: Colors.white,
              borderTopLeftRadius: RADIUS_CARD,
              borderTopRightRadius: RADIUS_CARD,
              flexGrow: 1,
              maxHeight: "100%",
              paddingBottom: 24,
            }}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={{ alignItems: "center", paddingTop: 12, paddingBottom: 8 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.gray[300] }} />
            </View>

            <View style={{ paddingHorizontal: contentPadding, flexShrink: 0 }}>
              <Text style={{ fontSize: 20, fontWeight: "700", color: Colors.gray[900], marginBottom: 12 }}>
                {t("customer.mobile.components.addressPicker.selectTitle")}
              </Text>

              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: Colors.gray[100],
                  borderRadius: RADIUS_INPUT,
                  paddingHorizontal: 14,
                  borderWidth: searchActive ? 1.5 : 0,
                  borderColor: searchActive ? Colors.primary + "55" : "transparent",
                }}
              >
                <Ionicons name="search-outline" size={18} color={Colors.gray[400]} />
                <TextInput
                  style={{ flex: 1, paddingVertical: 12, paddingHorizontal: 10, fontSize: 15, color: Colors.gray[900] }}
                  placeholder={t("customer.mobile.components.addressPicker.searchPlaceholder")}
                  placeholderTextColor={Colors.gray[400]}
                  value={query}
                  onChangeText={handleSearch}
                  onSubmitEditing={() => {
                    void resolveTypedAddress();
                  }}
                  returnKeyType="search"
                  autoCorrect={false}
                />
                {searching && <ActivityIndicator size="small" color={Colors.primary} />}
              </View>

              {searchActive ? (
                <Text style={{ fontSize: 12, color: Colors.gray[500], marginTop: 8 }}>
                  {t("customer.mobile.components.addressPicker.matchesHint")}
                </Text>
              ) : null}

              {/* Suggestions anchored directly under the search field */}
              {showSuggestionPanel ? (
                <View
                  style={styles.suggestionPanel}
                  onStartShouldSetResponder={() => true}
                  onMoveShouldSetResponder={() => true}
                >
                  <Text style={styles.suggestionPanelTitle}>Search results</Text>
                  {searching && suggestions.length === 0 ? (
                    <View style={{ paddingVertical: 28, alignItems: "center", justifyContent: "center" }}>
                      <ActivityIndicator size="small" color={Colors.primary} />
                    </View>
                  ) : (
                    <FlatList
                      data={suggestions}
                      keyExtractor={(item, index) => `${item.place_name}-${index}`}
                      renderItem={renderSuggestionItem}
                      keyboardShouldPersistTaps="always"
                      style={{ maxHeight: SUGGESTIONS_MAX_HEIGHT }}
                      contentContainerStyle={{ paddingBottom: 6 }}
                      nestedScrollEnabled
                      showsVerticalScrollIndicator
                    />
                  )}
                </View>
              ) : null}

              {showNoMatches ? (
                <View style={styles.noMatchesBox}>
                  <Ionicons
                    name="information-circle-outline"
                    size={18}
                    color={Colors.gray[400]}
                    style={{ marginRight: 8, marginTop: 1 }}
                  />
                  <Text style={styles.noMatchesText}>
                    No matches yet. Keep typing, press search on the keyboard, or use the map pin.
                  </Text>
                </View>
              ) : null}

              <TouchableOpacity
                onPress={handleUseCurrentLocation}
                disabled={gettingLocation}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 14,
                  marginTop: showSuggestionPanel || showNoMatches ? 8 : 12,
                  borderBottomWidth: 1,
                  borderColor: Colors.gray[100],
                }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: Colors.primaryLight,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {gettingLocation ? (
                    <ActivityIndicator size="small" color={Colors.primary} />
                  ) : (
                    <Ionicons name="locate-outline" size={18} color={Colors.primary} />
                  )}
                </View>
                <Text style={{ fontSize: 15, fontWeight: "500", color: Colors.primary, marginLeft: 10 }}>
                  {gettingLocation ? "Getting location…" : "Use current location"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  Keyboard.dismiss();
                  setMapPinVisible(true);
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 14,
                  borderBottomWidth: 1,
                  borderColor: Colors.gray[100],
                }}
                accessibilityRole="button"
                accessibilityLabel="Drop pin on map"
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: Colors.gray[100],
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name="map-outline" size={18} color={Colors.gray[700]} />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={{ fontSize: 15, fontWeight: "600", color: Colors.gray[900] }}>Drop pin on map</Text>
                  <Text style={{ fontSize: 12, color: Colors.gray[500], marginTop: 2 }}>
                    Tap or drag the pin, then confirm
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.gray[300]} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={{ flexGrow: 1 }}
              contentContainerStyle={{ paddingBottom: 16, flexGrow: 1 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
            >
              {user && addressesError && !addressesLoading && (
                <View style={{ paddingHorizontal: contentPadding, paddingTop: 8, paddingBottom: 8 }}>
                  <Text style={{ fontSize: 13, color: "#991B1B", marginBottom: 10 }}>{addressesError}</Text>
                  <TouchableOpacity onPress={() => void reloadAddresses()} accessibilityRole="button">
                    <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.primary }}>Try again</Text>
                  </TouchableOpacity>
                </View>
              )}

              {user && addresses.length > 0 && (
                <View style={{ paddingHorizontal: contentPadding, paddingTop: 12 }}>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: "#6B7280", marginBottom: 8 }}>
                    Saved addresses
                  </Text>
                  {addresses.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      onPress={() => handleSavedSelect(item)}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingVertical: 14,
                        borderBottomWidth: 1,
                        borderColor: "#F3F4F6",
                      }}
                    >
                      <View
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 18,
                          backgroundColor: Colors.gray[100],
                          alignItems: "center",
                          justifyContent: "center",
                          marginRight: 10,
                        }}
                      >
                        <Ionicons
                          name={item.is_default ? "star" : "home-outline"}
                          size={16}
                          color={item.is_default ? "#F59E0B" : Colors.gray[500]}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>{item.label}</Text>
                        <Text style={{ fontSize: 12, color: Colors.gray[400] }} numberOfLines={1}>
                          {item.address_line1}, {item.city}
                        </Text>
                      </View>
                      {item.is_default && (
                        <View
                          style={{
                            backgroundColor: "#FEF3C7",
                            borderRadius: 999,
                            paddingHorizontal: 8,
                            paddingVertical: 2,
                          }}
                        >
                          <Text style={{ fontSize: 10, fontWeight: "600", color: "#92400E" }}>Default</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {addressesLoading && addresses.length === 0 && (
                <View style={{ padding: 24, alignItems: "center" }}>
                  <ActivityIndicator size="small" color={Colors.primary} />
                </View>
              )}

              {!addressesLoading && !addressesError && addresses.length === 0 && !searchActive && (
                <View style={{ paddingHorizontal: contentPadding, paddingVertical: 24, alignItems: "center" }}>
                  <Text style={{ fontSize: 13, color: Colors.gray[400], textAlign: "center", lineHeight: 18 }}>
                    Search above, use your location, or drop a pin. Saved addresses appear here for quick reuse.
                  </Text>
                </View>
              )}
            </ScrollView>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>

      <AddressMapPinModal
        visible={mapPinVisible}
        onClose={() => setMapPinVisible(false)}
        onPickCoordinates={(lat, lng, resolved) => void handleMapPinCoordinates(lat, lng, resolved)}
        initialCoordinate={lastKnownCoordsRef.current}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  suggestionPanel: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: 12,
    backgroundColor: Colors.gray[50],
    overflow: "hidden",
  },
  suggestionPanelTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.gray[500],
    textTransform: "uppercase",
    letterSpacing: 0.6,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
  },
  suggestionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.gray[200],
    backgroundColor: Colors.white,
  },
  noMatchesBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: Colors.gray[50],
    borderWidth: 1,
    borderColor: Colors.gray[100],
  },
  noMatchesText: {
    flex: 1,
    fontSize: 13,
    color: Colors.gray[600],
    lineHeight: 18,
  },
});
