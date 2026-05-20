/**
 * Pick image from camera or library for uploads (profile, attachments, etc.)
 */
import { useState, useCallback } from "react";
import { Alert, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { i18n } from "@beautonomi/i18n";

export interface PickImageResult {
  uri: string;
  width: number;
  height: number;
  fileName?: string;
  /** From expo-image-picker asset when available (helps uploads set correct Content-Type). */
  mimeType?: string;
  /** Asset byte size when expo-image-picker exposes it; lets callers block oversized uploads pre-flight. */
  fileSize?: number;
}

export function useImagePicker() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickFromLibrary = useCallback(async (): Promise<PickImageResult | null> => {
    setLoading(true);
    setError(null);
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        setError(i18n.t("customer.mobile.components.imagePicker.permissionPhotosRequired"));
        Alert.alert(
          i18n.t("customer.mobile.components.imagePicker.photosAccessTitle"),
          i18n.t("customer.mobile.components.imagePicker.photosAccessBody"),
          [{ text: i18n.t("customer.mobile.components.imagePicker.ok") }],
        );
        return null;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result.canceled) return null;
      const asset = result.assets[0];
      return {
        uri: asset.uri,
        width: asset.width,
        height: asset.height,
        fileName: asset.fileName ?? `image-${Date.now()}.jpg`,
        mimeType: asset.mimeType ?? undefined,
        fileSize: typeof asset.fileSize === "number" ? asset.fileSize : undefined,
      };
    } catch (e) {
      setError(e instanceof Error ? e.message : i18n.t("customer.mobile.components.imagePicker.failedPickImage"));
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const pickFromCamera = useCallback(async (): Promise<PickImageResult | null> => {
    setLoading(true);
    setError(null);
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        setError(i18n.t("customer.mobile.components.imagePicker.permissionCameraRequired"));
        Alert.alert(
          i18n.t("customer.mobile.components.imagePicker.cameraAccessTitle"),
          i18n.t("customer.mobile.components.imagePicker.cameraAccessBody"),
          [{ text: i18n.t("customer.mobile.components.imagePicker.ok") }],
        );
        return null;
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result.canceled) return null;
      const asset = result.assets[0];
      return {
        uri: asset.uri,
        width: asset.width,
        height: asset.height,
        fileName: asset.fileName ?? `camera-${Date.now()}.jpg`,
        mimeType: asset.mimeType ?? undefined,
        fileSize: typeof asset.fileSize === "number" ? asset.fileSize : undefined,
      };
    } catch (e) {
      setError(e instanceof Error ? e.message : i18n.t("customer.mobile.components.imagePicker.failedTakePhoto"));
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const pickWithOptions = useCallback(async (): Promise<PickImageResult | null> => {
    if (Platform.OS === "web") {
      return pickFromLibrary();
    }
    return new Promise((resolve) => {
      Alert.alert(
        i18n.t("customer.mobile.components.imagePicker.profilePhotoTitle"),
        i18n.t("customer.mobile.components.imagePicker.chooseOption"),
        [
          {
            text: i18n.t("customer.mobile.components.imagePicker.takePhoto"),
            onPress: () => {
              void pickFromCamera().then(resolve);
            },
          },
          {
            text: i18n.t("customer.mobile.components.imagePicker.photoLibrary"),
            onPress: () => {
              void pickFromLibrary().then(resolve);
            },
          },
          {
            text: i18n.t("customer.mobile.components.imagePicker.cancel"),
            style: "cancel",
            onPress: () => resolve(null),
          },
        ],
      );
    });
  }, [pickFromCamera, pickFromLibrary]);

  return {
    pickFromLibrary,
    pickFromCamera,
    pickWithOptions,
    loading,
    error,
  };
}
