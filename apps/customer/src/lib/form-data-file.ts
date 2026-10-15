import { Platform } from "react-native";
import { File } from "expo-file-system";

export type UploadFilePart = {
  uri: string;
  name: string;
  type: string;
};

/**
 * Append a picked/captured file to FormData in a way compatible with Expo 57's
 * global `fetch` (expo/fetch), which only serializes string, Blob, or `bytes()` parts —
 * not React Native's legacy `{ uri, name, type }` objects.
 *
 * Native uploads use `Blob` + explicit `type` so API routes (e.g. custom-request
 * inspiration photos) receive a valid Content-Type in multipart parts.
 */
export async function appendUploadFile(
  formData: FormData,
  fieldName: string,
  file: UploadFilePart,
): Promise<void> {
  if (Platform.OS === "web") {
    const blob = await (await fetch(file.uri)).blob();
    const typed =
      file.type && (!blob.type || blob.type === "application/octet-stream")
        ? new Blob([blob], { type: file.type })
        : blob;
    formData.append(fieldName, typed, file.name);
    return;
  }

  const src = new File(file.uri);
  const bytes = await src.bytes();
  const mime = file.type.trim() || src.type || "application/octet-stream";
  formData.append(fieldName, new Blob([bytes], { type: mime }) as unknown as Blob, file.name);
}
