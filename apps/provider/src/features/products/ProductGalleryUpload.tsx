import { useCallback, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { twStyle } from "@/lib/twStyle";
import { api } from "@/lib/api-client";
import { appendFormDataFileNative } from "@beautonomi/utils";
import { useImagePicker } from "@/hooks/useImagePicker";

const MAX_IMAGES = 5;

type Props = {
  imageUrls: string[];
  onChange: (urls: string[]) => void;
};

export function ProductGalleryUpload({ imageUrls, onChange }: Props) {
  const [uploading, setUploading] = useState(false);
  const { pickFromLibrary, pickFromCamera } = useImagePicker();

  const uploadAsset = useCallback(
    async (asset: { uri: string; mimeType?: string | null; fileName?: string | null }) => {
      if (imageUrls.length >= MAX_IMAGES) {
        Alert.alert("Limit reached", `You can add up to ${MAX_IMAGES} images.`);
        return;
      }
      setUploading(true);
      try {
        const formData = new FormData();
        const name = asset.fileName || `product-${Date.now()}.jpg`;
        appendFormDataFileNative(formData, "file", { uri: asset.uri, type: asset.mimeType || "image/jpeg", name });
        formData.append("folder", "products");
        const res = await api.fetch<{ url?: string }>("/api/upload", { method: "POST", body: formData });
        if (res.error || !res.data?.url) {
          Alert.alert("Upload failed", res.error?.message ?? "Could not upload image.");
          return;
        }
        onChange([...imageUrls, res.data.url]);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } finally {
        setUploading(false);
      }
    },
    [imageUrls, onChange],
  );

  const pickLibrary = async () => {
    const picked = await pickFromLibrary({ aspect: [1, 1], allowsEditing: true, quality: 0.8 });
    if (!picked) return;
    await uploadAsset(picked);
  };

  const takePhoto = async () => {
    const picked = await pickFromCamera({ aspect: [1, 1], allowsEditing: true, quality: 0.8 });
    if (!picked) return;
    await uploadAsset(picked);
  };

  const removeAt = (index: number) => {
    onChange(imageUrls.filter((_, i) => i !== index));
  };

  const movePrimary = (index: number) => {
    if (index === 0) return;
    const next = [...imageUrls];
    const [item] = next.splice(index, 1);
    next.unshift(item);
    onChange(next);
  };

  return (
    <View style={twStyle("mb-4")}>
      <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Product images (up to {MAX_IMAGES})</Text>
      <Text style={twStyle("mb-2 text-xs text-gray-500")}>First image is the primary thumbnail.</Text>
      <View style={twStyle("flex-row flex-wrap gap-2")}>
        {imageUrls.map((url, idx) => (
          <View key={`${url}-${idx}`} style={twStyle("relative")}>
            <Image source={{ uri: url }} style={{ width: 72, height: 72, borderRadius: 12, borderWidth: idx === 0 ? 2 : 1, borderColor: idx === 0 ? "#6366f1" : "#e5e7eb" }} contentFit="cover" />
            {idx === 0 && (
              <View style={twStyle("absolute left-1 top-1 rounded bg-indigo-600 px-1")}>
                <Text style={twStyle("text-[9px] font-semibold text-white")}>Primary</Text>
              </View>
            )}
            <View style={twStyle("absolute -right-1 -top-1 flex-row")}>
              {idx > 0 && (
                <TouchableOpacity onPress={() => movePrimary(idx)} style={twStyle("mr-1 rounded-full bg-white p-1 shadow")}>
                  <Ionicons name="star-outline" size={14} color="#6366f1" />
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => removeAt(idx)} style={twStyle("rounded-full bg-white p-1 shadow")}>
                <Ionicons name="close" size={14} color="#ef4444" />
              </TouchableOpacity>
            </View>
          </View>
        ))}
        {imageUrls.length < MAX_IMAGES && (
          <View style={twStyle("flex-row gap-2")}>
            <TouchableOpacity onPress={pickLibrary} disabled={uploading} style={twStyle("h-[72px] w-[72px] items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50")}>
              {uploading ? <ActivityIndicator /> : <Ionicons name="images-outline" size={24} color="#6b7280" />}
            </TouchableOpacity>
            <TouchableOpacity onPress={takePhoto} disabled={uploading} style={twStyle("h-[72px] w-[72px] items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50")}>
              <Ionicons name="camera-outline" size={24} color="#6b7280" />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}
