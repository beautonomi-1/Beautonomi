import { useState, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Keyboard,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { twStyle } from "@/lib/twStyle";
import { Colors } from "@/constants/colors";

interface SearchSuggestion {
  type: "client" | "appointment" | "service";
  id: string;
  title: string;
  subtitle?: string;
  url: string;
}

interface SearchResult {
  suggestions: SearchSuggestion[];
}

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 300;

export default function SearchScreen() {
  const router = useRouter();
  const [inputValue, setInputValue] = useState("");
  const [query, setQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchPath = useMemo(() => {
    if (query.trim().length < MIN_QUERY_LENGTH) return "";
    return `/api/provider/search?q=${encodeURIComponent(query.trim())}&limit=10`;
  }, [query]);

  const { data, loading, error, refresh } = useApi<SearchResult>(searchPath, {
    enabled: searchPath.length > 0,
  });

  const suggestions = useMemo(
    () => (data?.suggestions ?? []) as SearchSuggestion[],
    [data]
  );

  const handleInputChange = useCallback((text: string) => {
    setInputValue(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setQuery(text);
      debounceRef.current = null;
    }, DEBOUNCE_MS);
  }, []);

  const handleSuggestionPress = useCallback(
    (s: SearchSuggestion) => {
      Keyboard.dismiss();
      if (s.type === "client") {
        router.push(`/(app)/(tabs)/more/clients/${s.id}` as never);
      } else if (s.type === "appointment") {
        router.push(`/(app)/(tabs)/more/bookings/${s.id}` as never);
      } else if (s.type === "service") {
        router.push(`/(app)/(tabs)/more/catalogue/${s.id}` as never);
      }
    },
    [router]
  );

  const getIcon = (type: SearchSuggestion["type"]) => {
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
  };

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader title="Search" onBack={() => router.back()} />
      <View style={twStyle("px-4 pt-2 pb-4 border-b border-gray-200")}>
        <View style={twStyle("flex-row items-center rounded-xl bg-gray-100 px-4 py-3")}>
          <Ionicons name="search-outline" size={22} color={Colors.gray[500]} />
          <TextInput
            style={twStyle("ml-3 flex-1 text-base text-gray-900")}
            placeholder="Clients, bookings, services…"
            placeholderTextColor={Colors.gray[500]}
            value={inputValue}
            onChangeText={handleInputChange}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {inputValue.length > 0 && (
            <TouchableOpacity
              onPress={() => {
                setInputValue("");
                setQuery("");
              }}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close-circle" size={22} color={Colors.gray[500]} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        style={twStyle("flex-1")}
        contentContainerStyle={twStyle("px-4 py-2 pb-24")}
        keyboardShouldPersistTaps="handled"
      >
        {inputValue.trim().length > 0 && inputValue.trim().length < MIN_QUERY_LENGTH && (
          <View style={twStyle("py-8 items-center")}>
            <Text style={twStyle("text-gray-500 text-center")}>
              Type at least {MIN_QUERY_LENGTH} characters to search
            </Text>
          </View>
        )}

        {searchPath && loading && !data && (
          <View style={twStyle("py-12 items-center")}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={twStyle("mt-3 text-gray-500")}>Searching…</Text>
          </View>
        )}

        {searchPath && error && !data && (
          <View style={twStyle("py-8 px-4")}>
            <Text style={twStyle("text-red-600 text-center")}>{error}</Text>
            <TouchableOpacity
              onPress={() => refresh()}
              style={twStyle("mt-4 rounded-lg bg-gray-200 py-3")}
            >
              <Text style={twStyle("text-center font-medium text-gray-800")}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {searchPath && !loading && suggestions.length === 0 && !error && (
          <View style={twStyle("py-12 items-center")}>
            <Ionicons name="search-outline" size={40} color={Colors.gray[400]} />
            <Text style={twStyle("mt-3 text-gray-500 text-center")}>
              {`No results for "${query.trim()}"`}
            </Text>
          </View>
        )}

        {suggestions.length > 0 && (
          <View style={twStyle("gap-1")}>
            {suggestions.map((s) => (
              <TouchableOpacity
                key={`${s.type}-${s.id}`}
                onPress={() => handleSuggestionPress(s)}
                style={twStyle(
                  "flex-row items-center rounded-xl border border-gray-200 bg-white p-4"
                )}
                activeOpacity={0.7}
              >
                <View
                  style={twStyle(
                    `w-10 h-10 rounded-full items-center justify-center ${s.type === "client" ? "bg-indigo-100" : s.type === "appointment" ? "bg-amber-100" : s.type === "service" ? "bg-emerald-100" : ""}`
                  )}
                >
                  <Ionicons
                    name={getIcon(s.type) as any}
                    size={22}
                    color={
                      s.type === "client"
                        ? "#4f46e5"
                        : s.type === "appointment"
                          ? "#d97706"
                          : "#059669"
                    }
                  />
                </View>
                <View style={twStyle("ml-3 flex-1")}>
                  <Text style={twStyle("font-semibold text-gray-900")} numberOfLines={1}>
                    {s.title}
                  </Text>
                  {s.subtitle ? (
                    <Text style={twStyle("text-sm text-gray-500 mt-0.5")} numberOfLines={1}>
                      {s.subtitle}
                    </Text>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.gray[400]} />
              </TouchableOpacity>
            ))}
          </View>
        )}

      </ScrollView>
    </ScreenContainer>
  );
}
