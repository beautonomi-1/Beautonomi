import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { ExploreMediaSlideMeta } from "@/lib/explore/media-types";
import {
  isExploreVideoTranscodeEnabled,
  getExploreVideoTranscodeCaps,
} from "@/lib/explore/explore-feature-gates";
import {
  buildProbeJob,
  createRendobarJob,
  publicUrlForExploreObject,
} from "@/lib/explore/rendobar-jobs";
import { buildExploreVideoEncodeJob } from "@/lib/explore/rendobar-encode-path";
import {
  buildVideoDrawtextChain,
  combineScaleAndDrawtext,
  posterSeekSeconds,
} from "@/lib/explore/explore-rendobar-overlays";
import { loadRendobarSecrets, rendobarIntegrationReady } from "@/lib/explore/rendobar-config";

async function objectExists(path: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const folder = path.slice(0, path.lastIndexOf("/"));
  const name = path.slice(path.lastIndexOf("/") + 1);
  const { data } = await supabase.storage.from("explore-posts").list(folder, { search: name, limit: 5 });
  return (data ?? []).some((o) => o.name === name);
}

export async function enqueueExploreVideoProcessing(postId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data: post } = await supabase
    .from("explore_posts")
    .select("id, status, media_urls, media_meta, provider_id")
    .eq("id", postId)
    .maybeSingle();

  if (!post || post.status !== "published") return;

  const transcodeEnabled = await isExploreVideoTranscodeEnabled(null);
  const secrets = await loadRendobarSecrets();
  if (!transcodeEnabled || !rendobarIntegrationReady(secrets)) {
    if (transcodeEnabled) {
      console.warn("[explore] explore.video_transcode on but Rendobar not fully configured; skipping enqueue");
    }
    return;
  }

  const mediaUrls = (post.media_urls ?? []) as string[];
  const mediaMeta = (post.media_meta ?? []) as ExploreMediaSlideMeta[];
  let changed = false;
  const nextMeta = [...mediaMeta];

  for (let i = 0; i < mediaUrls.length; i += 1) {
    const slide = nextMeta[i] ?? { kind: "image" as const };
    if (slide.kind !== "video") continue;
    if (slide.playback_path) continue;
    if (slide.probe_job_id && slide.status === "probing") continue;
    if (slide.encode_job_id && slide.status === "encoding") continue;

    const objectPath = mediaUrls[i]!.replace(/^\//, "");
    const exists = await objectExists(objectPath);
    if (!exists) continue;

    const job = await createRendobarJob(
      buildProbeJob({
        postId,
        slideIndex: i,
        publicObjectUrl: publicUrlForExploreObject(objectPath),
      }),
    );
    if (!job) continue;

    nextMeta[i] = {
      ...slide,
      kind: "video",
      probe_job_id: job.id,
      status: "probing",
      error_code: null,
    };
    changed = true;
  }

  if (changed) {
    await supabase.from("explore_posts").update({ media_meta: nextMeta }).eq("id", postId);
  }
}

export async function startEncodeAfterProbe(params: {
  postId: string;
  slideIndex: number;
  objectPath: string;
  /** Auto-trim output to Explore max length when source exceeds cap. */
  trimStartSec?: number | null;
  maxOutputDurationSec?: number | null;
}): Promise<string | null> {
  const secrets = await loadRendobarSecrets();
  if (!secrets.storageConnectionId) return null;

  const supabase = getSupabaseAdmin();
  const { data: post } = await supabase
    .from("explore_posts")
    .select("media_meta")
    .eq("id", params.postId)
    .maybeSingle();
  const mediaMeta = (post?.media_meta ?? []) as ExploreMediaSlideMeta[];
  const slide = mediaMeta[params.slideIndex];
  const drawtext = await buildVideoDrawtextChain(slide?.text_overlays);
  const scale =
    "scale='if(gt(iw,ih),min(1080,iw),-2)':'if(gt(iw,ih),-2,min(1080,ih))'";
  const vf = combineScaleAndDrawtext(scale, drawtext);
  const posterSeekSec = posterSeekSeconds(slide?.text_overlays);

  const job = await createRendobarJob(
    await buildExploreVideoEncodeJob({
      postId: params.postId,
      slideIndex: params.slideIndex,
      storageConnectionId: secrets.storageConnectionId,
      objectPath: params.objectPath.replace(/^\//, ""),
      videoFilter: vf,
      posterSeekSec,
      trimStartSec: params.trimStartSec,
      maxOutputDurationSec: params.maxOutputDurationSec,
    }),
  );
  return job?.id ?? null;
}

export async function revertPostToDraftForDuration(postId: string, slideIndex: number, errorCode: string) {
  const supabase = getSupabaseAdmin();
  const { data: post } = await supabase
    .from("explore_posts")
    .select("media_meta")
    .eq("id", postId)
    .maybeSingle();
  const meta = [...((post?.media_meta ?? []) as ExploreMediaSlideMeta[])];
  if (meta[slideIndex]) {
    meta[slideIndex] = {
      ...meta[slideIndex]!,
      status: "failed",
      error_code: errorCode,
      probe_job_id: null,
      encode_job_id: null,
    };
  }
  await supabase
    .from("explore_posts")
    .update({ status: "draft", media_meta: meta })
    .eq("id", postId);
}

export async function maxDurationMsForExplore(): Promise<number> {
  const { maxDurationMs } = await getExploreVideoTranscodeCaps(null);
  return maxDurationMs;
}
