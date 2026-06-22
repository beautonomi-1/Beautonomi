import { useEffect, useState, useCallback, useRef, memo } from "react";
import { View, Text, TextInput, ScrollView, ActivityIndicator, RefreshControl, TouchableOpacity, Platform } from "react-native";
import { AppKeyboardAvoidingView as KeyboardAvoidingView } from "@/components/AppKeyboardAvoidingView";
import { FlashList } from "@shopify/flash-list";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import { Colors } from "@/constants/colors";
import { useResponsive } from "@/hooks/useResponsive";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { useTabContentPaddingBottom } from "@/hooks/useTabContentPaddingBottom";
import { ProviderCard } from "@/components/ProviderCard";
import type { SearchResult, Category, PublicProviderCard } from "@/types/api";
import { useSelectedAddress } from "@/providers/SelectedAddressProvider";
import { useTranslation } from "@beautonomi/i18n";
import { captureError } from "@/lib/sentry";

type Suggestion = {
  type: "service" | "provider" | "category";
  id: string;
  name: string;
  url?: string;
  slug?: string;
  /** Provider thumbnail/avatar (from /api/public/search/suggestions). */
  image_url?: string | null;
  /** Service category name returned alongside service suggestions. */
  category?: string;
  distance_km?: number;
};

const SearchResultRow = memo(function SearchResultRow({ provider }: { provider: PublicProviderCard }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <ProviderCard provider={provider} />
    </View>
  );
});

export default function SearchScreen() {
  useScreenTracking("Search");
  const { contentPadding } = useResponsive();
  const listPaddingBottom = useTabContentPaddingBottom();
  const { t } = useTranslation();
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
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);
  const [noSuggestionMatches, setNoSuggestionMatches] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
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
          setError(getApiErrorMessage(res.error, t("customer.searchScreen.searchFailed")));
          setResults(null);
        } else {
          const data = res.data as SearchResult;
          setResults(data || { providers: [], total: 0, page: 1, limit: 20, has_more: false });
        }
      } catch (e) {
        setError(getApiErrorMessage(e, t("customer.searchScreen.searchFailed")));
        setResults(null);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [query, category, selectedAddress, t]
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
    const qTrim = text.trim();
    if (qTrim.length < 1) {
      setSuggestions([]);
      setSuggestionsError(null);
      setNoSuggestionMatches(false);
      return;
    }
    setSuggestionsLoading(true);
    setSuggestionsError(null);
    setNoSuggestionMatches(false);
    try {
      const searchParams = new URLSearchParams();
      searchParams.set("q", qTrim);
      searchParams.set("limit", "10");
      if (
        selectedAddress &&
        typeof selectedAddress.latitude === "number" &&
        typeof selectedAddress.longitude === "number"
      ) {
        searchParams.set("lat", String(selectedAddress.latitude));
        searchParams.set("lng", String(selectedAddress.longitude));
      }

      const res = await api.get<{ suggestions?: Suggestion[]; data?: { suggestions?: Suggestion[] } }>(
        `/api/public/search/suggestions?${searchParams.toString()}`
      );
      if (res.error) {
        const msg = getApiErrorMessage(res.error, t("customer.searchScreen.searchFailed"));
        setSuggestionsError(msg);
        setSuggestions([]);
        setNoSuggestionMatches(false);
        captureError(new Error("search_suggestions_failed"), {
          scope: "customer_search",
          code: res.error.code,
          message: res.error.message,
        });
        return;
      }
      const raw = res.data as { suggestions?: Suggestion[]; data?: { suggestions?: Suggestion[] } } | undefined;
      const list = raw?.suggestions ?? raw?.data?.suggestions ?? [];
      const arr = Array.isArray(list) ? list : [];
      setSuggestions(arr);
      setNoSuggestionMatches(arr.length === 0);
    } catch (e) {
      setSuggestions([]);
      const msg = getApiErrorMessage(e, t("customer.searchScreen.searchFailed"));
      setSuggestionsError(msg);
      setNoSuggestionMatches(false);
      captureError(e instanceof Error ? e : new Error("search_suggestions_throw"), { scope: "customer_search" });
    } finally {
      setSuggestionsLoading(false);
    }
  }, [t, selectedAddress]);

  const onQueryChange = useCallback(
    (text: string) => {
      setQuery(text);
      setShowSuggestions(true);
      if (suggestionDebounceRef.current) clearTimeout(suggestionDebounceRef.current);
      suggestionDebounceRef.current = setTimeout(() => fetchSuggestions(text), 220);
    },
    [fetchSuggestions]
  );

  const onSuggestionPress = useCallback((s: Suggestion) => {
    setSuggestions([]);
    setShowSuggestions(false);
    // §UI-audit 2026-05: tapping a provider suggestion previously just
    // re-ran a name-based text search, which often returned 0 results
    // for providers whose listing was hidden behind filters. Jump
    // straight to the partner profile when we have the slug — that's
    // what the user actually wants when they recognise the name in the
    // typeahead. Falls back to a text search if no slug is available.
    if (s.type === "provider" && s.slug) {
      router.push({ pathname: "/(app)/partner-profile", params: { slug: s.slug } });
      return;
    }
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

  const renderProviderItem = useCallback(
    ({ item }: { item: PublicProviderCard }) => <SearchResultRow provider={item} />,
    [],
  );

  const listHeader = (
    <>
      {error && (
        <View style={{ backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FECACA", borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <Text style={{ color: "#B91C1C" }}>{error}</Text>
        </View>
      )}

      {loading ? (
        <View style={{ paddingVertical: 48, alignItems: "center" }}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={{ color: Colors.gray[500], marginTop: 12 }}>{t("customer.searchScreen.searching")}</Text>
        </View>
      ) : !results && searched && !error ? (
        <View style={{ paddingVertical: 48, alignItems: "center" }}>
          <Text style={{ color: Colors.gray[600] }}>{t("customer.searchScreen.noResults")}</Text>
        </View>
      ) : results && results.providers.length === 0 ? (
        <View style={{ paddingVertical: 48, alignItems: "center", paddingHorizontal: 24 }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.gray[100], alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
            <Ionicons name="search-outline" size={32} color={Colors.gray[400]} />
          </View>
          <Text style={{ color: Colors.gray[700], fontSize: 16, fontWeight: "600", marginBottom: 8, textAlign: "center" }}>{t("customer.searchScreen.noProviders")}</Text>
          <Text style={{ color: Colors.gray[500], fontSize: 14, textAlign: "center", marginBottom: 20 }}>{t("customer.searchScreen.noProvidersHint")}</Text>
          {(query.trim() || category) ? (
            <TouchableOpacity
              onPress={() => { setQuery(""); setCategory(""); setError(null); search(); }}
              style={{ paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, backgroundColor: Colors.gray[100] }}
              accessibilityLabel={t("customer.searchScreen.clearFilters")}
              accessibilityRole="button"
            >
              <Text style={{ color: Colors.gray[700], fontWeight: "600", fontSize: 14 }}>{t("customer.searchScreen.clearFilters")}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : results && results.providers.length > 0 ? (
        <Text style={{ fontSize: 14, color: Colors.gray[500], marginBottom: 16 }}>
          {results.total === 1
            ? t("customer.searchScreen.providersFoundOne")
            : t("customer.searchScreen.providersFoundMany", { count: results.total })}
        </Text>
      ) : (
        <View style={{ paddingVertical: 48, alignItems: "center" }}>
          <Text style={{ color: Colors.gray[500], textAlign: "center" }}>
            {t("customer.searchScreen.promptDefault")}
          </Text>
        </View>
      )}
    </>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.white }} edges={["top"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === "ios" ? 56 : 0}
      >
        <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: Colors.gray[100] }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ flexDirection: "row", alignItems: "center", marginBottom: 16, marginLeft: -4 }}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel={t("common.back")}
            accessibilityHint="Navigate to the previous screen"
          >
            <Ionicons name="arrow-back" size={24} color={Colors.gray[700]} />
            <Text style={{ fontSize: 16, fontWeight: "500", color: Colors.gray[700], marginLeft: 8 }}>{t("common.back")}</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 24, fontWeight: "700", color: Colors.gray[900], marginBottom: 16 }}>{t("customer.searchScreen.title")}</Text>
          <TextInput
            style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[300], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
            placeholder={t("customer.searchScreen.placeholder")}
            placeholderTextColor={Colors.gray[400]}
            value={query}
            onChangeText={onQueryChange}
            onFocus={() => {
              if (query.trim().length >= 1) setShowSuggestions(true);
            }}
            onSubmitEditing={() => {
              setShowSuggestions(false);
              search();
            }}
            returnKeyType="search"
            accessibilityLabel={t("customer.searchScreen.placeholder")}
            accessibilityHint="Type a provider name or service to search"
          />
          {/*
            §Customer-launch (audit 2026-04): the /api/public/search/suggestions
            endpoint and state were already wired, but the dropdown UI had never
            been rendered. Show typeahead suggestions when the user has typed 2+
            chars; tapping a suggestion runs the search via onSuggestionPress.
          */}
          {showSuggestions &&
            query.trim().length >= 1 &&
            (suggestionsLoading || suggestionsError || suggestions.length > 0 || noSuggestionMatches) && (
            <View
              style={{
                marginTop: 8,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: Colors.gray[200],
                backgroundColor: Colors.white,
                overflow: "hidden",
              }}
              accessibilityRole="list"
              accessibilityLabel={t("customer.searchScreen.suggestionsLabel")}
            >
              {suggestionsLoading ? (
                <View style={{ paddingVertical: 12, alignItems: "center" }}>
                  <ActivityIndicator size="small" color={Colors.primary} />
                </View>
              ) : suggestionsError ? (
                <View style={{ paddingVertical: 12, paddingHorizontal: 12 }}>
                  <Text style={{ fontSize: 14, color: "#b91c1c" }}>{suggestionsError}</Text>
                </View>
              ) : suggestions.length === 0 ? (
                <View style={{ paddingVertical: 12, paddingHorizontal: 12 }}>
                  <Text style={{ fontSize: 14, color: Colors.gray[600] }}>
                    {t("customer.searchScreen.noMatchesForQuery", { query: query.trim() })}
                  </Text>
                </View>
              ) : (
                suggestions.map((s, idx) => (
                  <TouchableOpacity
                    key={`${s.type}-${s.id}-${idx}`}
                    onPress={() => onSuggestionPress(s)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      borderBottomWidth: idx === suggestions.length - 1 ? 0 : 1,
                      borderBottomColor: Colors.gray[100],
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`${s.name}, ${s.type}`}
                  >
                    {/* §UI-audit 2026-05: providers now show their thumbnail
                        in suggestions so users recognise the right business
                        before tapping; non-provider rows keep the icon. */}
                    {s.type === "provider" ? (
                      s.image_url ? (
                        <Image
                          source={{ uri: s.image_url }}
                          style={{ width: 40, height: 40, borderRadius: 20, marginRight: 12, backgroundColor: Colors.gray[100], borderWidth: 1, borderColor: Colors.gray[200] }}
                          contentFit="cover"
                          cachePolicy="memory-disk"
                        />
                      ) : (
                        <View
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 20,
                            marginRight: 12,
                            backgroundColor: "#FDF2F8", // pink-50 to match web
                            alignItems: "center",
                            justifyContent: "center",
                            borderWidth: 1,
                            borderColor: "#FCE7F3", // pink-100 to match web
                          }}
                        >
                          <Text style={{ fontSize: 16, fontWeight: "600", color: Colors.primary }}>
                            {s.name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      )
                    ) : (
                      <View
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 20,
                          marginRight: 12,
                          backgroundColor: Colors.gray[100],
                          alignItems: "center",
                          justifyContent: "center",
                          borderWidth: 1,
                          borderColor: Colors.gray[200],
                        }}
                      >
                        <Ionicons
                          name={
                            s.type === "category"
                              ? "pricetag-outline"
                              : "cut-outline"
                          }
                          size={18}
                          color={Colors.gray[500]}
                        />
                      </View>
                    )}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ color: Colors.gray[800], fontSize: 14, fontWeight: "500" }} numberOfLines={1}>
                        {s.name}
                      </Text>
                      {s.type === "service" && s.category ? (
                        <Text style={{ color: Colors.gray[500], fontSize: 12 }} numberOfLines={1}>
                          {s.category}
                        </Text>
                      ) : null}
                      {s.type === "provider" && s.distance_km != null ? (
                        <Text style={{ color: Colors.gray[500], fontSize: 12 }} numberOfLines={1}>
                          {s.distance_km < 1 ? "< 1 km away" : `${s.distance_km.toFixed(1)} km away`}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={{ color: Colors.gray[400], fontSize: 12, textTransform: "capitalize" }}>
                      {s.type === "provider"
                        ? t("customer.searchScreen.suggestionProvider")
                        : s.type === "category"
                          ? t("customer.searchScreen.suggestionCategory")
                          : t("customer.searchScreen.suggestionService")}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}
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
            accessibilityLabel={t("customer.searchScreen.allCategories")}
            accessibilityState={{ selected: !category }}
            accessibilityHint="Show providers from all categories"
          >
            <Text style={{ fontWeight: "500", color: !category ? Colors.white : Colors.gray[700] }}>{t("customer.searchScreen.allCategories")}</Text>
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
          onPress={() => {
            setShowSuggestions(false);
            search();
          }}
          style={{ marginTop: 16, paddingVertical: 12, borderRadius: 12, backgroundColor: Colors.primary, alignItems: "center" }}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel={loading ? t("customer.searchScreen.searching") : t("common.search")}
          accessibilityState={{ disabled: loading }}
          accessibilityHint="Search for providers matching your query and filters"
        >
          {loading ? (
            <ActivityIndicator color="white" size="small" />
          ) : (
            <Text style={{ fontWeight: "600", color: Colors.white }}>{t("common.search")}</Text>
          )}
        </TouchableOpacity>
        </View>

        <FlashList
          data={results?.providers ?? []}
          keyExtractor={(item) => item.id}
          renderItem={renderProviderItem}
          ListHeaderComponent={listHeader}
          contentContainerStyle={{ padding: contentPadding, paddingBottom: listPaddingBottom }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
          }
          accessibilityRole="list"
          accessibilityLabel="Search results"
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
