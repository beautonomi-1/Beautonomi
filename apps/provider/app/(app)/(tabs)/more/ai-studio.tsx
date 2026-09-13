/**
 * Native AI tools — POST /api/provider/ai/[feature_key] (same routes as the web portal; see apps/web/src/app/api/provider/ai/[feature_key]/route.ts).
 */
import { useState, useCallback } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from "react-native";
import * as Haptics from "expo-haptics";
import { useTranslation } from "@beautonomi/i18n";
import { api } from "@/lib/api-client";
import { apiProviderAiFeaturePath } from "@/lib/provider-api-paths";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { twStyle } from "@/lib/twStyle";
import { Colors } from "@/constants/colors";

const FEATURES = [
  {
    key: "ai.provider.profile_completion",
    titleKey: "profileSuggestionsTitle",
    descriptionKey: "profileSuggestionsDesc",
  },
  {
    key: "ai.provider.content_studio",
    titleKey: "contentStudioTitle",
    descriptionKey: "contentStudioDesc",
  },
  {
    key: "ai.provider.smart_replies",
    titleKey: "smartRepliesTitle",
    descriptionKey: "smartRepliesDesc",
  },
  {
    key: "ai.provider.pricing_assistant",
    titleKey: "pricingAssistantTitle",
    descriptionKey: "pricingAssistantDesc",
  },
  {
    key: "ai.provider.booking_ops",
    titleKey: "bookingOpsTitle",
    descriptionKey: "bookingOpsDesc",
  },
  {
    key: "ai.provider.reputation_coach",
    titleKey: "reputationCoachTitle",
    descriptionKey: "reputationCoachDesc",
  },
  {
    key: "ai.provider.look_describe",
    titleKey: "lookDescribeTitle",
    descriptionKey: "lookDescribeDesc",
    needsImage: true,
  },
] as const;

function renderStructuredResult(result: unknown, ai: (key: string) => string): string {
  if (!result || typeof result !== "object") return String(result ?? "");
  const r = result as Record<string, unknown>;
  if (Array.isArray(r.replies)) return r.replies.map((x, i) => `${i + 1}. ${String(x)}`).join("\n");
  if (Array.isArray(r.post_captions)) {
    const caps = r.post_captions.map((x) => `• ${String(x)}`).join("\n");
    const tags = Array.isArray(r.hashtags) ? r.hashtags.map((x) => `#${String(x).replace(/^#/, "")}`).join(" ") : "";
    return [caps, tags, r.short_description ? String(r.short_description) : ""].filter(Boolean).join("\n\n");
  }
  if (r.suggested_profile_patch && typeof r.suggested_profile_patch === "object") {
    const p = r.suggested_profile_patch as Record<string, unknown>;
    return [
      p.headline ? `Headline: ${String(p.headline)}` : "",
      p.bio ? `Bio: ${String(p.bio)}` : "",
      Array.isArray(p.specialties) ? `Specialties: ${p.specialties.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }
  if (r.caption || r.alt_text) {
    return [r.caption ? `Caption: ${String(r.caption)}` : "", r.alt_text ? `Alt: ${String(r.alt_text)}` : ""]
      .filter(Boolean)
      .join("\n");
  }
  return JSON.stringify(result, null, 2);
}

export default function AiStudioScreen() {
  const { t } = useTranslation();
  const ai = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t("provider.mobile.screens.aiStudio." + key, opts) as string,
    [t],
  );
  const [extraContext, setExtraContext] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const runFeature = useCallback(
    async (featureKey: string, needsImage?: boolean) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setLoadingKey(featureKey);
      setLastError(null);
      setResult(null);
      try {
        const path = apiProviderAiFeaturePath(featureKey);
        const body: Record<string, string> = {};
        if (extraContext.trim()) body.input = extraContext.trim();
        if (needsImage && imageUrl.trim()) body.image_url = imageUrl.trim();
        const res = await api.post<unknown>(path, body);
        if (res.error) {
          const msg =
            typeof res.error === "object" && res.error && "message" in res.error
              ? String((res.error as { message?: string }).message)
              : ai("requestFailed");
          setLastError(msg);
          return;
        }
        setResult(res.data ?? null);
      } catch (e) {
        setLastError(e instanceof Error ? e.message : ai("requestFailed"));
      } finally {
        setLoadingKey(null);
      }
    },
    [extraContext, imageUrl, ai],
  );

  return (
    <ScreenContainer>
      <ScreenHeader title={ai("title")} showBack subtitle={ai("subtitle")} />

      <ScrollView style={twStyle("flex-1")} contentContainerStyle={{ paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Text style={twStyle("mb-2 text-sm text-gray-600")}>{ai("extraContextLabel")}</Text>
        <TextInput
          value={extraContext}
          onChangeText={setExtraContext}
          placeholder={ai("extraContextPlaceholder")}
          placeholderTextColor={Colors.gray[400]}
          multiline
          style={twStyle("mb-4 min-h-[88px] rounded-2xl border border-gray-200 bg-white p-4 text-base text-gray-900")}
        />
        <Text style={twStyle("mb-2 text-sm text-gray-600")}>{ai("imageUrlLabel")}</Text>
        <TextInput
          value={imageUrl}
          onChangeText={setImageUrl}
          placeholder={ai("imageUrlPlaceholder")}
          placeholderTextColor={Colors.gray[400]}
          autoCapitalize="none"
          style={twStyle("mb-6 rounded-2xl border border-gray-200 bg-white p-4 text-base text-gray-900")}
        />

        {FEATURES.map((f) => {
          const title = ai(f.titleKey);
          return (
            <View key={f.key} style={twStyle("mb-4 rounded-2xl border border-gray-100 bg-white p-4")}>
              <Text style={twStyle("text-base font-semibold text-gray-900")}>{title}</Text>
              <Text style={twStyle("mt-1 text-sm text-gray-500")}>{ai(f.descriptionKey)}</Text>
              <TouchableOpacity
                onPress={() => void runFeature(f.key, "needsImage" in f && f.needsImage)}
                disabled={loadingKey !== null}
                style={twStyle(
                  `mt-3 items-center rounded-xl py-3 ${loadingKey === f.key ? "bg-indigo-300" : "bg-indigo-600"}`,
                )}
                accessibilityRole="button"
                accessibilityLabel={title}
              >
                {loadingKey === f.key ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={twStyle("font-semibold text-white")}>{ai("generate")}</Text>
                )}
              </TouchableOpacity>
            </View>
          );
        })}

        {lastError ? (
          <TouchableOpacity
            onPress={() => {
              Alert.alert(ai("aiRequestTitle"), lastError);
            }}
            style={twStyle("mb-4 rounded-xl border border-red-200 bg-red-50 p-3")}
          >
            <Text style={twStyle("text-sm text-red-800")}>{lastError}</Text>
            <Text style={twStyle("mt-1 text-xs text-red-600")}>{ai("tapForFullMessage")}</Text>
          </TouchableOpacity>
        ) : null}

        {result != null ? (
          <View style={twStyle("rounded-2xl border border-gray-100 bg-gray-50 p-4")}>
            <Text style={twStyle("mb-2 text-xs font-semibold uppercase text-gray-500")}>{ai("result")}</Text>
            <Text selectable style={twStyle("text-sm text-gray-800")}>
              {renderStructuredResult(result, ai)}
            </Text>
            {typeof result === "object" &&
            result &&
            "suggested_profile_patch" in result &&
            typeof (result as { suggested_profile_patch?: { bio?: string } }).suggested_profile_patch?.bio ===
              "string" ? (
              <TouchableOpacity
                onPress={() => {
                  const bio = (result as { suggested_profile_patch: { bio: string } }).suggested_profile_patch.bio;
                  void api.patch("/api/provider/profile", { description: bio }).then((res) => {
                    if (res.error) {
                      Alert.alert(ai("applyFailedTitle"), res.error.message ?? ai("applyFailedBody"));
                      return;
                    }
                    Alert.alert(ai("appliedTitle"), ai("appliedBody"));
                  });
                }}
                style={twStyle("mt-3 items-center rounded-xl bg-indigo-600 py-3")}
              >
                <Text style={twStyle("font-semibold text-white")}>{ai("applyBio")}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}
