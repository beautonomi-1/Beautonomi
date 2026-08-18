/**
 * Pick image from camera or library for uploads (profile, onboarding, logos, etc.)
 */
import { useState, useCallback } from "react";
import { Alert, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { pm } from "@/lib/provider-translate";
import {
  launchCameraWithPermission,
  launchImageLibraryWithPermission,
  PERMISSION_COPY as NATIVE_PERMISSION_COPY,
} from "@/lib/native-permissions";
import { useImageCropper } from "@/components/image-crop";
import { DEFAULT_ASPECT } from "@/components/image-crop/types";

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
> & {
  lockAspect?: boolean;
};

const PERMISSION_COPY = {
  photos: {
    title: () =>
      pm("components.imagePicker.photosAccessTitle", undefined, NATIVE_PERMISSION_COPY.photosChoose.title),
    message: () =>
      pm(
        "components.imagePicker.photosAccessBody",
        undefined,
        NATIVE_PERMISSION_COPY.photosChoose.message,
      ),
  },
  camera: {
    title: () =>
      pm("components.imagePicker.cameraAccessTitle", undefined, NATIVE_PERMISSION_COPY.cameraPhoto.title),
    message: () =>
      pm(
        "components.imagePicker.cameraAccessBody",
        undefined,
        NATIVE_PERMISSION_COPY.cameraPhoto.message,
      ),
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
  const cropper = useImageCropper();

  const maybeCropAsset = useCallback(
    async (
      asset: ImagePicker.ImagePickerAsset,
      launchOptions: ImagePickLaunchOptions,
    ): Promise<PickImageResult | null> => {
      const allowsEditing = launchOptions.allowsEditing ?? DEFAULT_SINGLE_OPTIONS.allowsEditing ?? true;
      if (!allowsEditing || Platform.OS === "web") {
        return toPickResult(asset);
      }

      const cropped = await cropper.open({
        uri: asset.uri,
        width: asset.width,
        height: asset.height,
        aspect: launchOptions.aspect ?? DEFAULT_SINGLE_OPTIONS.aspect ?? DEFAULT_ASPECT,
        lockAspect: launchOptions.lockAspect,
        quality: launchOptions.quality ?? DEFAULT_SINGLE_OPTIONS.quality,
        fileName: asset.fileName ?? undefined,
        includeBase64: launchOptions.base64 === true,
      });

      return cropped;
    },
    [cropper],
  );

  const pickFromLibrary = useCallback(
    async (
      launchOptions: ImagePickLaunchOptions = {},
      deferLaunch = false,
    ): Promise<PickImageResult | null> => {
      setLoading(true);
      setError(null);
      try {
        const merged = { ...DEFAULT_SINGLE_OPTIONS, ...launchOptions };
        const result = await launchImageLibraryWithPermission(
          {
            mediaTypes: merged.mediaTypes,
            allowsEditing: false,
            quality: merged.quality,
            base64: merged.base64,
          },
          {
            title: PERMISSION_COPY.photos.title(),
            message: PERMISSION_COPY.photos.message(),
          },
          { defer: deferLaunch },
        );
        if (!result) {
          setError(
            pm(
              "components.imagePicker.permissionPhotosRequired",
              undefined,
              "Permission to access photos is required",
            ),
          );
          return null;
        }
        if (result.canceled || !result.assets[0]) return null;
        return maybeCropAsset(result.assets[0], merged);
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : pm("components.imagePicker.failedPickImage", undefined, "Failed to pick image"),
        );
        return null;
      } finally {
        setLoading(false);
      }
    },
    [maybeCropAsset],
  );

  const pickFromCamera = useCallback(
    async (
      launchOptions: ImagePickLaunchOptions = {},
      deferLaunch = false,
    ): Promise<PickImageResult | null> => {
      setLoading(true);
      setError(null);
      try {
        const merged = { ...DEFAULT_SINGLE_OPTIONS, ...launchOptions };
        const result = await launchCameraWithPermission(
          {
            allowsEditing: false,
            quality: merged.quality,
            base64: merged.base64,
          },
          {
            title: PERMISSION_COPY.camera.title(),
            message: PERMISSION_COPY.camera.message(),
          },
          { defer: deferLaunch },
        );
        if (!result) {
          setError(
            pm(
              "components.imagePicker.permissionCameraRequired",
              undefined,
              "Camera permission is required",
            ),
          );
          return null;
        }
        if (result.canceled || !result.assets[0]) return null;
        return maybeCropAsset(result.assets[0], merged);
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : pm("components.imagePicker.failedTakePhoto", undefined, "Failed to take photo"),
        );
        return null;
      } finally {
        setLoading(false);
      }
    },
    [maybeCropAsset],
  );

  const pickWithOptions = useCallback(
    async (launchOptions: ImagePickLaunchOptions = {}): Promise<PickImageResult | null> => {
      if (Platform.OS === "web") {
        return pickFromLibrary({ ...launchOptions, allowsEditing: false });
      }
      return new Promise((resolve) => {
        Alert.alert(
          pm("components.imagePicker.profilePhotoTitle", undefined, "Profile photo"),
          pm("components.imagePicker.chooseOption", undefined, "Choose an option"),
          [
            {
              text: pm("components.imagePicker.takePhoto", undefined, "Take photo"),
              onPress: () => {
                void pickFromCamera(launchOptions, true).then(resolve);
              },
            },
            {
              text: pm("components.imagePicker.photoLibrary", undefined, "Photo library"),
              onPress: () => {
                void pickFromLibrary(launchOptions, true).then(resolve);
              },
            },
            {
              text: pm("components.imagePicker.cancel", undefined, "Cancel"),
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
            allowsEditing: false,
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
          setError(
            pm(
              "components.imagePicker.permissionPhotosRequired",
              undefined,
              "Permission to access photos is required",
            ),
          );
          return null;
        }
        if (result.canceled || !result.assets?.length) return null;
        return result.assets;
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : pm("components.imagePicker.failedPickImage", undefined, "Failed to pick image"),
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
