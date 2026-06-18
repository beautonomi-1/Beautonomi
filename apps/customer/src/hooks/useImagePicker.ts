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
import { useImageCropper } from "@/components/image-crop";
import { DEFAULT_ASPECT } from "@/components/image-crop/types";

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
  aspect?: [number, number];
  lockAspect?: boolean;
  quality?: number;
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
  const cropper = useImageCropper();

  const maybeCropAsset = useCallback(
    async (
      asset: ImagePicker.ImagePickerAsset,
      options: PickSingleLibraryOptions,
    ): Promise<PickImageResult | null> => {
      const allowsEditing = options.allowsEditing ?? true;
      if (!allowsEditing || Platform.OS === "web") {
        return assetToPickResult(asset);
      }

      const cropped = await cropper.open({
        uri: asset.uri,
        width: asset.width,
        height: asset.height,
        aspect: options.aspect ?? DEFAULT_ASPECT,
        lockAspect: options.lockAspect,
        quality: options.quality ?? 0.85,
        fileName: asset.fileName ?? undefined,
      });

      return cropped;
    },
    [cropper],
  );

  const pickFromLibrary = useCallback(async (
    options: PickSingleLibraryOptions = {},
  ): Promise<PickImageResult | null> => {
    const { deferLaunch = false } = options;
    setLoading(true);
    setError(null);
    try {
      const result = await launchImageLibraryWithPermission(
        {
          mediaTypes: ["images"],
          allowsEditing: false,
          quality: options.quality ?? 0.85,
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
      return maybeCropAsset(result.assets[0], options);
    } catch (e) {
      setError(e instanceof Error ? e.message : i18n.t("customer.mobile.components.imagePicker.failedPickImage"));
      return null;
    } finally {
      setLoading(false);
    }
  }, [maybeCropAsset]);

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
    options: PickSingleLibraryOptions | boolean = {},
  ): Promise<PickImageResult | null> => {
    const opts =
      typeof options === "boolean" ? { deferLaunch: options } : options;
    const { deferLaunch = false } = opts;
    setLoading(true);
    setError(null);
    try {
      const result = await launchCameraWithPermission(
        {
          allowsEditing: false,
          quality: opts.quality ?? 0.85,
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
      if (result.canceled || !result.assets?.[0]) return null;
      return maybeCropAsset(result.assets[0], opts);
    } catch (e) {
      setError(e instanceof Error ? e.message : i18n.t("customer.mobile.components.imagePicker.failedTakePhoto"));
      return null;
    } finally {
      setLoading(false);
    }
  }, [maybeCropAsset]);

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
              void pickFromCamera({ deferLaunch: true }).then(resolve);
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
