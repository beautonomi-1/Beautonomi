/**
 * Inline expandable search bar with autocomplete suggestions.
 * Expands/collapses in-place on the home screen.
 */
import { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Animated,
  Keyboard,
  Dimensions,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { api } from "@/lib/api-client";
import { haptic } from "@/lib/haptics";

interface Suggestion {
  type: "service" | "provider" | "category";
  id: string;
  name: string;
  url?: string;
  category?: string;
  slug?: string;
}

interface InlineSearchProps {
  onSearch?: (query: string) => void;
}

const ICON_MAP: Record<string, keyof typeof Ionicons.glyphMap> = {
  service: "sparkles-outline",
  provider: "business-outline",
  category: "grid-outline",
};

export function InlineSearch({ onSearch }: InlineSearchProps) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animHeight = useRef(new Animated.Value(0)).current;

  const expand = useCallback(() => {
    haptic.light();
    setExpanded(true);
    Animated.spring(animHeight, {
      toValue: 1,
      useNativeDriver: false,
      tension: 50,
      friction: 10,
    }).start();
    setTimeout(() => inputRef.current?.focus(), 200);
  }, [animHeight]);

  const collapse = useCallback(() => {
    Keyboard.dismiss();
    Animated.timing(animHeight, {
      toValue: 0,
      duration: 200,
      useNativeDriver: false,
    }).start(() => {
      setExpanded(false);
      setQuery("");
      setSuggestions([]);
    });
  }, [animHeight]);

  const fetchSuggestions = useCallback(async (text: string) => {
    if (text.length < 2) {
      setSuggestions([]);
      return;
    }
    setLoading(true);
    try {
      const res = await api.get<{ suggestions?: Suggestion[] }>(
        `/api/public/search/suggestions?q=${encodeURIComponent(text)}&limit=8`
      );
      const raw = res.data as any;
      const list = raw?.suggestions ?? raw?.data?.suggestions ?? [];
      setSuggestions(Array.isArray(list) ? list : []);
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleTextChange = useCallback(
    (text: string) => {
      setQuery(text);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => fetchSuggestions(text), 350);
    },
    [fetchSuggestions],
  );

  const handleSubmit = useCallback(() => {
    if (!query.trim()) return;
    haptic.medium();
    collapse();
    router.push({ pathname: "/(app)/(tabs)/search", params: { q: query.trim() } });
    onSearch?.(query.trim());
  }, [query, collapse, onSearch]);

  const handleSuggestionTap = useCallback(
    (s: Suggestion) => {
      haptic.light();
      collapse();
      if (s.type === "provider") {
        router.push({ pathname: "/(app)/(tabs)/search", params: { q: s.name } });
      } else if (s.type === "category") {
        router.push({ pathname: "/(app)/(tabs)/search", params: { category: s.slug ?? s.name?.toLowerCase() ?? "" } });
      } else {
        router.push({ pathname: "/(app)/(tabs)/search", params: { q: s.name } });
      }
    },
    [collapse],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  if (!expanded) {
    return (
      <TouchableOpacity
        onPress={expand}
        accessibilityRole="button"
        accessibilityLabel="Search"
        accessibilityHint="Tap to open search"
      >
        <Ionicons name="search-outline" size={24} color="#333" />
      </TouchableOpacity>
    );
  }

  const screenWidth = Dimensions.get("window").width;
  return (
    <View
      style={{
        position: "absolute",
        right: 0,
        left: -(screenWidth * 0.65),
        top: 0,
        minHeight: 44,
        zIndex: 100,
      }}
    >
      <View
        style={{
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: "#F3F4F6",
          borderRadius: 12,
          paddingHorizontal: 12,
        }}
      >
        <Ionicons name="search-outline" size={18} color="#9CA3AF" />
        <TextInput
          ref={inputRef}
          style={{
            flex: 1,
            paddingVertical: 10,
            paddingHorizontal: 8,
            fontSize: 15,
            color: "#111827",
          }}
          placeholder="Search providers, services..."
          placeholderTextColor="#9CA3AF"
          value={query}
          onChangeText={handleTextChange}
          onSubmitEditing={handleSubmit}
          returnKeyType="search"
        />
        {loading ? (
          <ActivityIndicator size="small" color={Colors.primary} />
        ) : (
          <TouchableOpacity onPress={collapse} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={20} color="#9CA3AF" />
          </TouchableOpacity>
        )}
      </View>

      {suggestions.length > 0 && (
        <Animated.View
          style={{
            position: "absolute",
            top: 46,
            left: 0,
            right: 0,
            backgroundColor: "#fff",
            borderRadius: 12,
            maxHeight: 300,
            borderWidth: 1,
            borderColor: "#E5E7EB",
            overflow: "hidden",
            zIndex: 200,
          }}
        >
          <FlatList
            data={suggestions}
            keyExtractor={(item) => `${item.type}-${item.id}`}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => handleSuggestionTap(item)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderColor: "#F3F4F6",
                }}
              >
                <Ionicons
                  name={ICON_MAP[item.type] ?? "search-outline"}
                  size={16}
                  color="#6B7280"
                  style={{ marginRight: 10 }}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    style={{ fontSize: 14, fontWeight: "500", color: "#111827" }}
                    numberOfLines={1}
                  >
                    {item.name}
                  </Text>
                  {item.category ? (
                    <Text style={{ fontSize: 11, color: "#9CA3AF" }}>{item.category}</Text>
                  ) : null}
                </View>
                <View
                  style={{
                    backgroundColor: item.type === "provider" ? "#EDE9FE" : item.type === "category" ? "#FEF3C7" : "#F0FDF4",
                    borderRadius: 999,
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: "600",
                      color: item.type === "provider" ? "#7C3AED" : item.type === "category" ? "#92400E" : "#16A34A",
                    }}
                  >
                    {item.type}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          />
        </Animated.View>
      )}
    </View>
  );
}
