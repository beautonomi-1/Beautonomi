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
  Keyboard,
  Modal,
  Pressable,
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
  /** Home category filter — carried into search so results stay in context */
  contextCategorySlug?: string;
  /**
   * When the trigger sits in a fixed-size parent (e.g. home toolbar), stretch
   * the hit target to fill it so alignment matches sibling icon buttons.
   */
  fillParent?: boolean;
}

const ICON_MAP: Record<string, keyof typeof Ionicons.glyphMap> = {
  service: "sparkles-outline",
  provider: "business-outline",
  category: "grid-outline",
};

export function InlineSearch({ onSearch, contextCategorySlug, fillParent }: InlineSearchProps) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const expand = useCallback(() => {
    haptic.light();
    setExpanded(true);
  }, []);

  const collapse = useCallback(() => {
    Keyboard.dismiss();
    setExpanded(false);
    setQuery("");
    setSuggestions([]);
  }, []);

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
      const delay = text.length >= 2 ? 180 : 350;
      debounceRef.current = setTimeout(() => fetchSuggestions(text), delay);
    },
    [fetchSuggestions],
  );

  const handleSubmit = useCallback(() => {
    const q = query.trim();
    if (!q && !contextCategorySlug) return;
    haptic.medium();
    collapse();
    router.push({
      pathname: "/(app)/(tabs)/search",
      params: {
        ...(q ? { q } : {}),
        ...(contextCategorySlug ? { category: contextCategorySlug } : {}),
      },
    });
    if (q) onSearch?.(q);
  }, [query, collapse, onSearch, contextCategorySlug]);

  const handleSuggestionTap = useCallback(
    (s: Suggestion) => {
      haptic.light();
      collapse();
      if (s.type === "provider") {
        router.push({
          pathname: "/(app)/(tabs)/search",
          params: {
            q: s.name,
            ...(contextCategorySlug ? { category: contextCategorySlug } : {}),
          },
        });
      } else if (s.type === "category") {
        router.push({
          pathname: "/(app)/(tabs)/search",
          params: { category: s.slug ?? s.name?.toLowerCase() ?? "" },
        });
      } else {
        router.push({
          pathname: "/(app)/(tabs)/search",
          params: {
            q: s.name,
            ...(contextCategorySlug ? { category: contextCategorySlug } : {}),
          },
        });
      }
    },
    [collapse, contextCategorySlug],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  /** Single focus when expanded — avoids autoFocus + state updates fighting on Android (focus loss after first character). */
  useEffect(() => {
    if (!expanded) return;
    const t = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, [expanded]);

  const trigger = (
    <TouchableOpacity
      onPress={expand}
      accessibilityRole="button"
      accessibilityLabel="Search"
      accessibilityHint="Tap to open search"
      style={
        fillParent
          ? { flex: 1, alignSelf: "stretch", alignItems: "center", justifyContent: "center" }
          : { padding: 6, minWidth: 40, minHeight: 40, alignItems: "center", justifyContent: "center" }
      }
      hitSlop={fillParent ? undefined : { top: 4, bottom: 4, left: 4, right: 4 }}
    >
      <Ionicons name="search-outline" size={fillParent ? 22 : 24} color="#374151" />
    </TouchableOpacity>
  );

  return (
    <>
      {fillParent ? (
        <View style={{ flex: 1, alignSelf: "stretch" }}>{trigger}</View>
      ) : (
        trigger
      )}

      <Modal
        visible={expanded}
        transparent
        animationType="fade"
        onRequestClose={collapse}
      >
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.3)" }} onPress={collapse}>
          <Pressable
            style={{
              paddingTop: 56,
              paddingHorizontal: 16,
              alignItems: "center",
            }}
            onPress={(e) => e.stopPropagation()}
          >
            <View
              style={{
                width: "100%",
                maxWidth: 400,
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: "#fff",
                borderRadius: 12,
                paddingHorizontal: 12,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.1,
                shadowRadius: 8,
                elevation: 4,
              }}
            >
              <Ionicons name="search-outline" size={18} color="#9CA3AF" style={{ marginRight: 8 }} />
              <TextInput
                ref={inputRef}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  fontSize: 15,
                  color: "#111827",
                }}
                placeholder="Search providers, services..."
                placeholderTextColor="#9CA3AF"
                value={query}
                onChangeText={handleTextChange}
                onSubmitEditing={handleSubmit}
                returnKeyType="search"
                blurOnSubmit={false}
              />
              {loading ? (
                <ActivityIndicator size="small" color={Colors.primary} style={{ marginLeft: 8 }} />
              ) : (
                <TouchableOpacity onPress={collapse} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginLeft: 4 }}>
                  <Ionicons name="close-circle" size={22} color="#9CA3AF" />
                </TouchableOpacity>
              )}
            </View>

            {suggestions.length > 0 && (
              <View
                style={{
                  width: "100%",
                  maxWidth: 400,
                  marginTop: 8,
                  backgroundColor: "#fff",
                  borderRadius: 12,
                  maxHeight: 300,
                  borderWidth: 1,
                  borderColor: "#E5E7EB",
                  overflow: "hidden",
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
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
