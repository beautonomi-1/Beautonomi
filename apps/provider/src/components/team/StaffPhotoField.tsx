import { useCallback, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { twStyle } from "@/lib/twStyle";
import { appendUploadFile } from "@/lib/form-data-file";
import { useImagePicker } from "@/hooks/useImagePicker";
import { api } from "@/lib/api-client";
import { useTranslation } from "@beautonomi/i18n";
import { Avatar } from "@/components/ui/Avatar";

export function useStaffAvatarUpload() {
  const { pickWithOptions } = useImagePicker();
  const { t } = useTranslation();
  const pf = (key: string) =>
    t(`provider.mobile.components.staffPhotoField.${key}`) as string;

  return useCallback(async (): Promise<string | null> => {
    const picked = await pickWithOptions({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!picked) return null;
    const formData = new FormData();
    const name = picked.fileName || `staff-${Date.now()}.jpg`;
    await appendUploadFile(formData, "file", {
      uri: picked.uri,
      type: picked.mimeType || "image/jpeg",
      name,
    });
    formData.append("folder", "avatars");
    const res = await api.fetch<{ url?: string }>("/api/upload", {
      method: "POST",
      body: formData,
    });
    if (res.error || !res.data?.url) {
      Alert.alert(pf("uploadFailedTitle"), res.error?.message ?? pf("uploadFailedBody"));
      return null;
    }
    return res.data.url;
  }, [pickWithOptions, pf]);
}

type Props = {
  displayName: string;
  avatarUrl: string | null;
  onChange: (url: string | null) => void;
  disabled?: boolean;
  size?: "md" | "lg";
};

export function StaffPhotoField({
  displayName,
  avatarUrl,
  onChange,
  disabled,
  size = "lg",
}: Props) {
  const { t } = useTranslation();
  const pf = (key: string) =>
    t(`provider.mobile.components.staffPhotoField.${key}`) as string;
  const uploadAvatar = useStaffAvatarUpload();
  const [uploading, setUploading] = useState(false);

  const pickAndUpload = useCallback(async () => {
    if (disabled || uploading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setUploading(true);
    try {
      const url = await uploadAvatar();
      if (url) {
        onChange(url);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } finally {
      setUploading(false);
    }
  }, [disabled, uploading, uploadAvatar, onChange]);

  const clearPhoto = useCallback(() => {
    if (disabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onChange(null);
  }, [disabled, onChange]);

  const dim = size === "lg" ? 96 : 72;

  return (
    <View style={twStyle("mb-4 items-center")}>
      <View style={{ width: dim, height: dim }}>
        {avatarUrl ? (
          <Image
            source={{ uri: avatarUrl }}
            style={{ width: dim, height: dim, borderRadius: dim / 2 }}
            contentFit="cover"
          />
        ) : (
          <Avatar name={displayName} size={size === "lg" ? "xl" : "lg"} />
        )}
        {uploading ? (
          <View
            style={[
              twStyle("absolute inset-0 items-center justify-center rounded-full bg-black/40"),
              { borderRadius: dim / 2 },
            ]}
          >
            <ActivityIndicator color="#fff" />
          </View>
        ) : null}
        {!disabled ? (
          <TouchableOpacity
            onPress={() => void pickAndUpload()}
            style={twStyle(
              "absolute -bottom-1 -end-1 h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-gray-900",
            )}
            accessibilityLabel={pf("changePhotoA11y")}
          >
            <Ionicons name="camera" size={18} color="#fff" />
          </TouchableOpacity>
        ) : null}
      </View>
      <Text style={twStyle("mt-3 text-center text-xs text-gray-500")}>{pf("customerHint")}</Text>
      {avatarUrl && !disabled ? (
        <TouchableOpacity onPress={clearPhoto} style={twStyle("mt-2")}>
          <Text style={twStyle("text-sm font-medium text-red-600")}>{pf("removePhoto")}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
