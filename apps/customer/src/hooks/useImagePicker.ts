/**
 * Pick image from camera or library for uploads (profile, attachments, etc.)
 */
import { useState, useCallback } from "react";
import { Alert, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { i18n } from "@beautonomi/i18n";
import {
  launchCameraWithPermission,
  launchImageLibraryWithPermission,
} from "@/lib/native-permissions";

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

export type PickSingleLibraryOptions = {
  allowsEditing?: boolean;
  deferLaunch?: boolean;
};

function assetToPickResult(asset: ImagePicker.ImagePickerAsset): PickImageResult {
  return {
    uri: asset.uri,
    width: asset.width,
    height: asset.height,
    fileName: asset.fileName ?? `image-${Date.now()}.jpg`,
    mimeType: asset.mimeType ?? undefined,
    fileSize: typeof asset.fileSize === "number" ? asset.fileSize : undefined,
  };
}

export function useImagePicker() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickFromLibrary = useCallback(async (
    options: PickSingleLibraryOptions = {},
  ): Promise<PickImageResult | null> => {
    const { allowsEditing = true, deferLaunch = false } = options;
    setLoading(true);
    setError(null);
    try {
      const result = await launchImageLibraryWithPermission(
        {
          mediaTypes: ["images"],
          allowsEditing,
          ...(allowsEditing ? { aspect: [1, 1] as [number, number] } : {}),
          quality: 0.85,
        },
        {
          title: i18n.t("customer.mobile.components.imagePicker.photosAccessTitle"),
          message: i18n.t("customer.mobile.components.imagePicker.photosAccessBody"),
        },
        { defer: deferLaunch },
      );
      if (!result) {
        setError(i18n.t("customer.mobile.components.imagePicker.permissionPhotosRequired"));
        return null;
      }
      if (result.canceled || !result.assets?.length) return null;
      return assetToPickResult(result.assets[0]);
    } catch (e) {
      setError(e instanceof Error ? e.message : i18n.t("customer.mobile.components.imagePicker.failedPickImage"));
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  /** Pick several photos at once (no crop) — used for inspiration / attachment galleries. */
  const pickMultipleFromLibrary = useCallback(async (
    maxCount: number,
    deferLaunch = false,
  ): Promise<PickImageResult[]> => {
    if (maxCount <= 0) return [];
    setLoading(true);
    setError(null);
    try {
      const result = await launchImageLibraryWithPermission(
        {
          mediaTypes: ["images"],
          allowsEditing: false,
          allowsMultipleSelection: true,
          selectionLimit: Math.max(1, Math.min(maxCount, 20)),
          quality: 0.85,
        },
        {
          title: i18n.t("customer.mobile.components.imagePicker.photosAccessTitle"),
          message: i18n.t("customer.mobile.components.imagePicker.photosAccessBody"),
        },
        { defer: deferLaunch },
      );
      if (!result) {
        setError(i18n.t("customer.mobile.components.imagePicker.permissionPhotosRequired"));
        return [];
      }
      if (result.canceled || !result.assets?.length) return [];
      return result.assets.map(assetToPickResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : i18n.t("customer.mobile.components.imagePicker.failedPickImage"));
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const pickFromCamera = useCallback(async (
    options: { allowsEditing?: boolean; deferLaunch?: boolean } | boolean = {},
  ): Promise<PickImageResult | null> => {
    const opts =
      typeof options === "boolean" ? { deferLaunch: options } : options;
    const { allowsEditing = true, deferLaunch = false } = opts;
    setLoading(true);
    setError(null);
    try {
      const result = await launchCameraWithPermission(
        {
          allowsEditing,
          ...(allowsEditing ? { aspect: [1, 1] as [number, number] } : {}),
          quality: 0.85,
        },
        {
          title: i18n.t("customer.mobile.components.imagePicker.cameraAccessTitle"),
          message: i18n.t("customer.mobile.components.imagePicker.cameraAccessBody"),
        },
        { defer: deferLaunch },
      );
      if (!result) {
        setError(i18n.t("customer.mobile.components.imagePicker.permissionCameraRequired"));
        return null;
      }
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
      return pickFromLibrary({ allowsEditing: false });
    }
    return new Promise((resolve) => {
      Alert.alert(
        i18n.t("customer.mobile.components.imagePicker.profilePhotoTitle"),
        i18n.t("customer.mobile.components.imagePicker.chooseOption"),
        [
          {
            text: i18n.t("customer.mobile.components.imagePicker.takePhoto"),
            onPress: () => {
              void pickFromCamera(true).then(resolve);
            },
          },
          {
            text: i18n.t("customer.mobile.components.imagePicker.photoLibrary"),
            onPress: () => {
              void pickFromLibrary({ deferLaunch: true }).then(resolve);
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
    pickMultipleFromLibrary,
    pickFromCamera,
    pickWithOptions,
    loading,
    error,
  };
}
