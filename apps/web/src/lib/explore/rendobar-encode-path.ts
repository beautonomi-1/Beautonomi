import { buildEncodeJob } from "@/lib/explore/rendobar-jobs";
import {
  isExploreRendobarAiCaptionsEnabled,
  isExploreRendobarSmartCompressionEnabled,
  isExploreRendobarTimelineComposeEnabled,
} from "@/lib/explore/explore-feature-gates";

export type ExploreStandardEncodeParams = {
  postId: string;
  slideIndex: number;
  storageConnectionId: string;
  objectPath: string;
  videoFilter?: string | null;
  posterSeekSec?: number;
  trimStartSec?: number | null;
  maxOutputDurationSec?: number | null;
};

/**
 * v1 production path: always `type: ffmpeg` with `params.command` string (scale/trim/drawtext).
 * Future Rendobar job types (AI captions, JSON timeline, smart compression) are gated by
 * feature flags default OFF — enabling a flag does not switch paths until its adapter ships.
 */
export async function buildExploreVideoEncodeJob(
  params: ExploreStandardEncodeParams,
): Promise<Record<string, unknown>> {
  const [aiCaptions, timeline, smartCompress] = await Promise.all([
    isExploreRendobarAiCaptionsEnabled(null),
    isExploreRendobarTimelineComposeEnabled(null),
    isExploreRendobarSmartCompressionEnabled(null),
  ]);

  if (aiCaptions || timeline || smartCompress) {
    console.info(
      "[rendobar] explore advanced flag(s) enabled (ai_captions=%s timeline=%s smart_compression=%s); v1 ffmpeg encode still used until adapter is deployed",
      aiCaptions,
      timeline,
      smartCompress,
    );
  }

  return buildEncodeJob({
    postId: params.postId,
    slideIndex: params.slideIndex,
    storageConnectionId: params.storageConnectionId,
    objectPath: params.objectPath,
    videoFilter: params.videoFilter,
    posterSeekSec: params.posterSeekSec,
    trimStartSec: params.trimStartSec,
    maxOutputDurationSec: params.maxOutputDurationSec,
  });
}
