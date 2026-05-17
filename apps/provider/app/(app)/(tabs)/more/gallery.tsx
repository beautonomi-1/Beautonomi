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
  InteractionManager,
  Platform,
  Pressable,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { appendFormDataFileNative } from "@beautonomi/utils";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { twStyle } from "@/lib/twStyle";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";

type GalleryItem = { id: string; url: string; position: number };
type GalleryResponse = { items?: GalleryItem[]; thumbnailUrl?: string | null; avatarUrl?: string | null };

type AddMode = "choice" | "url";

const PICKER_MEDIA = ImagePicker.MediaTypeOptions.Images;

/** Android + RN Modal: launching the picker while the sheet is still mounted freezes or no-ops. */
function runAfterModalFullyDismissed(fn: () => void) {
  InteractionManager.runAfterInteractions(() => {
    requestAnimationFrame(() => {
      if (Platform.OS === "android") {
        setTimeout(fn, 320);
      } else {
        fn();
      }
    });
  });
}

function fileNameFromUri(uri: string): string {
  const last = uri.split("/").pop() || "photo.jpg";
  return last.includes(".") ? last : `${last}.jpg`;
}

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
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
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

  const uploadGalleryMultipart = useCallback(
    async (asset: ImagePicker.ImagePickerAsset, applyAs?: "thumbnail" | "avatar") => {
      const uri = asset.uri;
      const mime = asset.mimeType ?? "image/jpeg";
      const formData = new FormData();
      appendFormDataFileNative(formData, "file", {
        uri,
        name: asset.fileName ?? fileNameFromUri(uri),
        type: mime,
      });
      if (applyAs) formData.append("apply_as", applyAs);

      const res = await api.fetch<{ url?: string }>("/api/provider/gallery", {
        method: "POST",
        body: formData,
      });
      if (res.error) {
        Alert.alert("Upload failed", getApiErrorMessage(res.error, "Could not upload photo."));
        return false;
      }
      return true;
    },
    []
  );

  const pickFromLibraryAndUpload = useCallback(
    async (opts: { applyAs?: "thumbnail" | "avatar"; deferAfterModal: boolean }) => {
      const { applyAs, deferAfterModal } = opts;

      const run = async () => {
        try {
          const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!permission.granted) {
            Alert.alert(
              "Permission needed",
              "Photo library access is needed to choose a photo. You can enable it in system settings."
            );
            return;
          }

          // Multi-select is only enabled when adding to gallery; profile/listing
          // overrides apply to exactly one image so they stay single-select.
          const allowMulti = !applyAs;
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: PICKER_MEDIA,
            quality: 0.85,
            base64: false,
            allowsMultipleSelection: allowMulti,
            selectionLimit: allowMulti ? 10 : 1,
          });

          if (result.canceled || !result.assets?.length) return;

          // Filter out files that are too large; warn once if any were skipped.
          const MAX_BYTES = 8 * 1024 * 1024;
          const tooLarge = result.assets.filter((a) => a.fileSize != null && a.fileSize > MAX_BYTES);
          const eligible = result.assets.filter((a) => a.fileSize == null || a.fileSize <= MAX_BYTES);
          if (tooLarge.length > 0) {
            Alert.alert(
              "Some files were too large",
              `${tooLarge.length} image${tooLarge.length === 1 ? "" : "s"} exceeded 8MB and ${tooLarge.length === 1 ? "was" : "were"} skipped.`,
            );
          }
          if (eligible.length === 0) return;

          setUploading(true);
          // Upload in parallel (server accepts one file per request).
          const results = await Promise.all(
            eligible.map((asset) => uploadGalleryMultipart(asset, applyAs)),
          );
          const okCount = results.filter(Boolean).length;
          if (okCount > 0) await refresh();
          if (okCount < eligible.length) {
            Alert.alert(
              "Some uploads failed",
              `${eligible.length - okCount} of ${eligible.length} photo${eligible.length === 1 ? "" : "s"} could not be uploaded. Please try again.`,
            );
          }
        } catch (e) {
          Alert.alert("Upload failed", e instanceof Error ? e.message : "Something went wrong.");
        } finally {
          setUploading(false);
        }
      };

      if (deferAfterModal) {
        runAfterModalFullyDismissed(() => {
          void run();
        });
      } else {
        await run();
      }
    },
    [refresh, uploadGalleryMultipart]
  );

  const takePhotoAndUpload = useCallback(
    async (deferAfterModal: boolean) => {
      const run = async () => {
        try {
          const permission = await ImagePicker.requestCameraPermissionsAsync();
          if (!permission.granted) {
            Alert.alert("Permission needed", "Camera access is needed to take a photo.");
            return;
          }

          const result = await ImagePicker.launchCameraAsync({
            mediaTypes: PICKER_MEDIA,
            quality: 0.85,
            base64: false,
          });

          if (result.canceled || !result.assets?.[0]) return;
          const asset = result.assets[0];

          setUploading(true);
          const ok = await uploadGalleryMultipart(asset);
          if (ok) await refresh();
        } catch (e) {
          Alert.alert("Upload failed", e instanceof Error ? e.message : "Something went wrong.");
        } finally {
          setUploading(false);
        }
      };

      if (deferAfterModal) {
        runAfterModalFullyDismissed(() => {
          void run();
        });
      } else {
        await run();
      }
    },
    [refresh, uploadGalleryMultipart]
  );

  const openAddModal = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAddMode("choice");
    setNewUrl("");
    setAddModalVisible(true);
  }, []);

  const promptChangeListingOrProfile = useCallback(
    (applyAs: "thumbnail" | "avatar") => {
      const label = applyAs === "thumbnail" ? "listing image" : "profile circle";
      Alert.alert(
        `Change ${label}`,
        "Choose a photo from your library. It will be added to your gallery and set as this image.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Choose photo",
            onPress: () => void pickFromLibraryAndUpload({ applyAs, deferAfterModal: false }),
          },
        ]
      );
    },
    [pickFromLibraryAndUpload]
  );

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
        <View style={twStyle("flex-1 items-center justify-center py-12")}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Gallery" onBack={() => router.back()} />
        <View style={twStyle("flex-1 justify-center px-4")}>
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
            <View style={twStyle("rounded-full bg-gray-100 p-2")}>
              <ActivityIndicator size="small" color="#374151" />
            </View>
          ) : (
            <TouchableOpacity
              onPress={openAddModal}
              style={twStyle("rounded-full bg-gray-100 p-2")}
              accessibilityLabel="Add photo"
              accessibilityRole="button"
            >
              <Ionicons name="add" size={22} color="#374151" />
            </TouchableOpacity>
          )
        }
      />
      <ScrollView
        style={twStyle("flex-1")}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Listing image & Profile circle — tap to pick from library in one step */}
        <View style={twStyle("px-4 pt-2 pb-4 flex-row")}>
          <View style={[twStyle("flex-1 items-center"), { marginRight: 16 }]}>
            <Text style={twStyle("text-xs font-medium text-gray-500 mb-1")}>Listing image</Text>
            <Pressable
              onPress={() => promptChangeListingOrProfile("thumbnail")}
              disabled={uploading}
              accessibilityRole="button"
              accessibilityLabel="Change listing image from photo library"
              style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
            >
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 8,
                  overflow: "hidden",
                  borderWidth: 2,
                  borderColor: "#FF0077",
                  backgroundColor: "#F3F4F6",
                }}
              >
                {thumbnailUrl ? (
                  <Image source={{ uri: thumbnailUrl }} style={{ width: 56, height: 56 }} resizeMode="cover" />
                ) : (
                  <View style={{ width: 56, height: 56, alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="image-outline" size={24} color="#9ca3af" />
                  </View>
                )}
              </View>
            </Pressable>
            <Text style={twStyle("text-[10px] text-primary mt-1 font-medium")}>Tap to change</Text>
          </View>
          <View style={twStyle("flex-1 items-center")}>
            <Text style={twStyle("text-xs font-medium text-gray-500 mb-1")}>Profile circle</Text>
            <Pressable
              onPress={() => promptChangeListingOrProfile("avatar")}
              disabled={uploading}
              accessibilityRole="button"
              accessibilityLabel="Change profile circle from photo library"
              style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
            >
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  overflow: "hidden",
                  borderWidth: 2,
                  borderColor: "#4f46e5",
                  backgroundColor: "#F3F4F6",
                }}
              >
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={{ width: 56, height: 56 }} resizeMode="cover" />
                ) : (
                  <View style={{ width: 56, height: 56, alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="person-circle-outline" size={24} color="#9ca3af" />
                  </View>
                )}
              </View>
            </Pressable>
            <Text style={twStyle("text-[10px] text-indigo-600 mt-1 font-medium")}>Tap to change</Text>
          </View>
        </View>
        <Text style={twStyle("px-4 text-sm text-gray-600 pb-3")}>
          Tap the previews above to pick from your phone, or use the star and person icons on any gallery photo.
        </Text>
        {items.length === 0 ? (
          <View style={twStyle("py-12 px-4 items-center")}>
            <Ionicons name="images-outline" size={48} color="#9ca3af" />
            <Text style={twStyle("mt-4 text-center text-gray-600")}>No photos yet</Text>
            <Text style={twStyle("mt-2 text-center text-sm text-gray-500 px-2")}>
              Upload from your device or add a photo by URL
            </Text>
            <TouchableOpacity
              onPress={openAddModal}
              style={[twStyle("mt-6 rounded-xl bg-gray-900 px-6 py-4 flex-row items-center"), { marginRight: 8 }]}
              accessibilityLabel="Add photo"
              accessibilityRole="button"
            >
              <Ionicons name="add-circle-outline" size={22} color="#fff" style={{ marginRight: 8 }} />
              <Text style={twStyle("text-sm font-medium text-white")}>Add photo</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={twStyle("flex-row flex-wrap pb-4")}>
            {items.map((item) => (
              <View
                key={item.id}
                style={{
                  width: "47%",
                  aspectRatio: 1,
                  marginRight: 12,
                  marginBottom: 12,
                  borderRadius: 12,
                  overflow: "hidden",
                  borderWidth: 1,
                  borderColor: "#E5E7EB",
                  backgroundColor: "#F9FAFB",
                }}
              >
                <Image source={{ uri: item.url }} style={{ width: "100%", aspectRatio: 1 }} resizeMode="cover" />
                <TouchableOpacity
                  onPress={() => handleDelete(item)}
                  style={twStyle("absolute top-2 right-2 h-8 w-8 items-center justify-center rounded-full bg-black/60")}
                  accessibilityLabel="Remove photo from gallery"
                  accessibilityRole="button"
                >
                  <Ionicons name="trash-outline" size={18} color="#fff" />
                </TouchableOpacity>
                <View style={twStyle("absolute bottom-2 left-2 right-2 flex-row")}>
                  <TouchableOpacity
                    onPress={() => handleSetThumbnail(item.url)}
                    style={[
                      twStyle(`h-8 w-8 items-center justify-center rounded-full ${thumbnailUrl === item.url ? "bg-primary" : "bg-black/60"}`),
                      { marginRight: 8 },
                    ]}
                    accessibilityLabel={thumbnailUrl === item.url ? "Listing image" : "Set as listing image"}
                    accessibilityRole="button"
                  >
                    <Ionicons name={thumbnailUrl === item.url ? "star" : "star-outline"} size={18} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleSetAvatar(item.url)}
                    style={twStyle(
                      `h-8 w-8 items-center justify-center rounded-full ${avatarUrl === item.url ? "bg-indigo-600" : "bg-black/60"}`
                    )}
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

      <Modal
        visible={addModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setAddModalVisible(false);
          setAddMode("choice");
        }}
      >
        <View style={twStyle("flex-1 justify-end")}>
          <Pressable
            style={twStyle("absolute inset-0 bg-black/50")}
            onPress={() => {
              setAddModalVisible(false);
              setAddMode("choice");
            }}
            accessibilityLabel="Dismiss add photo options"
          />
          <View style={twStyle("bg-white rounded-t-2xl p-5 pb-10")}>
            {addMode === "choice" ? (
              <>
                <Text style={twStyle("text-lg font-semibold text-gray-900 mb-1")}>Add photo</Text>
                <Text style={twStyle("text-sm text-gray-500 mb-4")}>Choose how to add a photo</Text>
                <TouchableOpacity
                  onPress={() => {
                    setAddModalVisible(false);
                    setAddMode("choice");
                    takePhotoAndUpload(true);
                  }}
                  style={twStyle("rounded-xl border border-gray-200 bg-gray-50 py-4 px-4 flex-row items-center mb-3")}
                  accessibilityLabel="Take a photo"
                  accessibilityRole="button"
                >
                  <View style={[twStyle("w-10 h-10 rounded-full bg-gray-200 items-center justify-center"), { marginRight: 12 }]}>
                    <Ionicons name="camera-outline" size={22} color="#374151" />
                  </View>
                  <View style={[twStyle("flex-1"), { marginRight: 12 }]}>
                    <Text style={twStyle("font-medium text-gray-900")}>Take photo</Text>
                    <Text style={twStyle("text-sm text-gray-500")}>Use your camera</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setAddModalVisible(false);
                    setAddMode("choice");
                    void pickFromLibraryAndUpload({ deferAfterModal: true });
                  }}
                  style={twStyle("rounded-xl border border-gray-200 bg-gray-50 py-4 px-4 flex-row items-center mb-3")}
                  accessibilityLabel="Choose from photo library"
                  accessibilityRole="button"
                >
                  <View style={[twStyle("w-10 h-10 rounded-full bg-gray-200 items-center justify-center"), { marginRight: 12 }]}>
                    <Ionicons name="images-outline" size={22} color="#374151" />
                  </View>
                  <View style={[twStyle("flex-1"), { marginRight: 12 }]}>
                    <Text style={twStyle("font-medium text-gray-900")}>Choose from library</Text>
                    <Text style={twStyle("text-sm text-gray-500")}>Pick an existing photo</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setAddMode("url")}
                  style={twStyle("rounded-xl border border-gray-200 bg-gray-50 py-4 px-4 flex-row items-center mb-4")}
                  accessibilityLabel="Add photo by URL"
                  accessibilityRole="button"
                >
                  <View style={[twStyle("w-10 h-10 rounded-full bg-gray-200 items-center justify-center"), { marginRight: 12 }]}>
                    <Ionicons name="link-outline" size={22} color="#374151" />
                  </View>
                  <View style={[twStyle("flex-1"), { marginRight: 12 }]}>
                    <Text style={twStyle("font-medium text-gray-900")}>Add by URL</Text>
                    <Text style={twStyle("text-sm text-gray-500")}>Paste a link to an image</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setAddModalVisible(false);
                    setAddMode("choice");
                  }}
                  style={twStyle("rounded-xl border border-gray-200 py-3 items-center")}
                >
                  <Text style={twStyle("font-medium text-gray-700")}>Cancel</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity onPress={() => setAddMode("choice")} style={twStyle("flex-row items-center mb-3")}>
                  <Ionicons name="arrow-back" size={20} color="#374151" style={{ marginRight: 8 }} />
                  <Text style={twStyle("text-base text-gray-700")}>Back</Text>
                </TouchableOpacity>
                <Text style={twStyle("text-lg font-semibold text-gray-900 mb-2")}>Add photo by URL</Text>
                <TextInput
                  value={newUrl}
                  onChangeText={setNewUrl}
                  placeholder="https://..."
                  placeholderTextColor="#9ca3af"
                  style={twStyle("rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900 mb-4")}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <View style={twStyle("flex-row")}>
                  <TouchableOpacity
                    onPress={() => {
                      setAddModalVisible(false);
                      setAddMode("choice");
                    }}
                    style={[twStyle("flex-1 rounded-xl border border-gray-200 py-3 items-center"), { marginRight: 12 }]}
                  >
                    <Text style={twStyle("font-medium text-gray-700")}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleAddByUrl}
                    disabled={adding || !newUrl.trim()}
                    style={twStyle("flex-1 rounded-xl bg-gray-900 py-3 items-center")}
                  >
                    <Text style={twStyle("font-medium text-white")}>{adding ? "Adding…" : "Add"}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
