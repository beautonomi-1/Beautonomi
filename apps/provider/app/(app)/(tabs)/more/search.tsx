import { useState, useCallback, useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, FlatList } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SearchBar } from "@/components/ui/SearchBar";
import { EmptyState } from "@/components/ui/EmptyState";

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
    if (url.startsWith("/provider/calendar")) {
      const rest = url.replace("/provider/calendar", "");
      return `/(app)/(tabs)/calendar${rest || ""}`;
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

const DEBOUNCE_MS = 300;

export default function SearchScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setDebouncedQuery("");
      return;
    }
    debounceRef.current = setTimeout(() => setDebouncedQuery(q), DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const searchPath =
    debouncedQuery.length >= 2
      ? `/api/provider/search?q=${encodeURIComponent(debouncedQuery)}&limit=10`
      : "";
  const { data: response, loading } = useApi<SearchResponse>(searchPath, {
    enabled: searchPath.length > 0,
  });
  const suggestions = response?.suggestions ?? [];

  const handleSearch = useCallback(() => {
    if (query.trim().length >= 2) setDebouncedQuery(query.trim());
  }, [query]);

  const handleSelect = useCallback(
    (item: SearchSuggestion) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const route = urlToAppRoute(item.url);
      router.push(route as never);
    },
    [router]
  );

  const showEmpty = debouncedQuery.length >= 2 && !loading && suggestions.length === 0;
  const showHint = query.length > 0 && query.length < 2;

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader title="Search" showBack />
      <View className="px-4 pb-2">
        <SearchBar
          placeholder="Search clients, appointments, services..."
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
        />
        {showHint && (
          <Text className="mt-2 text-xs text-gray-500">
            Type at least 2 characters to search
          </Text>
        )}
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
          data={suggestions}
          keyExtractor={(item: SearchSuggestion) => `${item.type}-${item.id}`}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
          renderItem={({ item }: { item: SearchSuggestion }) => (
            <TouchableOpacity
              className="flex-row items-center border-b border-gray-100 py-3"
              onPress={() => handleSelect(item)}
              accessibilityLabel={`${item.type}: ${item.title}`}
              accessibilityRole="button"
            >
              <View className="h-10 w-10 items-center justify-center rounded-xl bg-gray-100">
                <Ionicons
                  name={getSuggestionIcon(item.type)}
                  size={20}
                  color="#6366f1"
                />
              </View>
              <View className="ml-3 flex-1">
                <Text className="font-medium text-gray-900" numberOfLines={1}>
                  {item.title}
                </Text>
                {item.subtitle ? (
                  <Text className="mt-0.5 text-sm text-gray-500" numberOfLines={1}>
                    {item.subtitle}
                  </Text>
                ) : null}
                <View className="mt-1 flex-row">
                  <View className="rounded-full bg-primary/10 px-2 py-0.5">
                    <Text className="text-[10px] font-medium text-primary capitalize">
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

      {loading && debouncedQuery.length >= 2 && (
        <View className="py-8 items-center">
          <Text className="text-sm text-gray-500">Searching...</Text>
        </View>
      )}
    </ScreenContainer>
  );
}
