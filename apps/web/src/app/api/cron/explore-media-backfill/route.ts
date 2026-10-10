import { NextRequest, NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";
import { processExploreDisplayJpeg } from "@/lib/explore/brand-display-image";
import { enqueueExploreVideoProcessing } from "@/lib/explore/enqueue-video-processing";
import { firstSlideIsVideo } from "@/lib/explore/video-media";
import type { ExploreMediaSlideMeta } from "@/lib/explore/media-types";
import { denormalizeFirstSlideFromMeta } from "@/lib/explore/media-meta";

const JOB_NAME = "explore-media-backfill";
export const maxDuration = 300;

const BATCH = 8;

export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }
  return runLockedCronRoute(JOB_NAME, runJob);
}

async function runJob() {
  const supabase = getSupabaseAdmin();
  let photoBackfilled = 0;
  let videoEnqueued = 0;

  const { data: photoRows } = await supabase
    .from("explore_posts")
    .select("id, provider_id, media_urls, media_meta")
    .eq("status", "published")
    .is("display_path", null)
    .limit(BATCH);

  for (const row of photoRows ?? []) {
    const meta = (row.media_meta ?? []) as ExploreMediaSlideMeta[];
    if (firstSlideIsVideo(row.media_urls as string[], meta)) continue;
    const path = (row.media_urls as string[])?.[0]?.replace(/^\//, "");
    if (!path) continue;
    try {
      const { data: blob, error } = await supabase.storage.from("explore-posts").download(path);
      if (error || !blob) continue;
      const buf = Buffer.from(await blob.arrayBuffer());
      const { data: prov } = await supabase
        .from("providers")
        .select("business_name")
        .eq("id", row.provider_id)
        .maybeSingle();
      const { buffer, width, height } = await processExploreDisplayJpeg(buf, prov?.business_name);
      const displayPath = `explore/${row.provider_id}/display-backfill-${Date.now()}.jpg`;
      await supabase.storage.from("explore-posts").upload(displayPath, buffer, {
        contentType: "image/jpeg",
        cacheControl: "31536000",
        upsert: false,
      });
      meta[0] = { ...(meta[0] ?? { kind: "image" }), kind: "image", display_path: displayPath, width, height };
      const denorm = denormalizeFirstSlideFromMeta(row.media_urls as string[], meta);
      await supabase
        .from("explore_posts")
        .update({
          media_meta: meta,
          display_path: denorm.display_path,
          media_width: denorm.media_width,
          media_height: denorm.media_height,
        })
        .eq("id", row.id);
      photoBackfilled += 1;
    } catch (err) {
      console.warn("[explore-media-backfill] photo", row.id, err);
    }
  }

  const { data: videoRows } = await supabase
    .from("explore_posts")
    .select("id, media_urls, media_meta, playback_path")
    .eq("status", "published")
    .is("playback_path", null)
    .limit(BATCH);

  for (const row of videoRows ?? []) {
    const meta = (row.media_meta ?? []) as ExploreMediaSlideMeta[];
    if (!firstSlideIsVideo(row.media_urls as string[], meta)) continue;
    const slide = meta[0];
    if (slide?.probe_job_id || slide?.encode_job_id) continue;
    await enqueueExploreVideoProcessing(row.id as string);
    videoEnqueued += 1;
  }

  return NextResponse.json({ ok: true, photoBackfilled, videoEnqueued });
}
