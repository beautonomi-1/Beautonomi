/**
 * AddressAutocomplete — Mapbox-powered address search (aligned with web).
 * POST /api/mapbox/geocode; parsing matches web via @beautonomi/utils.
 */
import { useState, useCallback, useRef, useEffect } from "react";
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
import { twStyle } from "@/lib/twStyle";
import { verticalFlatListPerf } from "@/lib/flatListPerformance";
import {
  countryFilterIso2FromStorage,
  mapGeocodeFeatureToAddressParts,
  type MapboxGeocodeFeatureLike,
} from "@beautonomi/utils";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";

interface GeocodingResult extends MapboxGeocodeFeatureLike {
  id: string;
}

export interface ParsedAddress {
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
  /** Called when user leaves the field without selecting; use to persist manual typing as address_line1 */
  onBlur?: (query: string) => void;
  placeholder?: string;
  label?: string;
  /** ISO 3166-1 alpha-2 bias for Mapbox (e.g. ZA). Long-form country names are normalized when possible. */
  countryCode?: string;
  /** Display country for the form when Mapbox omits country (must match web / provider_locations). */
  defaultCountryName?: string;
  proximity?: { latitude: number; longitude: number };
  /** Forward geocode Mapbox `types`; omit for default Mapbox mix (recommended for onboarding). */
  geocodeTypes?: string[];
}

export function AddressAutocomplete({
  value,
  onSelect,
  onBlur,
  placeholder = "Search address…",
  label,
  countryCode = "ZA",
  defaultCountryName,
  proximity,
  geocodeTypes,
}: AddressAutocompleteProps) {
  const { bundle } = useConfigBundle();
  const resolvedDefaultCountry =
    defaultCountryName?.trim() ||
    bundle?.meta?.tenant_region?.name?.trim() ||
    "—";
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<GeocodingResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  const mapboxCountryIso = useCallback(() => {
    const c = countryCode?.trim() ?? "";
    if (/^[A-Za-z]{2}$/.test(c)) return c.toUpperCase();
    return countryFilterIso2FromStorage(c) ?? undefined;
  }, [countryCode]);

  const search = useCallback(
    async (text: string) => {
      if (text.length < 2) {
        setResults([]);
        setShowResults(false);
        return;
      }

      setLoading(true);
      try {
        const iso = mapboxCountryIso();
        const body: Record<string, unknown> = {
          query: text,
          limit: 8,
        };
        if (geocodeTypes?.length) body.types = geocodeTypes;
        if (iso) body.country = iso;
        if (proximity) {
          body.proximity = { longitude: proximity.longitude, latitude: proximity.latitude };
        }

        const res = await api.post<GeocodingResult[]>("/api/mapbox/geocode", body);

        const items = Array.isArray(res.data) ? res.data : [];
        setResults(items);
        setShowResults(items.length > 0);
      } catch {
        setResults([]);
        setShowResults(false);
      } finally {
        setLoading(false);
      }
    },
    [geocodeTypes, mapboxCountryIso, proximity],
  );

  function handleChangeText(text: string) {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(text), 300);
  }

  function handleSelect(result: GeocodingResult) {
    const mapped = mapGeocodeFeatureToAddressParts(result, {
      defaultCountryName: resolvedDefaultCountry,
    });
    const parsed: ParsedAddress = {
      full_address: result.place_name,
      address_line1: mapped.address_line1,
      city: mapped.city,
      state: mapped.state,
      postal_code: mapped.postal_code,
      country: mapped.country?.trim() || resolvedDefaultCountry,
      latitude: mapped.latitude,
      longitude: mapped.longitude,
    };

    setQuery(result.place_name);
    setShowResults(false);
    setResults([]);
    onSelect(parsed);
  }

  return (
    <View>
      {label ? (
        <Text style={twStyle("mb-1.5 text-sm font-medium text-gray-700")}>{label}</Text>
      ) : null}
      <View style={twStyle("flex-row items-center rounded-xl border border-gray-200 bg-gray-50 px-3")}>
        <Ionicons name="search-outline" size={18} color="#9ca3af" />
        <TextInput
          style={twStyle("ml-2 min-h-[44px] flex-1 text-sm text-gray-900")}
          value={query}
          onChangeText={handleChangeText}
          onBlur={() => {
            if (query.trim() && onBlur) onBlur(query.trim());
          }}
          placeholder={placeholder}
          placeholderTextColor="#9ca3af"
          autoCapitalize="words"
          accessibilityLabel={label ?? "Address search"}
        />
        {loading ? <ActivityIndicator size="small" color="#6366f1" /> : null}
      </View>

      {showResults && results.length > 0 ? (
        <View style={twStyle("mt-1 max-h-48 rounded-xl border border-gray-100 bg-white shadow-sm")}>
          <FlatList
            {...verticalFlatListPerf}
            data={results}
            keyExtractor={(item: GeocodingResult, i: number) =>
              item.id ? String(item.id) : `${item.place_name}-${i}`
            }
            keyboardShouldPersistTaps="handled"
            scrollEnabled
            nestedScrollEnabled
            renderItem={({ item }: { item: GeocodingResult }) => (
              <TouchableOpacity
                onPress={() => handleSelect(item)}
                style={twStyle("flex-row items-center border-b border-gray-50 px-3 py-3")}
                accessibilityRole="button"
                accessibilityLabel={item.place_name}
              >
                <Ionicons name="location-outline" size={16} color="#6b7280" />
                <Text style={twStyle("ml-2 flex-1 text-sm text-gray-700")} numberOfLines={2}>
                  {item.place_name}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>
      ) : null}
    </View>
  );
}
