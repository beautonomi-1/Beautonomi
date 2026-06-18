import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import type { CropResult, CropTransform } from "./types";
import { DEFAULT_OUTPUT_MAX_DIMENSION } from "./types";

export function computeCropFrameSize(
  viewportWidth: number,
  viewportHeight: number,
  aspect: [number, number] | null,
  padding = 24,
): { width: number; height: number } {
  const maxW = Math.max(120, viewportWidth - padding * 2);
  const maxH = Math.max(120, viewportHeight - padding * 2);

  if (!aspect) {
    return { width: maxW, height: maxH };
  }

  const [aspectW, aspectH] = aspect;
  const ratio = aspectW / aspectH;
  let width = maxW;
  let height = width / ratio;
  if (height > maxH) {
    height = maxH;
    width = height * ratio;
  }
  return { width, height };
}

export function computeFitScale(
  imageWidth: number,
  imageHeight: number,
  cropFrameWidth: number,
  cropFrameHeight: number,
): number {
  return Math.max(cropFrameWidth / imageWidth, cropFrameHeight / imageHeight);
}

export function computeCropRect(params: {
  imageWidth: number;
  imageHeight: number;
  cropFrameWidth: number;
  cropFrameHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  transform: CropTransform;
}): { originX: number; originY: number; width: number; height: number } {
  const {
    imageWidth,
    imageHeight,
    cropFrameWidth,
    cropFrameHeight,
    viewportWidth,
    viewportHeight,
    transform,
  } = params;

  const fitScale = computeFitScale(imageWidth, imageHeight, cropFrameWidth, cropFrameHeight);
  const displayedW = imageWidth * fitScale;
  const displayedH = imageHeight * fitScale;
  const scaledW = displayedW * transform.scale;
  const scaledH = displayedH * transform.scale;

  const centerX = viewportWidth / 2 + transform.translateX;
  const centerY = viewportHeight / 2 + transform.translateY;
  const imageLeft = centerX - scaledW / 2;
  const imageTop = centerY - scaledH / 2;

  const cropLeft = (viewportWidth - cropFrameWidth) / 2;
  const cropTop = (viewportHeight - cropFrameHeight) / 2;

  const originX = ((cropLeft - imageLeft) / scaledW) * imageWidth;
  const originY = ((cropTop - imageTop) / scaledH) * imageHeight;
  const width = (cropFrameWidth / scaledW) * imageWidth;
  const height = (cropFrameHeight / scaledH) * imageHeight;

  const clampedOriginX = Math.max(0, Math.min(originX, imageWidth - 1));
  const clampedOriginY = Math.max(0, Math.min(originY, imageHeight - 1));
  const clampedWidth = Math.max(1, Math.min(width, imageWidth - clampedOriginX));
  const clampedHeight = Math.max(1, Math.min(height, imageHeight - clampedOriginY));

  return {
    originX: Math.round(clampedOriginX),
    originY: Math.round(clampedOriginY),
    width: Math.round(clampedWidth),
    height: Math.round(clampedHeight),
  };
}

export async function rotateImageUri(uri: string): Promise<{
  uri: string;
  width: number;
  height: number;
}> {
  const result = await ImageManipulator.manipulateAsync(uri, [{ rotate: 90 }], {
    compress: 1,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return { uri: result.uri, width: result.width, height: result.height };
}

export async function cropImageFromTransform(params: {
  uri: string;
  imageWidth: number;
  imageHeight: number;
  cropFrameWidth: number;
  cropFrameHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  transform: CropTransform;
  quality?: number;
  outputMaxDimension?: number;
  fileName?: string;
  includeBase64?: boolean;
}): Promise<CropResult> {
  const crop = computeCropRect(params);
  const actions: ImageManipulator.Action[] = [{ crop }];

  const maxDim = params.outputMaxDimension ?? DEFAULT_OUTPUT_MAX_DIMENSION;
  const longest = Math.max(crop.width, crop.height);
  if (longest > maxDim) {
    const ratio = maxDim / longest;
    actions.push({
      resize: {
        width: Math.max(1, Math.round(crop.width * ratio)),
        height: Math.max(1, Math.round(crop.height * ratio)),
      },
    });
  }

  const result = await ImageManipulator.manipulateAsync(params.uri, actions, {
    compress: params.quality ?? 0.85,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: params.includeBase64 === true,
  });

  let fileSize: number | undefined;
  try {
    const info = await FileSystem.getInfoAsync(result.uri);
    if (info.exists && "size" in info && typeof info.size === "number") {
      fileSize = info.size;
    }
  } catch {
    /* optional metadata */
  }

  return {
    uri: result.uri,
    width: result.width,
    height: result.height,
    fileName: params.fileName ?? `cropped-${Date.now()}.jpg`,
    mimeType: "image/jpeg",
    fileSize,
    base64: result.base64 ?? undefined,
  };
}
