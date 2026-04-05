/**
 * Bottom-sheet address picker: shows saved addresses + Mapbox search.
 * Selected address sets coords for distance-based home feed.
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
import { haptic } from "@/lib/haptics";
import { useResponsive } from "@/hooks/useResponsive";
import { RADIUS_INPUT, RADIUS_CARD } from "@/constants/layout";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";

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

export function AddressPicker({
  visible,
  onClose,
  onSelect,
  onUseCurrentLocation,
  initialQuery,
}: AddressPickerProps) {
  const { contentPadding } = useResponsive();
  const { bundle } = useConfigBundle();
  const defaultCountryLabel =
    bundle?.meta?.tenant_region?.name?.trim() || "—";
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
  const lastKnownCoordsRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) {
      setQuery("");
      setSuggestions([]);
    } else if (initialQuery?.trim()) {
      setQuery(initialQuery.trim());
      if (initialQuery.trim().length >= 3) {
        setSearching(true);
        const proximity = lastKnownCoordsRef.current
          ? { longitude: lastKnownCoordsRef.current.longitude, latitude: lastKnownCoordsRef.current.latitude }
          : undefined;
        searchAddress(initialQuery.trim(), { proximity }).then((results) => {
          setSuggestions(results);
          setSearching(false);
        });
      }
    }
  }, [visible, initialQuery]);

  const handleSearch = useCallback((text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.length < 3) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      const proximity = lastKnownCoordsRef.current
        ? { longitude: lastKnownCoordsRef.current.longitude, latitude: lastKnownCoordsRef.current.latitude }
        : undefined;
      const results = await searchAddress(text, { proximity });
      setSuggestions(results);
      setSearching(false);
    }, 400);
  }, []);

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
          "This address doesn’t have coordinates. Edit it in Settings → Saved addresses and choose a location on the map, or delete and add it again.",
          [{ text: "OK" }]
        );
      }
    },
    [onSelect, onClose],
  );

  const parseStructuredFromSuggestion = useCallback(
    (s: GeocodeSuggestion): AddressPickerSelection["structured"] => {
      const context = s.context ?? [];
      const find = (prefix: string) => context.find((c) => c.id.startsWith(prefix))?.text ?? "";
      const place = find("place.") || find("locality.") || find("district.");
      const country = find("country.");
      const parts = (s.place_name || "").split(",").map((p) => p.trim()).filter(Boolean);
      return {
        address_line1: parts[0] || s.text || "",
        city: place || parts[1] || "",
        state: find("region.") || undefined,
        postal_code: find("postcode.") || undefined,
        country: country || defaultCountryLabel,
      };
    },
    [defaultCountryLabel],
  );

  const handleSuggestionSelect = useCallback(
    (s: GeocodeSuggestion) => {
      haptic.light();
      Keyboard.dismiss();
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

  const handleUseCurrentLocation = useCallback(async () => {
    if (gettingLocation) return;
    haptic.light();
    Keyboard.dismiss();
    setGettingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Location access", "Allow location access to use your current position.");
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
        const context = feature.context ?? [];
        const find = (prefix: string) => context.find((c) => c.id?.startsWith(prefix))?.text ?? "";
        const place = find("place.") || find("locality.") || find("district.");
        const country = find("country.");
        const parts = (feature.place_name || "").split(",").map((p) => p.trim()).filter(Boolean);
        structured = {
          address_line1: parts[0] || feature.text || "Current location",
          city: place || parts[1] || "—",
          state: find("region.") || undefined,
          postal_code: find("postcode.") || undefined,
          country: country || defaultCountryLabel,
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
      Alert.alert("Location error", e instanceof Error ? e.message : "Could not get your location.");
    } finally {
      setGettingLocation(false);
    }
  }, [onSelect, onUseCurrentLocation, onClose, gettingLocation, defaultCountryLabel]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}
        onPress={onClose}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "padding"}
          style={{ width: "100%" }}
          keyboardVerticalOffset={Platform.OS === "ios" ? 40 : 20}
        >
          <Pressable
            style={{
              backgroundColor: Colors.white,
              borderTopLeftRadius: RADIUS_CARD,
              borderTopRightRadius: RADIUS_CARD,
              maxHeight: "80%",
              paddingBottom: 34,
            }}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={{ alignItems: "center", paddingTop: 12, paddingBottom: 8 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.gray[300] }} />
            </View>

            <View style={{ paddingHorizontal: contentPadding }}>
            <Text style={{ fontSize: 20, fontWeight: "700", color: Colors.gray[900], marginBottom: 16 }}>
              Select address
            </Text>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: Colors.gray[100],
                borderRadius: RADIUS_INPUT,
                paddingHorizontal: 14,
                marginBottom: 16,
              }}
            >
              <Ionicons name="search-outline" size={18} color={Colors.gray[400]} />
              <TextInput
                style={{ flex: 1, paddingVertical: 12, paddingHorizontal: 10, fontSize: 15, color: Colors.gray[900] }}
                placeholder="Search for an address..."
                placeholderTextColor={Colors.gray[400]}
                value={query}
                onChangeText={handleSearch}
                autoFocus={false}
              />
              {searching && <ActivityIndicator size="small" color={Colors.primary} />}
            </View>

            <TouchableOpacity
              onPress={handleUseCurrentLocation}
              disabled={gettingLocation}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 14,
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
          </View>

          <ScrollView
            style={{ maxHeight: 320 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={true}
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
              <View style={{ paddingHorizontal: contentPadding, paddingTop: 8, marginBottom: 8 }}>
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

            {suggestions.length > 0 && (
              <View style={{ paddingHorizontal: contentPadding, marginBottom: 16 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: Colors.gray[500], marginBottom: 8 }}>
                  Search results
                </Text>
                {suggestions.map((item, index) => (
                  <TouchableOpacity
                    key={`${index}-${item.place_name}`}
                    onPress={() => handleSuggestionSelect(item)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingVertical: 14,
                      borderBottomWidth: 1,
                      borderColor: Colors.gray[100],
                    }}
                  >
                    <Ionicons name="location-outline" size={18} color={Colors.gray[500]} style={{ marginRight: 10 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[900] }} numberOfLines={1}>
                        {item.text}
                      </Text>
                      <Text style={{ fontSize: 12, color: Colors.gray[400] }} numberOfLines={1}>
                        {item.place_name}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {addressesLoading && addresses.length === 0 && (
              <View style={{ padding: 24, alignItems: "center" }}>
                <ActivityIndicator size="small" color={Colors.primary} />
              </View>
            )}

            {!addressesLoading && !addressesError && addresses.length === 0 && suggestions.length === 0 && (
              <View style={{ padding: 24, alignItems: "center" }}>
                <Text style={{ fontSize: 13, color: Colors.gray[400], textAlign: "center" }}>
                  Search for an address above or use your current location
                </Text>
              </View>
            )}
          </ScrollView>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}
