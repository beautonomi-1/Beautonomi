import type { PickedAsset } from "@/lib/explore-picked-asset";
import { isVideoAsset } from "@/lib/explore-picked-asset";
import {
  explorePhotoBurnFrame,
  exploreVideoBurnFrame,
  type ExploreOverlayMediaKind,
} from "@/lib/explore-overlay-preview";

export type ExploreOverlayFrame = {
  frameWidth: number;
  frameHeight: number;
  mediaKind: ExploreOverlayMediaKind;
  /** False while a photo has not reported its decoded size yet. */
  known: boolean;
};

const DEFAULT_VIDEO_SOURCE = { width: 1080, height: 1920 };

function positiveDims(w: unknown, h: unknown): { width: number; height: number } | null {
  if (typeof w === "number" && w > 0 && typeof h === "number" && h > 0) return { width: w, height: h };
  return null;
}

function videoFrame(source: { width: number; height: number } | null): ExploreOverlayFrame {
  const f = exploreVideoBurnFrame((source ?? DEFAULT_VIDEO_SOURCE).width, (source ?? DEFAULT_VIDEO_SOURCE).height);
  return { frameWidth: f.width, frameHeight: f.height, mediaKind: "video", known: true };
}

function photoFrame(source: { width: number; height: number } | null): ExploreOverlayFrame {
  if (!source) {
    return { frameWidth: 1200, frameHeight: 1200, mediaKind: "image", known: false };
  }
  const f = explorePhotoBurnFrame(source.width, source.height);
  return { frameWidth: f.width, frameHeight: f.height, mediaKind: "image", known: true };
}

/**
 * Local asset. Photos use the decoded (upright) size only — picker width/height are not swapped
 * from EXIF and are not trusted for orientation.
 */
export function exploreFrameForAsset(
  asset: PickedAsset,
  decodedPhoto?: { width: number; height: number } | null,
): ExploreOverlayFrame {
  if (isVideoAsset(asset)) return videoFrame(positiveDims(asset.width, asset.height));
  return photoFrame(decodedPhoto ? positiveDims(decodedPhoto.width, decodedPhoto.height) : null);
}

/** Already uploaded slide: photo media_meta is the Sharp output; video media_meta is the source. */
export function exploreFrameFromMediaMetaRow(
  row: { width?: number | null; height?: number | null },
  isVideo: boolean,
  decodedPhoto?: { width: number; height: number } | null,
): ExploreOverlayFrame {
  const meta = positiveDims(row.width, row.height);
  if (isVideo) return videoFrame(meta);
  return photoFrame(meta ?? (decodedPhoto ? positiveDims(decodedPhoto.width, decodedPhoto.height) : null));
}
