import type { ExploreMediaSlideMeta } from "@/lib/explore/media-types";
import {
  defaultExploreVideoTrim,
  sanitizeExploreVideoTrim,
  trimWindowDurationMs,
} from "@/lib/explore/explore-video-trim";

export function resolveVideoEncodeTrim(params: {
  slide: ExploreMediaSlideMeta | undefined;
  sourceDurationSec: number | null | undefined;
  platformMaxMs: number;
}): {
  trimStartSec: number;
  outputDurationSec: number | null;
  storedDurationMs: number;
} {
  const { slide, sourceDurationSec, platformMaxMs } = params;
  const sourceMs =
    sourceDurationSec != null && Number.isFinite(sourceDurationSec)
      ? Math.round(sourceDurationSec * 1000)
      : slide?.source_duration_ms ?? platformMaxMs;

  const trim =
    sanitizeExploreVideoTrim(sourceMs, platformMaxMs, slide) ??
    defaultExploreVideoTrim(sourceMs, platformMaxMs);

  const segmentMs = trimWindowDurationMs(trim);
  const trimStartSec = trim.trim_start_ms / 1000;
  const outputDurationSec = segmentMs / 1000;

  const needsCut =
    trim.trim_start_ms > 0 ||
    segmentMs < sourceMs - 50 ||
    sourceMs > platformMaxMs;

  return {
    trimStartSec,
    outputDurationSec: needsCut ? outputDurationSec : null,
    storedDurationMs: segmentMs,
  };
}
