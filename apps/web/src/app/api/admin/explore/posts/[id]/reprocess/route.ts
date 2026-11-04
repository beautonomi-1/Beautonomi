import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  errorResponse,
  handleApiError,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_CONTENT_CATALOG } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import type { ExploreMediaSlideMeta } from "@/lib/explore/media-types";
import { resetExploreVideoSlidesForReprocess } from "@/lib/explore/reset-explore-video-slides";
import { enqueueExploreVideoProcessing } from "@/lib/explore/enqueue-video-processing";
import { isExploreVideoTranscodeEnabled } from "@/lib/explore/explore-feature-gates";
import { loadRendobarSecrets, rendobarIntegrationReady } from "@/lib/explore/rendobar-config";
import { denormalizeFirstSlideFromMeta } from "@/lib/explore/media-meta";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_CONTENT_CATALOG, request);
    const supabaseAdmin = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const { id } = await params;

    const transcodeOn = await isExploreVideoTranscodeEnabled(null);
    const secrets = await loadRendobarSecrets();
    if (!transcodeOn || !rendobarIntegrationReady(secrets)) {
      return errorResponse(
        "Video transcode is not available (flag or Rendobar configuration)",
        "CONFLICT",
        409,
      );
    }

    const body = (await request.json().catch(() => ({}))) as { force?: boolean };
    const force = body.force === true;

    const { data: post, error } = await supabaseAdmin
      .from("explore_posts")
      .select("id, provider_id, status, media_urls, media_meta, playback_path, providers:provider_id!inner(tenant_id)")
      .eq("id", id)
      .maybeSingle();

    if (error) return handleApiError(error, "Failed to load post");
    if (!post) return notFoundResponse("Post not found");

    const prov = (post as { providers?: { tenant_id?: string } }).providers;
    if (prov?.tenant_id !== tenantId) return notFoundResponse("Post not found");

    const mediaUrls = (post.media_urls ?? []) as string[];
    const mediaMeta = resetExploreVideoSlidesForReprocess(
      [...((post.media_meta ?? []) as ExploreMediaSlideMeta[])],
      { forceAllVideo: force },
    );

    const hasVideo = mediaMeta.some((s) => s.kind === "video");
    if (!hasVideo) {
      return errorResponse("Post has no video slides", "VALIDATION_ERROR", 400);
    }

    const denorm = denormalizeFirstSlideFromMeta(mediaUrls, mediaMeta);
    await supabaseAdmin
      .from("explore_posts")
      .update({
        media_meta: mediaMeta,
        playback_path: denorm.playback_path,
      })
      .eq("id", id);

    if (post.status === "published") {
      await enqueueExploreVideoProcessing(id);
    }

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: "admin.explore.post.reprocess",
      entity_type: "explore_post",
      entity_id: id,
      module: "content_catalog",
      risk_level: "high",
      retention_tier: "operational",
      metadata: { force },
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    return successResponse({ ok: true, post_id: id });
  } catch (error) {
    return handleApiError(error, "Failed to reprocess video");
  }
}
