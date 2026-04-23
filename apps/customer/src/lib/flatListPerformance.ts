import { Platform } from "react-native";

const ANDROID_CLIP = Platform.OS === "android";

/**
 * Customer-perf 2026-04: conservative defaults for long vertical lists with
 * images / rich rows. Smaller `windowSize` than RN default (~21) cuts memory
 * and main-thread work; `removeClippedSubviews` is Android-only to avoid
 * iOS clipping glitches with shadows/overlays.
 */
export const verticalFlatListPerf = {
  windowSize: 8,
  maxToRenderPerBatch: 8,
  initialNumToRender: 8,
  updateCellsBatchingPeriod: 50,
  removeClippedSubviews: ANDROID_CLIP,
} as const;

/** Message threads — slightly more runway for uneven bubble heights */
export const chatFlatListPerf = {
  windowSize: 10,
  maxToRenderPerBatch: 10,
  initialNumToRender: 12,
  updateCellsBatchingPeriod: 50,
  removeClippedSubviews: ANDROID_CLIP,
} as const;

export const horizontalFlatListPerf = {
  windowSize: 5,
  maxToRenderPerBatch: 12,
  initialNumToRender: 12,
  updateCellsBatchingPeriod: 40,
  removeClippedSubviews: ANDROID_CLIP,
} as const;
