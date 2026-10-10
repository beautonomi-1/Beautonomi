import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { ExploreMediaSlideMeta } from "@/lib/explore/media-types";
import { firstSlideIsVideo } from "@/lib/explore/video-media";
import { isExploreVideoTranscodeEnabled } from "@/lib/explore/explore-feature-gates";
import { rendobarIntegrationReady, loadRendobarSecrets } from "@/lib/explore/rendobar-config";
import { toPublicMediaUrl } from "@/lib/explore/media-urls";
import { enqueueExploreVideoProcessing } from "@/lib/explore/enqueue-video-processing";

export async function runExplorePublishSideEffects(params: {
  postId: string;
  providerId: string;
  alsoAddToGallery?: boolean;
  isFirstPublish: boolean;
}): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data: post } = await supabase
    .from("explore_posts")
    .select("display_path, media_urls, media_meta, caption")
    .eq("id", params.postId)
    .single();

  if (!post) return;

  const mediaMeta = (post.media_meta ?? []) as ExploreMediaSlideMeta[];
  const videoFirst = firstSlideIsVideo(post.media_urls as string[], mediaMeta);
  const transcodeOn =
    (await isExploreVideoTranscodeEnabled(null)) &&
    rendobarIntegrationReady(await loadRendobarSecrets());
  const videoNeedsJob =
    videoFirst && transcodeOn && mediaMeta.some((s) => s.kind === "video" && !s.playback_path);

  try {
    const { upsertPostEmbedding } = await import("@/lib/ai/embeddings");
    const env = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "production";
    const environment =
      env === "production" ? "production" : env === "staging" ? "staging" : "development";
    void upsertPostEmbedding(params.postId, String(post.caption ?? ""), environment).catch(() => {});
  } catch {
    // optional
  }

  if (videoNeedsJob) {
    if (params.alsoAddToGallery && mediaMeta.length > 0) {
      const meta = [...mediaMeta];
      meta[0] = { ...meta[0], pending_gallery_append: true };
      await supabase.from("explore_posts").update({ media_meta: meta }).eq("id", params.postId);
    }
    await enqueueExploreVideoProcessing(params.postId);
    return;
  }

  if (params.isFirstPublish) {
    await awardExplorePublishPoints(params.providerId, params.postId);
  }

  if (params.alsoAddToGallery) {
    await appendGalleryDisplayImage(params.providerId, post.display_path, post.media_urls as string[], mediaMeta);
  }
}

export async function awardExplorePublishPoints(providerId: string, postId: string) {
  const supabase = getSupabaseAdmin();
  try {
    await supabase.rpc("award_provider_points_for_explore_post", {
      p_provider_id: providerId,
      p_post_id: postId,
    });
  } catch (err) {
    console.warn("[explore] award points:", err);
  }
}

export async function appendGalleryDisplayImage(
  providerId: string,
  displayPath: string | null,
  mediaUrls: string[],
  mediaMeta: ExploreMediaSlideMeta[],
) {
  const supabase = getSupabaseAdmin();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const path =
    displayPath ??
    mediaMeta[0]?.display_path ??
    (mediaMeta[0]?.kind === "image" ? mediaUrls[0] : null);
  if (!path) return;
  if (firstSlideIsVideo(mediaUrls, mediaMeta) && !displayPath && !mediaMeta[0]?.display_path) {
    return;
  }
  const publicUrl = toPublicMediaUrl(path, supabaseUrl);
  try {
    await supabase.rpc("append_provider_gallery", {
      p_provider_id: providerId,
      p_url: publicUrl,
    });
  } catch (err) {
    console.warn("[explore] gallery append:", err);
  }
}

export async function deferredVideoPublishRewards(params: {
  postId: string;
  providerId: string;
  alsoAddToGallery?: boolean;
  newDisplayPath?: string | null;
}) {
  await awardExplorePublishPoints(params.providerId, params.postId);
  if (params.alsoAddToGallery && params.newDisplayPath) {
    const supabase = getSupabaseAdmin();
    const { data: prov } = await supabase.from("providers").select("gallery").eq("id", params.providerId).maybeSingle();
    const gallery = (prov?.gallery ?? []) as string[];
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const newUrl = toPublicMediaUrl(params.newDisplayPath, supabaseUrl);
    const cardUrls = gallery.filter((u) => u.includes("post-") || u.includes("explore/"));
    for (const old of cardUrls) {
      if (old !== newUrl) {
        await supabase
          .from("providers")
          .update({ gallery: gallery.map((g) => (g === old ? newUrl : g)) })
          .eq("id", params.providerId);
      }
    }
    if (!gallery.includes(newUrl)) {
      await supabase.rpc("append_provider_gallery", {
        p_provider_id: params.providerId,
        p_url: newUrl,
      });
    }
  }
}
