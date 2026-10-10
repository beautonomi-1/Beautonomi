import * as FileSystem from "expo-file-system/legacy";

/**
 * PUT a local asset (file:// or content:// from picker/camera) to a signed upload URL.
 * Uses fetch+blob first (works for many RN URIs); falls back to expo-file-system uploadAsync.
 */
export async function putLocalUriToSignedUrl(
  uri: string,
  signedUrl: string,
  mimeType: string,
): Promise<boolean> {
  try {
    const localRes = await fetch(uri);
    if (!localRes.ok) throw new Error("local_read_failed");
    const blob = await localRes.blob();
    const put = await fetch(signedUrl, {
      method: "PUT",
      body: blob,
      headers: { "Content-Type": mimeType },
    });
    if (put.ok) return true;
  } catch {
    // fall through to FileSystem
  }

  try {
    const result = await FileSystem.uploadAsync(signedUrl, uri, {
      httpMethod: "PUT",
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: { "Content-Type": mimeType },
    });
    return result.status >= 200 && result.status < 300;
  } catch {
    return false;
  }
}

/** Best-effort byte size for Expo picker/camera URIs (upload caps). */
export async function localUriSizeBytes(uri: string): Promise<number | undefined> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && "size" in info && typeof info.size === "number" && info.size > 0) {
      return info.size;
    }
  } catch {
    // ignore
  }
  return undefined;
}
