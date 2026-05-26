/**
 * Pick image from camera or library for uploads (profile, onboarding, logos, etc.)
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
  mimeType?: string;
  fileSize?: number;
  base64?: string;
}

export type ImagePickLaunchOptions = Pick<
  ImagePicker.ImagePickerOptions,
  | "allowsEditing"
  | "allowsMultipleSelection"
  | "selectionLimit"
  | "quality"
  | "aspect"
  | "base64"
  | "mediaTypes"
>;

const PERMISSION_COPY = {
  photos: {
    title: () => i18n.t("provider.mobile.components.imagePicker.photosAccessTitle"),
    message: () => i18n.t("provider.mobile.components.imagePicker.photosAccessBody"),
  },
  camera: {
    title: () => i18n.t("provider.mobile.components.imagePicker.cameraAccessTitle"),
    message: () => i18n.t("provider.mobile.components.imagePicker.cameraAccessBody"),
  },
};

const DEFAULT_SINGLE_OPTIONS: ImagePickLaunchOptions = {
  mediaTypes: ["images"],
  allowsEditing: true,
  aspect: [1, 1],
  quality: 0.8,
};

function toPickResult(asset: ImagePicker.ImagePickerAsset): PickImageResult {
  return {
    uri: asset.uri,
    width: asset.width,
    height: asset.height,
    fileName: asset.fileName ?? `image-${Date.now()}.jpg`,
    mimeType: asset.mimeType ?? undefined,
    fileSize: typeof asset.fileSize === "number" ? asset.fileSize : undefined,
    base64: asset.base64 ?? undefined,
  };
}

export function useImagePicker() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickFromLibrary = useCallback(
    async (
      launchOptions: ImagePickLaunchOptions = {},
      deferLaunch = false,
    ): Promise<PickImageResult | null> => {
      setLoading(true);
      setError(null);
      try {
        const result = await launchImageLibraryWithPermission(
          { ...DEFAULT_SINGLE_OPTIONS, ...launchOptions },
          {
            title: PERMISSION_COPY.photos.title(),
            message: PERMISSION_COPY.photos.message(),
          },
          { defer: deferLaunch },
        );
        if (!result) {
          setError(i18n.t("provider.mobile.components.imagePicker.permissionPhotosRequired"));
          return null;
        }
        if (result.canceled || !result.assets[0]) return null;
        return toPickResult(result.assets[0]);
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : i18n.t("provider.mobile.components.imagePicker.failedPickImage"),
        );
        return null;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const pickFromCamera = useCallback(
    async (
      launchOptions: ImagePickLaunchOptions = {},
      deferLaunch = false,
    ): Promise<PickImageResult | null> => {
      setLoading(true);
      setError(null);
      try {
        const result = await launchCameraWithPermission(
          { ...DEFAULT_SINGLE_OPTIONS, allowsEditing: true, ...launchOptions },
          {
            title: PERMISSION_COPY.camera.title(),
            message: PERMISSION_COPY.camera.message(),
          },
          { defer: deferLaunch },
        );
        if (!result) {
          setError(i18n.t("provider.mobile.components.imagePicker.permissionCameraRequired"));
          return null;
        }
        if (result.canceled || !result.assets[0]) return null;
        return toPickResult(result.assets[0]);
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : i18n.t("provider.mobile.components.imagePicker.failedTakePhoto"),
        );
        return null;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const pickWithOptions = useCallback(
    async (launchOptions: ImagePickLaunchOptions = {}): Promise<PickImageResult | null> => {
      if (Platform.OS === "web") {
        return pickFromLibrary(launchOptions);
      }
      return new Promise((resolve) => {
        Alert.alert(
          i18n.t("provider.mobile.components.imagePicker.profilePhotoTitle"),
          i18n.t("provider.mobile.components.imagePicker.chooseOption"),
          [
            {
              text: i18n.t("provider.mobile.components.imagePicker.takePhoto"),
              onPress: () => {
                void pickFromCamera(launchOptions, true).then(resolve);
              },
            },
            {
              text: i18n.t("provider.mobile.components.imagePicker.photoLibrary"),
              onPress: () => {
                void pickFromLibrary(launchOptions, true).then(resolve);
              },
            },
            {
              text: i18n.t("provider.mobile.components.imagePicker.cancel"),
              style: "cancel",
              onPress: () => resolve(null),
            },
          ],
        );
      });
    },
    [pickFromCamera, pickFromLibrary],
  );

  /** Multi-select from library only (camera adds one photo at a time). */
  const pickMultipleFromLibrary = useCallback(
    async (launchOptions: ImagePickLaunchOptions = {}): Promise<ImagePicker.ImagePickerAsset[] | null> => {
      setLoading(true);
      setError(null);
      try {
        const result = await launchImageLibraryWithPermission(
          {
            mediaTypes: ["images"],
            allowsMultipleSelection: true,
            quality: 0.85,
            ...launchOptions,
          },
          {
            title: PERMISSION_COPY.photos.title(),
            message: PERMISSION_COPY.photos.message(),
          },
        );
        if (!result) {
          setError(i18n.t("provider.mobile.components.imagePicker.permissionPhotosRequired"));
          return null;
        }
        if (result.canceled || !result.assets?.length) return null;
        return result.assets;
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : i18n.t("provider.mobile.components.imagePicker.failedPickImage"),
        );
        return null;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return {
    pickFromLibrary,
    pickFromCamera,
    pickWithOptions,
    pickMultipleFromLibrary,
    loading,
    error,
  };
}
