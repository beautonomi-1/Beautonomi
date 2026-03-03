import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, Stack, router } from "expo-router";
import { api } from "@/lib/api-client";
import { useAuth } from "@/providers/AuthProvider";
import { useImagePicker } from "@/hooks/useImagePicker";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { haptic } from "@/lib/haptics";

export default function CustomRequestCreateScreen() {
  useScreenTracking("Custom Request Create");
  const { provider_id } = useLocalSearchParams<{ provider_id: string }>();
  const { user } = useAuth();
  const { pickFromLibrary } = useImagePicker();
  const [description, setDescription] = useState("");
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [duration, setDuration] = useState("60");
  const [locationType, setLocationType] = useState<"at_salon" | "at_home">("at_salon");
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const addImage = async () => {
    if (imageUrls.length >= 6) return;
    setUploading(true);
    try {
      const result = await pickFromLibrary();
      if (!result) {
        setUploading(false);
        return;
      }
      const formData = new FormData();
      formData.append("files", {
        uri: result.uri,
        name: result.fileName || "image.jpg",
        type: "image/jpeg",
      } as any);
      const res = await api.post<any>("/api/me/custom-requests/upload", formData as any);
      const urls = (res.data as any)?.urls ?? [];
      if (urls.length > 0) {
        setImageUrls((prev) => [...prev, ...urls].slice(0, 6));
      }
    } catch {
      Alert.alert("Error", "Failed to upload image");
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (idx: number) => {
    setImageUrls((prev) => prev.filter((_, i) => i !== idx));
  };

  const submit = async () => {
    if (!provider_id || !user) return;
    const desc = description.trim();
    if (desc.length < 10) {
      Alert.alert("Description required", "Please describe your request (at least 10 characters)");
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post("/api/me/custom-requests", {
        provider_id,
        description: desc,
        budget_min: budgetMin ? parseFloat(budgetMin) : null,
        budget_max: budgetMax ? parseFloat(budgetMax) : null,
        duration_minutes: parseInt(duration || "60", 10),
        location_type: locationType,
        image_urls: imageUrls,
      });
      if (res.error) {
        Alert.alert("Error", res.error.message || "Failed to submit");
      } else {
        haptic.success();
        const result = res.data as { conversation_id?: string } | null;
        const conversationId = result?.conversation_id;
        Alert.alert(
          "Submitted",
          "Your custom request has been sent. The provider will respond soon.",
          [
            {
              text: conversationId ? "Go to Chat" : "OK",
              onPress: () => {
                if (conversationId) {
                  router.replace({ pathname: "/(app)/chat", params: { id: conversationId } });
                } else {
                  router.back();
                }
              },
            },
            ...(conversationId
              ? [{ text: "Later", style: "cancel" as const, onPress: () => router.back() }]
              : []),
          ],
        );
      }
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) {
    return (
      <View className="flex-1 bg-white items-center justify-center p-6">
        <Text className="text-gray-600">Log in to make a custom request</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "Custom Request" }} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}>
      <ScrollView className="flex-1 bg-white" contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        <Text className="text-sm text-gray-600 mb-2">Describe what you&apos;re looking for (min 10 characters)</Text>
        <TextInput
          className="border border-gray-200 rounded-xl px-4 py-3 min-h-[100] text-base"
          placeholder="E.g. I need a bridal makeup look for my wedding in 2 weeks. I'd like a natural glow with soft pink tones..."
          value={description}
          onChangeText={setDescription}
          multiline
          maxLength={4000}
        />

        <Text className="text-sm text-gray-600 mt-4 mb-2">Budget (optional)</Text>
        <View className="flex-row gap-3">
          <TextInput
            className="flex-1 border border-gray-200 rounded-xl px-4 py-3"
            placeholder="Min"
            value={budgetMin}
            onChangeText={setBudgetMin}
            keyboardType="numeric"
          />
          <TextInput
            className="flex-1 border border-gray-200 rounded-xl px-4 py-3"
            placeholder="Max"
            value={budgetMax}
            onChangeText={setBudgetMax}
            keyboardType="numeric"
          />
        </View>

        <Text className="text-sm text-gray-600 mt-4 mb-2">Duration (minutes)</Text>
        <TextInput
          className="border border-gray-200 rounded-xl px-4 py-3"
          placeholder="60"
          value={duration}
          onChangeText={setDuration}
          keyboardType="numeric"
        />

        <Text className="text-sm text-gray-600 mt-4 mb-2">Where?</Text>
        <View className="flex-row gap-3">
          <TouchableOpacity
            onPress={() => setLocationType("at_salon")}
            className={`flex-1 py-3 rounded-xl border ${locationType === "at_salon" ? "border-primary bg-primary-light" : "border-gray-200"}`}
          >
            <Text className={`text-center font-medium ${locationType === "at_salon" ? "text-primary" : "text-gray-700"}`}>At salon</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setLocationType("at_home")}
            className={`flex-1 py-3 rounded-xl border ${locationType === "at_home" ? "border-primary bg-primary-light" : "border-gray-200"}`}
          >
            <Text className={`text-center font-medium ${locationType === "at_home" ? "text-primary" : "text-gray-700"}`}>At home</Text>
          </TouchableOpacity>
        </View>

        <Text className="text-sm text-gray-600 mt-4 mb-2">Inspiration photos (optional, max 6)</Text>
        <View className="flex-row flex-wrap gap-2">
          {imageUrls.map((url, i) => (
            <View key={i} className="relative">
              <Image source={{ uri: url }} style={{ width: 80, height: 80, borderRadius: 8 }} contentFit="cover" cachePolicy="memory-disk" transition={200} />
              <Pressable onPress={() => removeImage(i)} className="absolute -top-1 -right-1 bg-red-500 w-5 h-5 rounded-full items-center justify-center">
                <Text className="text-white text-xs">×</Text>
              </Pressable>
            </View>
          ))}
          {imageUrls.length < 6 && (
            <TouchableOpacity
              onPress={addImage}
              disabled={uploading}
              className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-300 items-center justify-center"
            >
              {uploading ? <ActivityIndicator size="small" /> : <Text className="text-gray-500 text-2xl">+</Text>}
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          onPress={submit}
          disabled={submitting}
          className="bg-primary py-4 rounded-xl items-center mt-6"
        >
          {submitting ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold text-lg">Submit request</Text>}
        </TouchableOpacity>
      </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}
