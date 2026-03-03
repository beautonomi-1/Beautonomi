/**
 * AddressAutocomplete — Mapbox-powered address search.
 * Calls the backend geocoding endpoint to get suggestions.
 */
import { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/lib/api-client";

interface GeocodingResult {
  place_name: string;
  center: [number, number]; // [lng, lat]
  address?: string;
  text?: string;
  context?: { id: string; text: string }[];
}

interface ParsedAddress {
  full_address: string;
  address_line1: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  latitude: number;
  longitude: number;
}

interface AddressAutocompleteProps {
  value: string;
  onSelect: (address: ParsedAddress) => void;
  placeholder?: string;
  label?: string;
  countryCode?: string;
}

export function AddressAutocomplete({
  value,
  onSelect,
  placeholder = "Search address…",
  label,
  countryCode = "ZA",
}: AddressAutocompleteProps) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<GeocodingResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(
    async (text: string) => {
      if (text.length < 3) {
        setResults([]);
        setShowResults(false);
        return;
      }

      setLoading(true);
      try {
        const params = new URLSearchParams({
          q: text,
          country: countryCode,
          limit: "5",
        });
        const res = await api.get<{ results?: GeocodingResult[]; features?: GeocodingResult[] }>(
          `/api/mapbox/geocode?${params}`,
        );

        if (res.data) {
          const data = res.data;
          const items = data.results ?? data.features ?? [];
          setResults(Array.isArray(items) ? items : []);
          setShowResults(true);
        }
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [countryCode],
  );

  function handleChangeText(text: string) {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(text), 350);
  }

  function handleSelect(result: GeocodingResult) {
    const context = result.context ?? [];
    function findContext(prefix: string): string {
      return context.find((c) => c.id.startsWith(prefix))?.text ?? "";
    }

    const parsed: ParsedAddress = {
      full_address: result.place_name,
      address_line1: result.address
        ? `${result.address} ${result.text ?? ""}`
        : result.text ?? result.place_name.split(",")[0],
      city: findContext("place") || findContext("locality"),
      state: findContext("region"),
      postal_code: findContext("postcode"),
      country: findContext("country") || countryCode,
      latitude: result.center[1],
      longitude: result.center[0],
    };

    setQuery(result.place_name);
    setShowResults(false);
    setResults([]);
    onSelect(parsed);
  }

  return (
    <View>
      {label && (
        <Text className="mb-1.5 text-sm font-medium text-gray-700">{label}</Text>
      )}
      <View className="flex-row items-center rounded-xl border border-gray-200 bg-gray-50 px-3">
        <Ionicons name="search-outline" size={18} color="#9ca3af" />
        <TextInput
          className="ml-2 min-h-[44px] flex-1 text-sm text-gray-900"
          value={query}
          onChangeText={handleChangeText}
          placeholder={placeholder}
          placeholderTextColor="#9ca3af"
          autoCapitalize="words"
          accessibilityLabel={label ?? "Address search"}
        />
        {loading && <ActivityIndicator size="small" color="#6366f1" />}
      </View>

      {showResults && results.length > 0 && (
        <View className="mt-1 rounded-xl border border-gray-100 bg-white shadow-sm">
          <FlatList
            data={results}
            keyExtractor={(item: GeocodingResult, i: number) => `${item.place_name}-${i}`}
            keyboardShouldPersistTaps="handled"
            scrollEnabled={false}
            renderItem={({ item }: { item: GeocodingResult }) => (
              <TouchableOpacity
                onPress={() => handleSelect(item)}
                className="flex-row items-center border-b border-gray-50 px-3 py-3"
                accessibilityRole="button"
                accessibilityLabel={item.place_name}
              >
                <Ionicons name="location-outline" size={16} color="#6b7280" />
                <Text className="ml-2 flex-1 text-sm text-gray-700" numberOfLines={2}>
                  {item.place_name}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}
    </View>
  );
}
