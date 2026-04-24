/**
 * Pick image from camera or library for uploads (profile, attachments, etc.)
 */
import { useState, useCallback } from "react";
import * as ImagePicker from "expo-image-picker";

export interface PickImageResult {
  uri: string;
  width: number;
  height: number;
  fileName?: string;
  /** From expo-image-picker asset when available (helps uploads set correct Content-Type). */
  mimeType?: string;
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
        setError("Permission to access photos is required");
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
      };
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to pick image");
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
        setError("Camera permission is required");
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
      };
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to take photo");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const pickWithOptions = useCallback(async (): Promise<PickImageResult | null> => {
    // On mobile we could show an action sheet; for now default to library
    return pickFromLibrary();
  }, [pickFromLibrary]);

  return {
    pickFromLibrary,
    pickFromCamera,
    pickWithOptions,
    loading,
    error,
  };
}
