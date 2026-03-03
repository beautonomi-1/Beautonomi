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
import { useLocalSearchParams, Stack, router } from "expo-router";
import { api } from "@/lib/api-client";
import { useImagePicker } from "@/hooks/useImagePicker";
import { useScreenTracking } from "@/hooks/useScreenTracking";

export default function ReviewWriteScreen() {
  useScreenTracking("Review Write");
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
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}>
      <ScrollView className="flex-1 bg-white" contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        <Text className="font-semibold text-gray-900 mb-2">Rating</Text>
        <View className="flex-row gap-2 mb-4">
          {[1, 2, 3, 4, 5].map((r) => (
            <TouchableOpacity
              key={r}
              onPress={() => setRating(r)}
              className="w-12 h-12 rounded-full items-center justify-center border"
              style={{ backgroundColor: rating >= r ? "#FFD700" : "transparent", borderColor: "#FFD700" }}
            >
              <Text className="text-xl">★</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text className="font-semibold text-gray-900 mb-2">Your review</Text>
        <TextInput
          className="border border-gray-200 rounded-xl px-4 py-3 text-base mb-4 min-h-[100px]"
          placeholder="Share your experience..."
          value={comment}
          onChangeText={setComment}
          multiline
          numberOfLines={4}
        />

        <Text className="font-semibold text-gray-900 mb-2">Photos (optional, max 4)</Text>
        <View className="flex-row flex-wrap gap-2 mb-4">
          {photos.map((url, i) => (
            <View key={i} className="relative">
              <Image source={{ uri: url }} style={{ width: 80, height: 80, borderRadius: 8 }} contentFit="cover" cachePolicy="memory-disk" transition={200} />
              <Pressable
                onPress={() => setPhotos((p) => p.filter((_, j) => j !== i))}
                className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 rounded-full items-center justify-center"
              >
                <Text className="text-white text-xs">×</Text>
              </Pressable>
            </View>
          ))}
          {photos.length < 4 && (
            <TouchableOpacity
              onPress={addPhoto}
              disabled={uploading}
              className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-300 items-center justify-center"
            >
              {uploading ? <ActivityIndicator size="small" /> : <Text className="text-gray-500 text-2xl">+</Text>}
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          onPress={submit}
          disabled={loading}
          className="bg-primary py-4 rounded-xl items-center disabled:opacity-50"
        >
          {loading ? <ActivityIndicator color="white" /> : <Text className="text-white font-semibold text-lg">Submit</Text>}
        </TouchableOpacity>
      </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}
