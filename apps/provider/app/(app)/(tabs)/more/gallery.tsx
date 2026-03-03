import { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Image,
  Alert,
  TextInput,
  Modal,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";

type GalleryItem = { id: string; url: string; position: number };
type GalleryResponse = { items?: GalleryItem[]; thumbnailUrl?: string | null; avatarUrl?: string | null };

type AddMode = "choice" | "url";

export default function GalleryScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [addMode, setAddMode] = useState<AddMode>("choice");
  const [newUrl, setNewUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  const { data, loading, error, refresh } = useApi<GalleryResponse>("/api/provider/gallery");
  const { execute: deleteItem } = useApiMutation("delete");
  const { execute: postItem, loading: adding } = useApiMutation("post");
  const { execute: patchProfile } = useApiMutation<{ avatar_url?: string | null; thumbnail_url?: string | null }>("patch");

  const items: GalleryItem[] = data?.items ?? [];
  const thumbnailUrl = data?.thumbnailUrl ?? null;
  const avatarUrl = data?.avatarUrl ?? null;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const handleDelete = useCallback(
    (item: GalleryItem) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      Alert.alert("Remove photo", "Remove this photo from your gallery?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            const res = await deleteItem(`/api/provider/gallery?index=${item.position}`);
            if (!res.error) await refresh();
          },
        },
      ]);
    },
    [deleteItem, refresh]
  );

  const handleAddByUrl = useCallback(async () => {
    const url = newUrl.trim();
    if (!url) return;
    const res = await postItem("/api/provider/gallery", { url });
    if (!res.error) {
      setNewUrl("");
      setAddModalVisible(false);
      setAddMode("choice");
      await refresh();
    }
  }, [newUrl, postItem, refresh]);

  const pickAndUpload = useCallback(
    async (useCamera: boolean) => {
      try {
        const permission = useCamera
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert(
            "Permission needed",
            useCamera
              ? "Camera access is needed to take a photo."
              : "Photo library access is needed to choose a photo."
          );
          return;
        }
        setAddModalVisible(false);
        setAddMode("choice");
        const result = useCamera
          ? await ImagePicker.launchCameraAsync({
              mediaTypes: ["images"],
              quality: 0.8,
              base64: true,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ["images"],
              quality: 0.8,
              base64: true,
              allowsMultipleSelection: false,
            });
        if (result.canceled || !result.assets?.[0]) return;
        const asset = result.assets[0];
        const base64 = asset.base64;
        const mime = asset.mimeType ?? "image/jpeg";
        if (!base64) {
          Alert.alert("Upload failed", "Could not read image. Try another photo.");
          return;
        }
        const dataUrl = `data:${mime};base64,${base64}`;
        setUploading(true);
        const res = await postItem("/api/provider/gallery", { image_base64: dataUrl });
        if (!res.error) {
          await refresh();
        } else {
          Alert.alert("Upload failed", res.error);
        }
      } catch (e) {
        Alert.alert("Upload failed", e instanceof Error ? e.message : "Something went wrong.");
      } finally {
        setUploading(false);
      }
    },
    [postItem, refresh]
  );

  const openAddModal = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAddMode("choice");
    setNewUrl("");
    setAddModalVisible(true);
  }, []);

  const handleSetThumbnail = useCallback(
    async (url: string) => {
      if (thumbnailUrl === url) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const res = await patchProfile("/api/provider/profile", { thumbnail_url: url });
      if (!res.error) await refresh();
    },
    [thumbnailUrl, patchProfile, refresh]
  );

  const handleSetAvatar = useCallback(
    async (url: string) => {
      if (avatarUrl === url) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const res = await patchProfile("/api/provider/profile", { avatar_url: url });
      if (!res.error) await refresh();
    },
    [avatarUrl, patchProfile, refresh]
  );

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Gallery" onBack={() => router.back()} />
        <View className="flex-1 items-center justify-center py-12">
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Gallery" onBack={() => router.back()} />
        <View className="flex-1 justify-center px-4">
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader
        title="Gallery"
        subtitle="Portfolio & photos"
        onBack={() => router.back()}
        rightAction={
          uploading ? (
            <View className="rounded-full bg-gray-100 p-2">
              <ActivityIndicator size="small" color="#374151" />
            </View>
          ) : (
            <TouchableOpacity
              onPress={openAddModal}
              className="rounded-full bg-gray-100 p-2"
              accessibilityLabel="Add photo"
              accessibilityRole="button"
            >
              <Ionicons name="add" size={22} color="#374151" />
            </TouchableOpacity>
          )
        }
      />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Listing image & Profile circle */}
        <View className="px-4 pt-2 pb-4 flex-row gap-4">
          <View className="flex-1 items-center">
            <Text className="text-xs font-medium text-gray-500 mb-1">Listing image</Text>
            <View className="w-14 h-14 rounded-lg overflow-hidden border-2 border-[#FF0077] bg-gray-100">
              {thumbnailUrl ? (
                <Image source={{ uri: thumbnailUrl }} className="w-full h-full" resizeMode="cover" />
              ) : (
                <View className="w-full h-full items-center justify-center">
                  <Ionicons name="image-outline" size={24} color="#9ca3af" />
                </View>
              )}
            </View>
          </View>
          <View className="flex-1 items-center">
            <Text className="text-xs font-medium text-gray-500 mb-1">Profile circle</Text>
            <View className="w-14 h-14 rounded-full overflow-hidden border-2 border-indigo-500 bg-gray-100">
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} className="w-full h-full" resizeMode="cover" />
              ) : (
                <View className="w-full h-full items-center justify-center">
                  <Ionicons name="person-circle-outline" size={24} color="#9ca3af" />
                </View>
              )}
            </View>
          </View>
        </View>
        <Text className="px-4 text-sm text-gray-600 pb-3">
          Tap the icons on a photo to set it as listing image (card hero) or profile circle (face of your business).
        </Text>
        {items.length === 0 ? (
          <View className="py-12 px-4 items-center">
            <Ionicons name="images-outline" size={48} color="#9ca3af" />
            <Text className="mt-4 text-center text-gray-600">No photos yet</Text>
            <Text className="mt-2 text-center text-sm text-gray-500 px-2">
              Upload from your device or add a photo by URL
            </Text>
            <TouchableOpacity
              onPress={openAddModal}
              className="mt-6 rounded-xl bg-gray-900 px-6 py-4 flex-row items-center gap-2"
              accessibilityLabel="Add photo"
              accessibilityRole="button"
            >
              <Ionicons name="add-circle-outline" size={22} color="#fff" />
              <Text className="text-sm font-medium text-white">Add photo</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View className="flex-row flex-wrap gap-3 pb-4">
            {items.map((item) => (
              <View key={item.id} className="w-[47%] aspect-square rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
                <Image source={{ uri: item.url }} className="flex-1 w-full h-full" resizeMode="cover" />
                <TouchableOpacity
                  onPress={() => handleDelete(item)}
                  className="absolute top-2 right-2 h-8 w-8 items-center justify-center rounded-full bg-black/60"
                  accessibilityLabel="Remove photo from gallery"
                  accessibilityRole="button"
                >
                  <Ionicons name="trash-outline" size={18} color="#fff" />
                </TouchableOpacity>
                <View className="absolute bottom-2 left-2 right-2 flex-row gap-2">
                  <TouchableOpacity
                    onPress={() => handleSetThumbnail(item.url)}
                    className={`h-8 w-8 items-center justify-center rounded-full ${thumbnailUrl === item.url ? "bg-[#FF0077]" : "bg-black/60"}`}
                    accessibilityLabel={thumbnailUrl === item.url ? "Listing image" : "Set as listing image"}
                    accessibilityRole="button"
                  >
                    <Ionicons name={thumbnailUrl === item.url ? "star" : "star-outline"} size={18} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleSetAvatar(item.url)}
                    className={`h-8 w-8 items-center justify-center rounded-full ${avatarUrl === item.url ? "bg-indigo-600" : "bg-black/60"}`}
                    accessibilityLabel={avatarUrl === item.url ? "Profile circle" : "Set as profile circle"}
                    accessibilityRole="button"
                  >
                    <Ionicons name={avatarUrl === item.url ? "person-circle" : "person-circle-outline"} size={18} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal visible={addModalVisible} transparent animationType="fade">
        <TouchableOpacity
          activeOpacity={1}
          className="flex-1 bg-black/50 justify-end"
          onPress={() => {
            setAddModalVisible(false);
            setAddMode("choice");
          }}
        >
          <View className="bg-white rounded-t-2xl p-5 pb-10">
            {addMode === "choice" ? (
              <>
                <Text className="text-lg font-semibold text-gray-900 mb-1">Add photo</Text>
                <Text className="text-sm text-gray-500 mb-4">Choose how to add a photo</Text>
                <TouchableOpacity
                  onPress={() => pickAndUpload(true)}
                  className="rounded-xl border border-gray-200 bg-gray-50 py-4 px-4 flex-row items-center gap-3 mb-3"
                  accessibilityLabel="Take a photo"
                  accessibilityRole="button"
                >
                  <View className="w-10 h-10 rounded-full bg-gray-200 items-center justify-center">
                    <Ionicons name="camera-outline" size={22} color="#374151" />
                  </View>
                  <View className="flex-1">
                    <Text className="font-medium text-gray-900">Take photo</Text>
                    <Text className="text-sm text-gray-500">Use your camera</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => pickAndUpload(false)}
                  className="rounded-xl border border-gray-200 bg-gray-50 py-4 px-4 flex-row items-center gap-3 mb-3"
                  accessibilityLabel="Choose from photo library"
                  accessibilityRole="button"
                >
                  <View className="w-10 h-10 rounded-full bg-gray-200 items-center justify-center">
                    <Ionicons name="images-outline" size={22} color="#374151" />
                  </View>
                  <View className="flex-1">
                    <Text className="font-medium text-gray-900">Choose from library</Text>
                    <Text className="text-sm text-gray-500">Pick an existing photo</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setAddMode("url")}
                  className="rounded-xl border border-gray-200 bg-gray-50 py-4 px-4 flex-row items-center gap-3 mb-4"
                  accessibilityLabel="Add photo by URL"
                  accessibilityRole="button"
                >
                  <View className="w-10 h-10 rounded-full bg-gray-200 items-center justify-center">
                    <Ionicons name="link-outline" size={22} color="#374151" />
                  </View>
                  <View className="flex-1">
                    <Text className="font-medium text-gray-900">Add by URL</Text>
                    <Text className="text-sm text-gray-500">Paste a link to an image</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setAddModalVisible(false);
                    setAddMode("choice");
                  }}
                  className="rounded-xl border border-gray-200 py-3 items-center"
                >
                  <Text className="font-medium text-gray-700">Cancel</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  onPress={() => setAddMode("choice")}
                  className="flex-row items-center gap-2 mb-3"
                >
                  <Ionicons name="arrow-back" size={20} color="#374151" />
                  <Text className="text-base text-gray-700">Back</Text>
                </TouchableOpacity>
                <Text className="text-lg font-semibold text-gray-900 mb-2">Add photo by URL</Text>
                <TextInput
                  value={newUrl}
                  onChangeText={setNewUrl}
                  placeholder="https://..."
                  placeholderTextColor="#9ca3af"
                  className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900 mb-4"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <View className="flex-row gap-3">
                  <TouchableOpacity
                    onPress={() => {
                      setAddModalVisible(false);
                      setAddMode("choice");
                    }}
                    className="flex-1 rounded-xl border border-gray-200 py-3 items-center"
                  >
                    <Text className="font-medium text-gray-700">Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleAddByUrl}
                    disabled={adding || !newUrl.trim()}
                    className="flex-1 rounded-xl bg-gray-900 py-3 items-center"
                  >
                    <Text className="font-medium text-white">{adding ? "Adding…" : "Add"}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </ScreenContainer>
  );
}
