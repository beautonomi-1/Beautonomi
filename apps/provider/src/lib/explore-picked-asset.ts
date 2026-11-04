import { localUriSizeBytes } from "@/lib/explore-upload-uri";

export type PickedAsset = {
  uri: string;
  mimeType?: string;
  fileName?: string;
  isVideo?: boolean;
  fileSize?: number;
  source_duration_ms?: number;
  duration_ms?: number;
  trim_start_ms?: number;
  trim_end_ms?: number;
};

export type ExploreUploadCaps = {
  max_duration_ms?: number;
  max_video_bytes?: number;
  max_image_bytes?: number;
};

export function isVideoAsset(asset: PickedAsset): boolean {
  return asset.isVideo === true || (asset.mimeType?.startsWith("video/") ?? false);
}

export function splitPickedImageVideo(assets: PickedAsset[]) {
  const images: PickedAsset[] = [];
  const videos: PickedAsset[] = [];
  for (const a of assets) {
    if (isVideoAsset(a)) videos.push(a);
    else images.push(a);
  }
  return { images, videos };
}

export function mapPickerAsset(a: {
  uri: string;
  type?: string | null;
  mimeType?: string | null;
  fileName?: string | null;
  duration?: number | null;
  fileSize?: number;
}): PickedAsset {
  const isVideo = a.type === "video" || a.type === "pairedVideo" || (a.mimeType?.startsWith("video/") ?? false);
  const durationMs =
    typeof a.duration === "number" && Number.isFinite(a.duration) && a.duration > 0
      ? Math.round(a.duration)
      : undefined;
  return {
    uri: a.uri,
    mimeType: a.mimeType ?? (isVideo ? "video/mp4" : "image/jpeg"),
    fileName: a.fileName ?? (isVideo ? "video.mp4" : "image.jpg"),
    isVideo,
    fileSize: typeof a.fileSize === "number" ? a.fileSize : undefined,
    ...(durationMs != null ? { source_duration_ms: durationMs } : {}),
  };
}

export function mapCameraCaptureToAsset(c: {
  uri: string;
  mimeType: string;
  fileName: string;
  isVideo: boolean;
  source_duration_ms?: number;
}): PickedAsset {
  return {
    uri: c.uri,
    mimeType: c.mimeType,
    fileName: c.fileName,
    isVideo: c.isVideo,
    ...(c.source_duration_ms != null ? { source_duration_ms: c.source_duration_ms } : {}),
  };
}

export type ValidatePickedResult = { ok: true } | { ok: false; reason: "tooLarge" };

export async function validatePickedAssetForExplore(
  asset: PickedAsset,
  caps: ExploreUploadCaps,
): Promise<ValidatePickedResult> {
  const video = isVideoAsset(asset);
  let sizeBytes = asset.fileSize ?? 0;
  if (sizeBytes <= 0) {
    const probed = await localUriSizeBytes(asset.uri);
    if (probed != null) sizeBytes = probed;
  }
  if (video) {
    const max = caps.max_video_bytes;
    if (max != null && sizeBytes > max) return { ok: false, reason: "tooLarge" };
  } else {
    const max = caps.max_image_bytes;
    if (max != null && sizeBytes > max) return { ok: false, reason: "tooLarge" };
  }
  return { ok: true };
}
