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
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { ProviderCard } from "@/components/ProviderCard";
import type { SearchResult, Category } from "@/types/api";

export default function SearchScreen() {
  useScreenTracking("Search");
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
    <View className="flex-1 bg-white">
      <View className="px-4 pt-4 pb-2 border-b border-gray-100">
        <TouchableOpacity
          onPress={() => router.back()}
          className="flex-row items-center mb-4 -ml-1"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          accessibilityHint="Navigate to the previous screen"
        >
          <Ionicons name="arrow-back" size={24} color="#374151" />
          <Text className="text-base font-medium text-gray-700 ml-2">Back</Text>
        </TouchableOpacity>
        <Text className="text-2xl font-bold text-gray-900 mb-4">Search</Text>
        <TextInput
          className="rounded-xl border border-gray-300 bg-gray-50 px-4 py-3 text-base text-gray-900"
          placeholder="Search providers..."
          placeholderTextColor="#9ca3af"
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
          className="mt-3 -mx-4 px-4"
          accessibilityRole="list"
          accessibilityLabel="Category filters"
        >
          <TouchableOpacity
            onPress={() => setCategory("")}
            className={`mr-2 px-4 py-2 rounded-full ${
              !category ? "bg-primary" : "bg-gray-100"
            }`}
            accessibilityRole="button"
            accessibilityLabel="All categories"
            accessibilityState={{ selected: !category }}
            accessibilityHint="Show providers from all categories"
          >
            <Text className={`font-medium ${!category ? "text-white" : "text-gray-700"}`}>
              All
            </Text>
          </TouchableOpacity>
          {categories.map((c) => (
            <TouchableOpacity
              key={c.id}
              onPress={() => setCategory(c.slug)}
              className={`mr-2 px-4 py-2 rounded-full ${
                category === c.slug ? "bg-primary" : "bg-gray-100"
              }`}
              accessibilityRole="button"
              accessibilityLabel={`${c.name} category`}
              accessibilityState={{ selected: category === c.slug }}
              accessibilityHint={`Filter by ${c.name} category`}
            >
              <Text
                className={`font-medium ${category === c.slug ? "text-white" : "text-gray-700"}`}
              >
                {c.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity
          onPress={() => search()}
          className="mt-4 py-3 rounded-xl bg-primary items-center"
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel={loading ? "Searching" : "Search"}
          accessibilityState={{ disabled: loading }}
          accessibilityHint="Search for providers matching your query and filters"
        >
          {loading ? (
            <ActivityIndicator color="white" size="small" />
          ) : (
            <Text className="font-semibold text-white">Search</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
        accessibilityRole="list"
        accessibilityLabel="Search results"
      >
        {error && (
          <View className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
            <Text className="text-red-700">{error}</Text>
          </View>
        )}

        {loading && !searched ? null : !results && searched ? (
          <View className="py-12 items-center">
            <Text className="text-gray-600">No results. Try different filters.</Text>
          </View>
        ) : results && results.providers.length === 0 ? (
          <View className="py-12 items-center">
            <Text className="text-gray-600 mb-2">No providers found</Text>
            <Text className="text-gray-500 text-sm text-center">
              Try a different search term or category
            </Text>
          </View>
        ) : results ? (
          <>
            <Text className="text-sm text-gray-500 mb-4">
              {results.total} provider{results.total !== 1 ? "s" : ""} found
            </Text>
            <View className="gap-4">
              {results.providers.map((p) => (
                <View key={p.id} className="mb-4">
                  <ProviderCard provider={p} />
                </View>
              ))}
            </View>
          </>
        ) : (
          <View className="py-12 items-center">
            <Text className="text-gray-500 text-center">
              Enter a search term or select a category to find providers
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
