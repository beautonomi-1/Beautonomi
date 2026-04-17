/**
 * Native AI tools — POST /api/provider/ai/[feature_key] (same routes as the web portal; see apps/web/src/app/api/provider/ai/[feature_key]/route.ts).
 */
import { useState, useCallback } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from "react-native";
import * as Haptics from "expo-haptics";
import { api } from "@/lib/api-client";
import { apiProviderAiFeaturePath } from "@/lib/provider-api-paths";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { twStyle } from "@/lib/twStyle";
import { Colors } from "@/constants/colors";

const FEATURES = [
  {
    key: "ai.provider.profile_completion",
    title: "Profile suggestions",
    description: "Headline, bio, specialties, FAQ, and policies ideas based on your business context.",
  },
  {
    key: "ai.provider.content_studio",
    title: "Content studio",
    description: "Post captions, hashtags, and short descriptions for social content.",
  },
] as const;

export default function AiStudioScreen() {
  const [extraContext, setExtraContext] = useState("");
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const runFeature = useCallback(
    async (featureKey: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setLoadingKey(featureKey);
      setLastError(null);
      setResult(null);
      try {
        const path = apiProviderAiFeaturePath(featureKey);
        const res = await api.post<unknown>(path, { input: extraContext.trim() || undefined });
        if (res.error) {
          const msg =
            typeof res.error === "object" && res.error && "message" in res.error
              ? String((res.error as { message?: string }).message)
              : "Request failed";
          setLastError(msg);
          return;
        }
        setResult(res.data ?? null);
      } catch (e) {
        setLastError(e instanceof Error ? e.message : "Request failed");
      } finally {
        setLoadingKey(null);
      }
    },
    [extraContext],
  );

  return (
    <ScreenContainer>
      <ScreenHeader title="AI studio" showBack subtitle="Powered by your plan entitlements and server-side AI" />

      <ScrollView style={twStyle("flex-1")} contentContainerStyle={{ paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Text style={twStyle("mb-2 text-sm text-gray-600")}>
          Optional extra context (applied to both tools):
        </Text>
        <TextInput
          value={extraContext}
          onChangeText={setExtraContext}
          placeholder="e.g. focus on bridal makeup, Cape Town"
          placeholderTextColor={Colors.gray[400]}
          multiline
          style={twStyle("mb-6 min-h-[88px] rounded-2xl border border-gray-200 bg-white p-4 text-base text-gray-900")}
        />

        {FEATURES.map((f) => (
          <View key={f.key} style={twStyle("mb-4 rounded-2xl border border-gray-100 bg-white p-4")}>
            <Text style={twStyle("text-base font-semibold text-gray-900")}>{f.title}</Text>
            <Text style={twStyle("mt-1 text-sm text-gray-500")}>{f.description}</Text>
            <TouchableOpacity
              onPress={() => void runFeature(f.key)}
              disabled={loadingKey !== null}
              style={twStyle(
                `mt-3 items-center rounded-xl py-3 ${loadingKey === f.key ? "bg-indigo-300" : "bg-indigo-600"}`,
              )}
              accessibilityRole="button"
              accessibilityLabel={f.title}
            >
              {loadingKey === f.key ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={twStyle("font-semibold text-white")}>Generate</Text>
              )}
            </TouchableOpacity>
          </View>
        ))}

        {lastError ? (
          <TouchableOpacity
            onPress={() => {
              Alert.alert("AI request", lastError);
            }}
            style={twStyle("mb-4 rounded-xl border border-red-200 bg-red-50 p-3")}
          >
            <Text style={twStyle("text-sm text-red-800")}>{lastError}</Text>
            <Text style={twStyle("mt-1 text-xs text-red-600")}>Tap for full message</Text>
          </TouchableOpacity>
        ) : null}

        {result != null ? (
          <View style={twStyle("rounded-2xl border border-gray-100 bg-gray-50 p-4")}>
            <Text style={twStyle("mb-2 text-xs font-semibold uppercase text-gray-500")}>Result</Text>
            <Text selectable style={twStyle("font-mono text-xs text-gray-800")}>
              {typeof result === "object" ? JSON.stringify(result, null, 2) : String(result)}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}
