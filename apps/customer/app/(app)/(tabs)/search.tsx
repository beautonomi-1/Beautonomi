import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/lib/api-client";
import { Colors } from "@/constants/colors";
import { useResponsive } from "@/hooks/useResponsive";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { ProviderCard } from "@/components/ProviderCard";
import type { SearchResult, Category } from "@/types/api";

export default function SearchScreen() {
  useScreenTracking("Search");
  const { contentPadding } = useResponsive();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("");
  const [results, setResults] = useState<SearchResult | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

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
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      setSearched(true);
      try {
        const params = new URLSearchParams();
        if (query.trim()) params.set("query", query.trim());
        if (category) params.set("category", category);
        params.set("limit", "20");
        params.set("page", "1");

        const res = await api.get<SearchResult>(`/api/public/search?${params.toString()}`);

        if (res.error) {
          setError(res.error.message || "Search failed");
          setResults(null);
        } else {
          const data = res.data as SearchResult;
          setResults(data || { providers: [], total: 0, page: 1, limit: 20, has_more: false });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Search failed");
        setResults(null);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [query, category]
  );

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const onRefresh = () => search(true);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.white }}>
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
        contentContainerStyle={{ padding: contentPadding, paddingBottom: 100 }}
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
          <View style={{ paddingVertical: 48, alignItems: "center" }}>
            <Text style={{ color: Colors.gray[600], marginBottom: 8 }}>No providers found</Text>
            <Text style={{ color: Colors.gray[500], fontSize: 14, textAlign: "center" }}>Try a different search term or category</Text>
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
    </View>
  );
}
