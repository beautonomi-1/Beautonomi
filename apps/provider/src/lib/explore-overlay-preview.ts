/**
 * Caption preview math mirrored from the server burns:
 * - photo: processExploreDisplayJpeg / buildTextOverlaySvg (apps/web brand-display-image.ts)
 * - video: enqueue-video-processing scale filter + buildVideoDrawtextChain (explore-rendobar-overlays.ts)
 * Keep in sync; parity is asserted in apps/web explore-overlay-preview.test.ts.
 */

export const EXPLORE_PHOTO_DISPLAY_MAX = 1200;
export const EXPLORE_PHOTO_WATERMARK_BAND_PX = 40;
export const EXPLORE_PHOTO_BOX_PAD_PX = 8;
export const EXPLORE_VIDEO_ENCODE_MAX = 1080;
export const EXPLORE_VIDEO_BOX_BORDER_PX = 8;
export const EXPLORE_OVERLAY_FONT_NORM_MIN = 0.02;
export const EXPLORE_OVERLAY_FONT_NORM_MAX = 0.2;
export const EXPLORE_OVERLAY_CENTER_MIN = 0.05;
export const EXPLORE_OVERLAY_CENTER_MAX = 0.95;

export type ExploreOverlayMediaKind = "image" | "video";

/** Sharp `.resize(1200, 1200, { fit: "inside", withoutEnlargement: true })` output size. */
export function explorePhotoBurnFrame(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, EXPLORE_PHOTO_DISPLAY_MAX / width, EXPLORE_PHOTO_DISPLAY_MAX / height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function evenRound(n: number): number {
  return Math.max(2, Math.round(n / 2) * 2);
}

/** ffmpeg `scale='if(gt(iw,ih),min(1080,iw),-2)':'if(gt(iw,ih),-2,min(1080,ih))'` output size. */
export function exploreVideoBurnFrame(width: number, height: number): { width: number; height: number } {
  if (width > height) {
    const w = Math.min(EXPLORE_VIDEO_ENCODE_MAX, width);
    return { width: w, height: evenRound((height * w) / width) };
  }
  const h = Math.min(EXPLORE_VIDEO_ENCODE_MAX, height);
  return { width: evenRound((width * h) / height), height: h };
}

/** buildTextOverlaySvg font size on the Sharp output frame. */
export function photoOverlayFontPx(frameWidth: number, fontSizeNorm: number): number {
  "worklet";
  return Math.round(Math.max(12, Math.min(frameWidth * fontSizeNorm, 72)));
}

/** buildVideoDrawtextChain font size (absolute 1080 basis, not the frame width). */
export function videoOverlayFontPx(fontSizeNorm: number): number {
  "worklet";
  return Math.max(16, Math.round(EXPLORE_VIDEO_ENCODE_MAX * fontSizeNorm));
}

export function photoOverlayBoxSize(
  frameWidth: number,
  fontPx: number,
  textLength: number,
): { width: number; height: number } {
  "worklet";
  const pad = EXPLORE_PHOTO_BOX_PAD_PX;
  const width = Math.min(frameWidth - pad * 2, Math.max(fontPx * textLength * 0.55, 40));
  return { width, height: fontPx + pad * 2 };
}

/** Box rect in frame pixels, clamped inside the frame exactly like buildTextOverlaySvg. */
export function photoOverlayFrameBox(
  xNorm: number,
  yNorm: number,
  frameWidth: number,
  frameHeight: number,
  fontSizeNorm: number,
  text: string,
): { x: number; y: number; width: number; height: number; fontPx: number } {
  "worklet";
  const trimmed = text.trim().slice(0, 80);
  const fontPx = photoOverlayFontPx(frameWidth, fontSizeNorm);
  const box = photoOverlayBoxSize(frameWidth, fontPx, trimmed.length);
  const cx = Math.round(xNorm * frameWidth);
  const cy = Math.round(yNorm * frameHeight);
  const x = Math.max(0, Math.min(frameWidth - box.width, cx - box.width / 2));
  const y = Math.max(0, Math.min(frameHeight - box.height, cy - box.height / 2));
  return { x, y, width: box.width, height: box.height, fontPx };
}

export function clampOverlayFontSizeNorm(
  next: number,
  kind: ExploreOverlayMediaKind,
  frameWidth: number,
): number {
  "worklet";
  const { min, max } = overlayFontNormBounds(kind, frameWidth);
  return Math.min(max, Math.max(min, next));
}

/** Pinch bounds: never request a size the burn clamp would grow or shrink. */
export function overlayFontNormBounds(
  kind: ExploreOverlayMediaKind,
  frameWidth: number,
): { min: number; max: number } {
  "worklet";
  if (kind === "video") {
    return {
      min: Math.max(EXPLORE_OVERLAY_FONT_NORM_MIN, 16 / EXPLORE_VIDEO_ENCODE_MAX),
      max: EXPLORE_OVERLAY_FONT_NORM_MAX,
    };
  }
  const w = Math.max(frameWidth, 1);
  const max = Math.min(EXPLORE_OVERLAY_FONT_NORM_MAX, 72 / w);
  const min = Math.min(max, Math.max(EXPLORE_OVERLAY_FONT_NORM_MIN, 12 / w));
  return { min, max };
}

/** Highest normalized center y that keeps the photo box bottom above the watermark band. */
export function photoOverlayMaxCenterY(boxHeightPx: number, frameHeight: number): number {
  "worklet";
  const maxCenter = (frameHeight - EXPLORE_PHOTO_WATERMARK_BAND_PX - boxHeightPx / 2) / frameHeight;
  return Math.max(EXPLORE_OVERLAY_CENTER_MIN, Math.min(EXPLORE_OVERLAY_CENTER_MAX, maxCenter));
}

export function clampPhotoOverlayCenterY(y: number, boxHeightPx: number, frameHeight: number): number {
  "worklet";
  return Math.min(photoOverlayMaxCenterY(boxHeightPx, frameHeight), Math.max(EXPLORE_OVERLAY_CENTER_MIN, y));
}

/** Top-left of a video label (measured on screen) centered on the normalized point, like `w*x-text_w/2`. */
export function videoOverlayStageOrigin(
  xNorm: number,
  yNorm: number,
  stageW: number,
  stageH: number,
  labelW: number,
  labelH: number,
): { left: number; top: number } {
  return { left: xNorm * stageW - labelW / 2, top: yNorm * stageH - labelH / 2 };
}

export function computeExploreOverlayStageSize(
  frameWidth: number,
  frameHeight: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  const aspect = frameWidth / frameHeight;
  let width = maxWidth;
  let height = width / aspect;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * aspect;
  }
  return { width: Math.round(width), height: Math.round(height) };
}
