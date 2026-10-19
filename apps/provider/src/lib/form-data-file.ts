import { Platform } from "react-native";
import { File } from "expo-file-system";
import * as LegacyFileSystem from "expo-file-system/legacy";

export type UploadFilePart = {
  uri: string;
  name: string;
  type: string;
};

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function readUploadBytes(uri: string): Promise<Uint8Array> {
  try {
    const src = new File(uri);
    return await src.bytes();
  } catch {
    const base64 = await LegacyFileSystem.readAsStringAsync(uri, {
      encoding: LegacyFileSystem.EncodingType.Base64,
    });
    return base64ToUint8Array(base64);
  }
}

/**
 * Append a picked/captured file to FormData in a way compatible with Expo 57's
 * global `fetch` (expo/fetch), which serializes string, Blob, or `bytes()` parts.
 */
export async function appendUploadFile(
  formData: FormData,
  fieldName: string,
  file: UploadFilePart,
): Promise<void> {
  const safeName = file.name.trim() || "upload";
  if (Platform.OS === "web") {
    const blob = await (await fetch(file.uri)).blob();
    const mime = file.type.trim() || blob.type || "application/octet-stream";
    const typed =
      !blob.type || blob.type === "application/octet-stream"
        ? new Blob([blob], { type: mime })
        : blob;
    formData.append(fieldName, typed, safeName);
    return;
  }

  const bytes = await readUploadBytes(file.uri);
  const mime =
    file.type.trim() ||
    (() => {
      try {
        return new File(file.uri).type;
      } catch {
        return "application/octet-stream";
      }
    })() ||
    "application/octet-stream";

  const useRnFetch =
    process.env.EXPO_PUBLIC_USE_RN_FETCH === "1" ||
    process.env.EXPO_PUBLIC_USE_RN_FETCH === "true";

  if (useRnFetch) {
    formData.append(fieldName, { uri: file.uri, name: safeName, type: mime } as unknown as Blob);
    return;
  }

  formData.append(
    fieldName,
    {
      uri: file.uri,
      name: safeName,
      type: mime,
      bytes: async () => bytes,
    } as unknown as Blob,
    safeName,
  );
}
