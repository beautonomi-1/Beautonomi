import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, Stack, router } from "expo-router";
import { api } from "@/lib/api-client";
import { useImagePicker } from "@/hooks/useImagePicker";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { useResponsive } from "@/hooks/useResponsive";
import { Colors } from "@/constants/colors";

export default function ReviewWriteScreen() {
  useScreenTracking("Review Write");
  const { contentPadding, contentMaxWidth, isTablet } = useResponsive();
  const constraint = (isTablet || Platform.OS === "web") ? { maxWidth: Math.min(500, contentMaxWidth), alignSelf: "center" as const, width: "100%" as const } : {};
  const { bookingId, reviewId, rating: initRating, comment: initComment } = useLocalSearchParams<{
    bookingId: string;
    reviewId?: string;
    rating?: string;
    comment?: string;
  }>();
  const [rating, setRating] = useState(initRating ? parseInt(initRating, 10) : 5);
  const [comment, setComment] = useState(initComment || "");
  const [photos, setPhotos] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { pickFromLibrary } = useImagePicker();

  const isEdit = !!reviewId;

  const submit = async () => {
    if (!bookingId || rating < 1 || rating > 5) return;
    setLoading(true);
    try {
      if (isEdit) {
        const res = await api.patch(`/api/bookings/${bookingId}/review`, {
          rating,
          comment: comment.trim() || undefined,
          photos: photos.length > 0 ? photos : undefined,
        });
        if (res.error) Alert.alert("Error", res.error.message || "Failed to update review");
        else router.back();
      } else {
        const res = await api.post(`/api/bookings/${bookingId}/review`, {
          rating,
          comment: comment.trim() || undefined,
          photos: photos.length > 0 ? photos : undefined,
        });
        if (res.error) Alert.alert("Error", res.error.message || "Failed to submit review");
        else router.back();
      }
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to submit");
    } finally {
      setLoading(false);
    }
  };

  const addPhoto = async () => {
    if (photos.length >= 4) return;
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
        setPhotos((p) => [...p, ...urls].slice(0, 4));
      }
    } catch {
      Alert.alert("Error", "Failed to upload photo");
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: isEdit ? "Edit Review" : "Write Review" }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}>
      <ScrollView style={{ flex: 1, backgroundColor: Colors.white }} contentContainerStyle={{ padding: contentPadding, paddingBottom: 48, ...constraint }}>
        <Text style={{ fontWeight: "600", color: Colors.gray[900], marginBottom: 8 }}>Rating</Text>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 16, gap: 8 }}>
          {[1, 2, 3, 4, 5].map((r) => (
            <TouchableOpacity
              key={r}
              onPress={() => setRating(r)}
              style={{ padding: 4 }}
              accessibilityLabel={`${r} star${r > 1 ? "s" : ""}`}
              accessibilityRole="button"
            >
              <Ionicons
                name={rating >= r ? "star" : "star-outline"}
                size={40}
                color={rating >= r ? "#EAB308" : "#D1D5DB"}
              />
            </TouchableOpacity>
          ))}
        </View>
        <Text style={{ fontWeight: "600", color: Colors.gray[900], marginBottom: 8 }}>Your review</Text>
        <TextInput
          style={{ borderWidth: 1, borderColor: Colors.gray[200], borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, marginBottom: 16, minHeight: 100 }}
          placeholder="Share your experience..."
          placeholderTextColor={Colors.gray[400]}
          value={comment}
          onChangeText={setComment}
          multiline
          numberOfLines={4}
        />
        <Text style={{ fontWeight: "600", color: Colors.gray[900], marginBottom: 8 }}>Photos (optional, max 4)</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 16 }}>
          {photos.map((url, i) => (
            <View key={i} style={{ position: "relative", marginRight: 8, marginBottom: 8 }}>
              <Image source={{ uri: url }} style={{ width: 80, height: 80, borderRadius: 8 }} contentFit="cover" cachePolicy="memory-disk" transition={200} />
              <Pressable onPress={() => setPhotos((p) => p.filter((_, j) => j !== i))} style={{ position: "absolute", top: -4, right: -4, width: 24, height: 24, backgroundColor: "#EF4444", borderRadius: 12, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: Colors.white, fontSize: 12 }}>×</Text>
              </Pressable>
            </View>
          ))}
          {photos.length < 4 && (
            <TouchableOpacity onPress={addPhoto} disabled={uploading} style={{ width: 80, height: 80, borderRadius: 8, borderWidth: 2, borderStyle: "dashed", borderColor: Colors.gray[300], alignItems: "center", justifyContent: "center", marginRight: 8, marginBottom: 8 }}>
              {uploading ? <ActivityIndicator size="small" /> : <Text style={{ color: Colors.gray[500], fontSize: 24 }}>+</Text>}
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity onPress={submit} disabled={loading} style={{ backgroundColor: Colors.primary, paddingVertical: 16, borderRadius: 12, alignItems: "center", opacity: loading ? 0.5 : 1 }}>
          {loading ? <ActivityIndicator color={Colors.white} /> : <Text style={{ color: Colors.white, fontWeight: "600", fontSize: 18 }}>Submit</Text>}
        </TouchableOpacity>
      </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}
