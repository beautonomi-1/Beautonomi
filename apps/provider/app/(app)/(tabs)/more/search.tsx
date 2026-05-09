import { useState, useCallback, useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, FlatList } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi } from "@/hooks/useApi";
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SearchBar } from "@/components/ui/SearchBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { Colors } from "@/constants/colors";
import { verticalFlatListPerf } from "@/lib/flatListPerformance";

interface SearchSuggestion {
  type: "client" | "appointment" | "service";
  id: string;
  title: string;
  subtitle?: string;
  url: string;
}

interface SearchResponse {
  suggestions: SearchSuggestion[];
}

/** Map web provider URL to app route (path + params). */
function urlToAppRoute(url: string): string {
  try {
    if (url.startsWith("/provider/clients/")) {
      const id = url.replace("/provider/clients/", "").split("?")[0];
      return `/(app)/(tabs)/clients/${id}`;
    }
    if (url.startsWith("/provider/clients")) {
      return "/(app)/(tabs)/clients";
    }
    if (url.startsWith("/provider/bookings/")) {
      const id = url.replace("/provider/bookings/", "").split("?")[0];
      return `/(app)/(tabs)/more/bookings/${id}`;
    }
    if (url.startsWith("/provider/catalogue/services")) {
      return "/(app)/(tabs)/more/catalogue";
    }
    if (url.startsWith("/provider/sales") || url.startsWith("/provider/waitlist")) {
      const path = url.includes("waitlist") ? "waitlist" : "walk-in-sale";
      return `/(app)/(tabs)/more/${path}`;
    }
  } catch {
    // fallback
  }
  return "/(app)/(tabs)/dashboard";
}

function getSuggestionIcon(type: SearchSuggestion["type"]): keyof typeof Ionicons.glyphMap {
  switch (type) {
    case "client":
      return "person-outline";
    case "appointment":
      return "calendar-outline";
    case "service":
      return "cut-outline";
    default:
      return "search-outline";
  }
}

const DEBOUNCE_MS = 280;
const MIN_QUERY_LEN = 1;

export default function SearchScreen() {
  const router = useRouter();
  const { screenPadding } = useResponsive();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < MIN_QUERY_LEN) {
      setDebouncedQuery("");
      return;
    }
    debounceRef.current = setTimeout(() => setDebouncedQuery(q), DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const searchPath =
    debouncedQuery.length >= MIN_QUERY_LEN
      ? `/api/provider/search?q=${encodeURIComponent(debouncedQuery)}&limit=12`
      : "";
  const { data: response, loading } = useApi<SearchResponse>(searchPath, {
    enabled: searchPath.length > 0,
  });
  const suggestions = response?.suggestions ?? [];

  const handleSearch = useCallback(() => {
    if (query.trim().length >= MIN_QUERY_LEN) setDebouncedQuery(query.trim());
  }, [query]);

  const handleSelect = useCallback(
    (item: SearchSuggestion) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const route = urlToAppRoute(item.url);
      router.push(route as never);
    },
    [router]
  );

  const showEmpty = debouncedQuery.length >= MIN_QUERY_LEN && !loading && suggestions.length === 0;

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader title="Search" showBack />
      <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
        <SearchBar
          placeholder="Search clients, appointments, services..."
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
        />
      </View>

      {showEmpty && (
        <EmptyState
          icon="search-outline"
          title="No results"
          description="Try a different search term"
        />
      )}

      {suggestions.length > 0 && (
        <FlatList
          {...verticalFlatListPerf}
          data={suggestions}
          keyExtractor={(item: SearchSuggestion) => `${item.type}-${item.id}`}
          contentContainerStyle={{ paddingHorizontal: screenPadding, paddingBottom: 120 }}
          renderItem={({ item }: { item: SearchSuggestion }) => (
            <TouchableOpacity
              style={{ flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: Colors.gray[100], paddingVertical: 12 }}
              onPress={() => handleSelect(item)}
              accessibilityLabel={`${item.type}: ${item.title}`}
              accessibilityRole="button"
            >
              <View style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: Colors.gray[100] }}>
                <Ionicons
                  name={getSuggestionIcon(item.type)}
                  size={20}
                  color="#6366f1"
                />
              </View>
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={{ fontWeight: "500", color: Colors.gray[900] }} numberOfLines={1}>
                  {item.title}
                </Text>
                {item.subtitle ? (
                  <Text style={{ marginTop: 2, fontSize: 14, color: Colors.gray[500] }} numberOfLines={1}>
                    {item.subtitle}
                  </Text>
                ) : null}
                <View style={{ marginTop: 4, flexDirection: "row" }}>
                  <View style={{ borderRadius: 9999, backgroundColor: Colors.primaryLight, paddingHorizontal: 8, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 10, fontWeight: "500", color: Colors.primary, textTransform: "capitalize" }}>
                      {item.type}
                    </Text>
                  </View>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#d1d5db" />
            </TouchableOpacity>
          )}
        />
      )}

      {loading && debouncedQuery.length >= MIN_QUERY_LEN && (
        <View style={{ paddingVertical: 32, alignItems: "center" }}>
          <Text style={{ fontSize: 14, color: Colors.gray[500] }}>Searching...</Text>
        </View>
      )}
    </ScreenContainer>
  );
}
