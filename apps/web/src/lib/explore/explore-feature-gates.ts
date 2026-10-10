import {
  getFeatureFlagMetadata,
  isFeatureEnabledServer,
} from "@/lib/server/feature-flags";
import { FEATURE_FLAG_KEYS } from "@/lib/server/feature-flag-keys";

export const DEFAULT_MAX_VIDEO_BYTES = 262_144_000;
export const DEFAULT_MAX_DURATION_MS = 60_000;
export const MAX_SOUND_BYTES = 15 * 1024 * 1024;
export const DEFAULT_MAX_IMAGE_BYTES = 15 * 1024 * 1024;

export async function getExploreVideoTranscodeCaps(tenantId?: string | null) {
  const meta = await getFeatureFlagMetadata(
    FEATURE_FLAG_KEYS.EXPLORE_VIDEO_TRANSCODE,
    tenantId,
  );
  const maxVideoBytes =
    typeof meta.max_video_bytes === "number" && meta.max_video_bytes > 0
      ? meta.max_video_bytes
      : DEFAULT_MAX_VIDEO_BYTES;
  const maxDurationMs =
    typeof meta.max_duration_ms === "number" && meta.max_duration_ms > 0
      ? meta.max_duration_ms
      : DEFAULT_MAX_DURATION_MS;
  return { maxVideoBytes, maxDurationMs };
}

export async function isExploreEnabled(tenantId?: string | null) {
  return isFeatureEnabledServer(FEATURE_FLAG_KEYS.EXPLORE_ENABLED, tenantId);
}

export async function isExploreProviderPostsEnabled(tenantId?: string | null) {
  return isFeatureEnabledServer(FEATURE_FLAG_KEYS.EXPLORE_PROVIDER_POSTS, tenantId);
}

export async function isExploreVideoUploadEnabled(tenantId?: string | null) {
  return isFeatureEnabledServer(FEATURE_FLAG_KEYS.EXPLORE_VIDEO_UPLOAD, tenantId);
}

export async function isExploreVideoTranscodeEnabled(tenantId?: string | null) {
  return isFeatureEnabledServer(FEATURE_FLAG_KEYS.EXPLORE_VIDEO_TRANSCODE, tenantId);
}

export async function isExploreSoundCatalogEnabled(tenantId?: string | null) {
  return isFeatureEnabledServer(FEATURE_FLAG_KEYS.EXPLORE_SOUND_CATALOG, tenantId);
}

export async function getExploreImageUploadCaps(tenantId?: string | null) {
  const meta = await getFeatureFlagMetadata(
    FEATURE_FLAG_KEYS.EXPLORE_IMAGE_UPLOAD,
    tenantId,
  );
  const maxImageBytes =
    typeof meta.max_image_bytes === "number" && meta.max_image_bytes > 0
      ? meta.max_image_bytes
      : DEFAULT_MAX_IMAGE_BYTES;
  return { maxImageBytes };
}

export async function isExploreTextOverlaysEnabled(tenantId?: string | null) {
  return isFeatureEnabledServer(FEATURE_FLAG_KEYS.EXPLORE_TEXT_OVERLAYS, tenantId);
}

/** Default OFF — turn on only after Rendobar AI caption adapter is staged. */
export async function isExploreRendobarAiCaptionsEnabled(tenantId?: string | null) {
  return isFeatureEnabledServer(FEATURE_FLAG_KEYS.EXPLORE_RENDOBAR_AI_CAPTIONS, tenantId);
}

/** Default OFF — turn on only after JSON timeline adapter is staged. */
export async function isExploreRendobarTimelineComposeEnabled(tenantId?: string | null) {
  return isFeatureEnabledServer(FEATURE_FLAG_KEYS.EXPLORE_RENDOBAR_TIMELINE_COMPOSE, tenantId);
}

/** Default OFF — turn on only after smart compression adapter is staged. */
export async function isExploreRendobarSmartCompressionEnabled(tenantId?: string | null) {
  return isFeatureEnabledServer(FEATURE_FLAG_KEYS.EXPLORE_RENDOBAR_SMART_COMPRESSION, tenantId);
}
