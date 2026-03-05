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
  FlatList,
  ActivityIndicator,
  Pressable,
  Keyboard,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { useAuth } from "@/providers/AuthProvider";
import {
  useAddresses,
  searchAddress,
  type SavedAddress,
  type GeocodeSuggestion,
} from "@/hooks/useAddresses";
import { haptic } from "@/lib/haptics";

export interface AddressPickerSelection {
  label: string;
  latitude: number;
  longitude: number;
  displayName: string;
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
}

export function AddressPicker({
  visible,
  onClose,
  onSelect,
  onUseCurrentLocation,
}: AddressPickerProps) {
  const { user } = useAuth();
  const { addresses, loading: addressesLoading } = useAddresses(visible && !!user);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<GeocodeSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) {
      setQuery("");
      setSuggestions([]);
    }
  }, [visible]);

  const handleSearch = useCallback((text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.length < 3) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      const results = await searchAddress(text);
      setSuggestions(results);
      setSearching(false);
    }, 400);
  }, []);

  const handleSavedSelect = useCallback(
    (addr: SavedAddress) => {
      haptic.light();
      Keyboard.dismiss();
      if (addr.latitude && addr.longitude) {
        onSelect({
          label: addr.label,
          latitude: addr.latitude,
          longitude: addr.longitude,
          displayName: `${addr.address_line1}, ${addr.city}`,
          structured: {
            address_line1: addr.address_line1,
            city: addr.city,
            state: addr.state ?? undefined,
            postal_code: addr.postal_code ?? undefined,
            country: addr.country,
          },
        });
      }
      onClose();
    },
    [onSelect, onClose],
  );

  function parseStructuredFromSuggestion(s: GeocodeSuggestion): AddressPickerSelection["structured"] {
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
      country: country || "South Africa",
    };
  }

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
    [onSelect, onClose],
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}
        onPress={onClose}
      >
        <Pressable
          style={{
            backgroundColor: "#fff",
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            maxHeight: "80%",
            paddingBottom: 34,
          }}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={{ alignItems: "center", paddingTop: 12, paddingBottom: 8 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: "#D1D5DB" }} />
          </View>

          <View style={{ paddingHorizontal: 20 }}>
            <Text style={{ fontSize: 20, fontWeight: "700", color: "#111827", marginBottom: 16 }}>
              Select address
            </Text>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: "#F3F4F6",
                borderRadius: 12,
                paddingHorizontal: 14,
                marginBottom: 16,
              }}
            >
              <Ionicons name="search-outline" size={18} color="#9CA3AF" />
              <TextInput
                style={{ flex: 1, paddingVertical: 12, paddingHorizontal: 10, fontSize: 15, color: "#111827" }}
                placeholder="Search for an address..."
                placeholderTextColor="#9CA3AF"
                value={query}
                onChangeText={handleSearch}
                autoFocus={false}
              />
              {searching && <ActivityIndicator size="small" color={Colors.primary} />}
            </View>

            <TouchableOpacity
              onPress={() => { haptic.light(); onUseCurrentLocation(); onClose(); }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
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
                  backgroundColor: "rgba(255,0,119,0.08)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="locate-outline" size={18} color={Colors.primary} />
              </View>
              <Text style={{ fontSize: 15, fontWeight: "500", color: Colors.primary }}>
                Use current location
              </Text>
            </TouchableOpacity>
          </View>

          {suggestions.length > 0 ? (
            <FlatList
              data={suggestions}
              keyExtractor={(_, i) => String(i)}
              style={{ maxHeight: 240, paddingHorizontal: 20 }}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => handleSuggestionSelect(item)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    paddingVertical: 14,
                    borderBottomWidth: 1,
                    borderColor: "#F3F4F6",
                  }}
                >
                  <Ionicons name="location-outline" size={18} color="#6B7280" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: "500", color: "#111827" }} numberOfLines={1}>
                      {item.text}
                    </Text>
                    <Text style={{ fontSize: 12, color: "#9CA3AF" }} numberOfLines={1}>
                      {item.place_name}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          ) : user && addresses.length > 0 ? (
            <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
              <Text style={{ fontSize: 13, fontWeight: "600", color: "#6B7280", marginBottom: 8 }}>
                Saved addresses
              </Text>
              <FlatList
                data={addresses}
                keyExtractor={(a) => a.id}
                style={{ maxHeight: 240 }}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <TouchableOpacity
                    onPress={() => handleSavedSelect(item)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
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
                        backgroundColor: "#F3F4F6",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Ionicons
                        name={item.is_default ? "star" : "home-outline"}
                        size={16}
                        color={item.is_default ? "#F59E0B" : "#6B7280"}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827" }}>{item.label}</Text>
                      <Text style={{ fontSize: 12, color: "#9CA3AF" }} numberOfLines={1}>
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
                )}
              />
            </View>
          ) : addressesLoading ? (
            <View style={{ padding: 24, alignItems: "center" }}>
              <ActivityIndicator size="small" color={Colors.primary} />
            </View>
          ) : (
            <View style={{ padding: 24, alignItems: "center" }}>
              <Text style={{ fontSize: 13, color: "#9CA3AF", textAlign: "center" }}>
                Search for an address above or use your current location
              </Text>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
