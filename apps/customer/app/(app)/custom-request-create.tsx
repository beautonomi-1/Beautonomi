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
import { useResponsive } from "@/hooks/useResponsive";
import { haptic } from "@/lib/haptics";
import { Colors } from "@/constants/colors";

export default function CustomRequestCreateScreen() {
  useScreenTracking("Custom Request Create");
  const { provider_id } = useLocalSearchParams<{ provider_id: string }>();
  const { user } = useAuth();
  const { contentPadding, contentMaxWidth, isTablet } = useResponsive();
  const constraint = (isTablet || Platform.OS === "web") ? { maxWidth: Math.min(500, contentMaxWidth), alignSelf: "center" as const, width: "100%" as const } : {};
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
      if (res.error) {
        Alert.alert("Upload failed", "Could not upload image. Please try again.");
        return;
      }
      const urls = (res.data as any)?.urls ?? [];
      if (urls.length > 0) {
        setImageUrls((prev) => [...prev, ...urls].slice(0, 6));
      } else {
        Alert.alert("Upload issue", "Image uploaded but could not be processed. Please try again.");
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
    if (!provider_id) {
      Alert.alert("Error", "Provider not specified. Please go back and try again.");
      return;
    }
    if (!user) return;
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
        duration_minutes: parseInt(duration, 10) || 60,
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
      <View style={{ flex: 1, backgroundColor: Colors.white, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text style={{ color: Colors.gray[600] }}>Log in to make a custom request</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "Custom Request" }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}>
      <ScrollView style={{ flex: 1, backgroundColor: Colors.white }} contentContainerStyle={{ padding: contentPadding, paddingBottom: 48, ...constraint }}>
        <Text style={{ fontSize: 14, color: Colors.gray[600], marginBottom: 8 }}>Describe what you&apos;re looking for (min 10 characters)</Text>
        <TextInput
          style={{ borderWidth: 1, borderColor: Colors.gray[200], borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 100, fontSize: 16 }}
          placeholder="E.g. I need a bridal makeup look for my wedding in 2 weeks. I'd like a natural glow with soft pink tones..."
          placeholderTextColor={Colors.gray[400]}
          value={description}
          onChangeText={setDescription}
          multiline
          maxLength={4000}
        />
        <Text style={{ fontSize: 14, color: Colors.gray[600], marginTop: 16, marginBottom: 8 }}>Budget (optional)</Text>
        <View style={{ flexDirection: "row" }}>
          <TextInput style={{ flex: 1, borderWidth: 1, borderColor: Colors.gray[200], borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginRight: 12 }} placeholder="Min" placeholderTextColor={Colors.gray[400]} value={budgetMin} onChangeText={setBudgetMin} keyboardType="numeric" />
          <TextInput style={{ flex: 1, borderWidth: 1, borderColor: Colors.gray[200], borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12 }} placeholder="Max" placeholderTextColor={Colors.gray[400]} value={budgetMax} onChangeText={setBudgetMax} keyboardType="numeric" />
        </View>
        <Text style={{ fontSize: 14, color: Colors.gray[600], marginTop: 16, marginBottom: 8 }}>Duration (minutes)</Text>
        <TextInput style={{ borderWidth: 1, borderColor: Colors.gray[200], borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12 }} placeholder="60" placeholderTextColor={Colors.gray[400]} value={duration} onChangeText={setDuration} keyboardType="numeric" />
        <Text style={{ fontSize: 14, color: Colors.gray[600], marginTop: 16, marginBottom: 8 }}>Where?</Text>
        <View style={{ flexDirection: "row" }}>
          <TouchableOpacity onPress={() => setLocationType("at_salon")} style={{ flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: locationType === "at_salon" ? Colors.primary : Colors.gray[200], backgroundColor: locationType === "at_salon" ? Colors.primaryLight : "transparent", marginRight: 12 }}>
            <Text style={{ textAlign: "center", fontWeight: "500", color: locationType === "at_salon" ? Colors.primary : Colors.gray[700] }}>At salon</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setLocationType("at_home")} style={{ flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: locationType === "at_home" ? Colors.primary : Colors.gray[200], backgroundColor: locationType === "at_home" ? Colors.primaryLight : "transparent" }}>
            <Text style={{ textAlign: "center", fontWeight: "500", color: locationType === "at_home" ? Colors.primary : Colors.gray[700] }}>At home</Text>
          </TouchableOpacity>
        </View>
        <Text style={{ fontSize: 14, color: Colors.gray[600], marginTop: 16, marginBottom: 8 }}>Inspiration photos (optional, max 6)</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {imageUrls.map((url, i) => (
            <View key={i} style={{ position: "relative", marginRight: 8, marginBottom: 8 }}>
              <Image source={{ uri: url }} style={{ width: 80, height: 80, borderRadius: 8 }} contentFit="cover" cachePolicy="memory-disk" transition={200} />
              <Pressable onPress={() => removeImage(i)} style={{ position: "absolute", top: -4, right: -4, width: 20, height: 20, backgroundColor: "#EF4444", borderRadius: 10, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: Colors.white, fontSize: 12 }}>×</Text>
              </Pressable>
            </View>
          ))}
          {imageUrls.length < 6 && (
            <TouchableOpacity onPress={addImage} disabled={uploading} style={{ width: 80, height: 80, borderRadius: 8, borderWidth: 2, borderStyle: "dashed", borderColor: Colors.gray[300], alignItems: "center", justifyContent: "center", marginRight: 8, marginBottom: 8 }}>
              {uploading ? <ActivityIndicator size="small" /> : <Text style={{ color: Colors.gray[500], fontSize: 24 }}>+</Text>}
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity onPress={submit} disabled={submitting} style={{ backgroundColor: Colors.primary, paddingVertical: 16, borderRadius: 12, alignItems: "center", marginTop: 24 }}>
          {submitting ? <ActivityIndicator color={Colors.white} /> : <Text style={{ color: Colors.white, fontWeight: "600", fontSize: 18 }}>Submit request</Text>}
        </TouchableOpacity>
      </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}
