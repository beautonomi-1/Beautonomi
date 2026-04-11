import { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import { Colors } from "@/constants/colors";
import { useResponsive } from "@/hooks/useResponsive";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { ProviderCard } from "@/components/ProviderCard";
import type { SearchResult, Category } from "@/types/api";
import { useSelectedAddress } from "@/providers/SelectedAddressProvider";

type Suggestion = {
  type: "service" | "provider" | "category";
  id: string;
  name: string;
  url?: string;
  slug?: string;
};

export default function SearchScreen() {
  useScreenTracking("Search");
  const { contentPadding } = useResponsive();
  const params = useLocalSearchParams<{ q?: string; category?: string }>();
  const [query, setQuery] = useState(params.q ?? "");
  const [category, setCategory] = useState<string>(params.category ?? "");
  const [results, setResults] = useState<SearchResult | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const searchRef = useRef<((isRefresh?: boolean, queryOverride?: string, categoryOverride?: string) => Promise<void>) | null>(null);
  const { selectedAddress } = useSelectedAddress();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- WIP: suggestions UI not yet wired
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- WIP: suggestions UI not yet wired
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const suggestionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync from nav params when they change (e.g. coming from InlineSearch)
  useEffect(() => {
    if (params.q != null) setQuery(String(params.q));
    if (params.category != null) setCategory(String(params.category));
  }, [params.q, params.category]);

  const loadCategories = useCallback(async () => {
    try {
      const res = await api.get<Category[] | { data?: Category[] }>("/api/public/categories");
      if (res.error) return;
      const raw = res.data;
      const list = Array.isArray(raw) ? raw : (raw as any)?.data;
      setCategories(Array.isArray(list) ? list : []);
    } catch {
      setCategories([]);
    }
  }, []);

  const search = useCallback(
    async (isRefresh = false, queryOverride?: string, categoryOverride?: string) => {
      const q = queryOverride !== undefined ? queryOverride : query;
      const cat = categoryOverride !== undefined ? categoryOverride : category;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      setSearched(true);
      try {
        const searchParams = new URLSearchParams();
        if (q.trim()) searchParams.set("query", q.trim());
        if (cat) searchParams.set("category", cat);
        searchParams.set("limit", "20");
        searchParams.set("page", "1");
        if (
          !searchParams.has("lat") &&
          selectedAddress &&
          typeof selectedAddress.latitude === "number" &&
          typeof selectedAddress.longitude === "number"
        ) {
          searchParams.set("lat", String(selectedAddress.latitude));
          searchParams.set("lng", String(selectedAddress.longitude));
        }

        const res = await api.get<SearchResult>(`/api/public/search?${searchParams.toString()}`);

        if (res.error) {
          setError(getApiErrorMessage(res.error, "Search failed"));
          setResults(null);
        } else {
          const data = res.data as SearchResult;
          setResults(data || { providers: [], total: 0, page: 1, limit: 20, has_more: false });
        }
      } catch (e) {
        setError(getApiErrorMessage(e, "Search failed"));
        setResults(null);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [query, category, selectedAddress]
  );
  searchRef.current = search;

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  // When landing with params from InlineSearch (or deep link), run search so results show without tapping Search
  useEffect(() => {
    const hasParams = (params.q != null && String(params.q).trim() !== "") || (params.category != null && String(params.category).trim() !== "");
    if (!hasParams) return;
    searchRef.current?.(false, params.q ? String(params.q).trim() : undefined, params.category ? String(params.category) : undefined);
  }, [params.q, params.category]);

  const onRefresh = () => search(true);

  const fetchSuggestions = useCallback(async (text: string) => {
    const t = text.trim();
    if (t.length < 2) {
      setSuggestions([]);
      return;
    }
    setSuggestionsLoading(true);
    try {
      const res = await api.get<{ suggestions?: Suggestion[]; data?: { suggestions?: Suggestion[] } }>(
        `/api/public/search/suggestions?q=${encodeURIComponent(t)}&limit=10`
      );
      const raw = res.data as { suggestions?: Suggestion[]; data?: { suggestions?: Suggestion[] } } | undefined;
      const list = raw?.suggestions ?? raw?.data?.suggestions ?? [];
      setSuggestions(Array.isArray(list) ? list : []);
    } catch {
      setSuggestions([]);
    } finally {
      setSuggestionsLoading(false);
    }
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- WIP: will replace inline onChangeText
  const onQueryChange = useCallback(
    (text: string) => {
      setQuery(text);
      if (suggestionDebounceRef.current) clearTimeout(suggestionDebounceRef.current);
      suggestionDebounceRef.current = setTimeout(() => fetchSuggestions(text), 220);
    },
    [fetchSuggestions]
  );

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- WIP: suggestions UI not yet wired
  const onSuggestionPress = useCallback((s: Suggestion) => {
    setSuggestions([]);
    if (s.type === "category" && s.slug) {
      setCategory(s.slug);
      setQuery("");
      void searchRef.current?.(false, "", s.slug);
      return;
    }
    if (s.url?.includes("category=")) {
      const qIdx = s.url.indexOf("?");
      if (qIdx >= 0) {
        const cat = new URLSearchParams(s.url.slice(qIdx + 1)).get("category");
        if (cat) {
          setCategory(cat);
          setQuery("");
          void searchRef.current?.(false, "", cat);
          return;
        }
      }
    }
    setQuery(s.name);
    void searchRef.current?.(false, s.name, category);
  }, [category]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.white }} edges={["top"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "padding"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 56 : 20}
      >
        <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: Colors.gray[100] }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ flexDirection: "row", alignItems: "center", marginBottom: 16, marginLeft: -4 }}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            accessibilityHint="Navigate to the previous screen"
          >
            <Ionicons name="arrow-back" size={24} color={Colors.gray[700]} />
            <Text style={{ fontSize: 16, fontWeight: "500", color: Colors.gray[700], marginLeft: 8 }}>Back</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 24, fontWeight: "700", color: Colors.gray[900], marginBottom: 16 }}>Search</Text>
          <TextInput
            style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[300], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
            placeholder="Search providers..."
            placeholderTextColor={Colors.gray[400]}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => search()}
            returnKeyType="search"
            accessibilityLabel="Search providers"
            accessibilityHint="Type a provider name or service to search"
          />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginTop: 12, marginHorizontal: -16, paddingHorizontal: 16 }}
          contentContainerStyle={{}}
          accessibilityRole="list"
          accessibilityLabel="Category filters"
        >
          <TouchableOpacity
            onPress={() => setCategory("")}
            style={{ marginRight: 8, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 9999, backgroundColor: !category ? Colors.primary : Colors.gray[100] }}
            accessibilityRole="button"
            accessibilityLabel="All categories"
            accessibilityState={{ selected: !category }}
            accessibilityHint="Show providers from all categories"
          >
            <Text style={{ fontWeight: "500", color: !category ? Colors.white : Colors.gray[700] }}>All</Text>
          </TouchableOpacity>
          {categories.map((c) => (
            <TouchableOpacity
              key={c.id}
              onPress={() => setCategory(c.slug)}
              style={{ marginRight: 8, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 9999, backgroundColor: category === c.slug ? Colors.primary : Colors.gray[100] }}
              accessibilityRole="button"
              accessibilityLabel={`${c.name} category`}
              accessibilityState={{ selected: category === c.slug }}
              accessibilityHint={`Filter by ${c.name} category`}
            >
              <Text style={{ fontWeight: "500", color: category === c.slug ? Colors.white : Colors.gray[700] }}>{c.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity
          onPress={() => search()}
          style={{ marginTop: 16, paddingVertical: 12, borderRadius: 12, backgroundColor: Colors.primary, alignItems: "center" }}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel={loading ? "Searching" : "Search"}
          accessibilityState={{ disabled: loading }}
          accessibilityHint="Search for providers matching your query and filters"
        >
          {loading ? (
            <ActivityIndicator color="white" size="small" />
          ) : (
            <Text style={{ fontWeight: "600", color: Colors.white }}>Search</Text>
          )}
        </TouchableOpacity>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: contentPadding, paddingBottom: 220 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
          }
          accessibilityRole="list"
          accessibilityLabel="Search results"
        >
        {error && (
          <View style={{ backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FECACA", borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <Text style={{ color: "#B91C1C" }}>{error}</Text>
          </View>
        )}

        {loading && !searched ? null : !results && searched ? (
          <View style={{ paddingVertical: 48, alignItems: "center" }}>
            <Text style={{ color: Colors.gray[600] }}>No results. Try different filters.</Text>
          </View>
        ) : results && results.providers.length === 0 ? (
          <View style={{ paddingVertical: 48, alignItems: "center", paddingHorizontal: 24 }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.gray[100], alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
              <Ionicons name="search-outline" size={32} color={Colors.gray[400]} />
            </View>
            <Text style={{ color: Colors.gray[700], fontSize: 16, fontWeight: "600", marginBottom: 8, textAlign: "center" }}>No providers found</Text>
            <Text style={{ color: Colors.gray[500], fontSize: 14, textAlign: "center", marginBottom: 20 }}>Try a different search term or category</Text>
            {(query.trim() || category) ? (
              <TouchableOpacity
                onPress={() => { setQuery(""); setCategory(""); setError(null); search(); }}
                style={{ paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, backgroundColor: Colors.gray[100] }}
                accessibilityLabel="Clear filters and search again"
                accessibilityRole="button"
              >
                <Text style={{ color: Colors.gray[700], fontWeight: "600", fontSize: 14 }}>Clear filters</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : results ? (
          <>
            <Text style={{ fontSize: 14, color: Colors.gray[500], marginBottom: 16 }}>
              {results.total} provider{results.total !== 1 ? "s" : ""} found
            </Text>
            <View>
              {results.providers.map((p) => (
                <View key={p.id} style={{ marginBottom: 16 }}>
                  <ProviderCard provider={p} />
                </View>
              ))}
            </View>
          </>
        ) : (
          <View style={{ paddingVertical: 48, alignItems: "center" }}>
            <Text style={{ color: Colors.gray[500], textAlign: "center" }}>
              Enter a search term or select a category to find providers
            </Text>
          </View>
        )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
