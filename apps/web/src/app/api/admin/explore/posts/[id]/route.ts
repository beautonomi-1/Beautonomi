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

type ProviderJoin = { tenant_id: string; business_name: string; slug: string; id: string };

async function fetchPostInTenant(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  postId: string,
  tenantId: string
) {
  const { data: post, error } = await supabaseAdmin
    .from("explore_posts")
    .select(
      `
      id,
      provider_id,
      created_by_user_id,
      caption,
      media_urls,
      status,
      published_at,
      like_count,
      comment_count,
      save_count,
      is_hidden,
      moderation_notes,
      moderated_at,
      moderated_by,
      created_at,
      updated_at,
      providers:provider_id!inner(id, business_name, slug, tenant_id)
    `
    )
    .eq("id", postId)
    .maybeSingle();

  if (error) return { error: error as Error };
  if (!post) return { post: null as null };
  const prov = post.providers as unknown as ProviderJoin;
  if (prov.tenant_id !== tenantId) return { post: null as null };
  return { post };
}

/**
 * GET /api/admin/explore/posts/[id]
 * Post detail, comments, and view count (tenant-scoped).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminSection(ADMIN_SECTION_CONTENT_CATALOG, request);
    const supabaseAdmin = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const { id } = await params;

    const result = await fetchPostInTenant(supabaseAdmin, id, tenantId);
    if ("error" in result && result.error) return handleApiError(result.error, "Failed to load post");
    if (!("post" in result) || result.post === null) return notFoundResponse("Post not found");

    const post = result.post;
    const prov = post.providers as unknown as ProviderJoin;
    const postOut = {
      ...post,
      providers: { id: prov.id, business_name: prov.business_name, slug: prov.slug },
    };

    const { data: comments, error: cErr } = await supabaseAdmin
      .from("explore_comments")
      .select(
        "id, post_id, user_id, body, mentioned_user_ids, created_at, users(id, email, full_name)"
      )
      .eq("post_id", id)
      .order("created_at", { ascending: false });

    if (cErr) return handleApiError(cErr, "Failed to load comments");

    let view_count = 0;
    const { data: viewRows, error: vErr } = await supabaseAdmin.rpc("get_explore_view_counts", {
      post_ids: [id],
    });
    if (vErr) {
      console.warn("[admin explore/posts detail] get_explore_view_counts failed:", vErr.message);
    } else {
      const viewRow = Array.isArray(viewRows) ? viewRows[0] : null;
      view_count =
        viewRow && typeof viewRow === "object" && "view_count" in viewRow
          ? Number((viewRow as { view_count: unknown }).view_count) || 0
          : 0;
    }

    return successResponse({
      post: postOut,
      comments: comments ?? [],
      view_count,
    });
  } catch (error) {
    return handleApiError(error, "Failed to load post");
  }
}

/**
 * PATCH /api/admin/explore/posts/[id]
 * Hide/unhide post, optional moderation_notes (tenant-scoped).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_CONTENT_CATALOG, request);
    const supabaseAdmin = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const { id } = await params;

    const scoped = await fetchPostInTenant(supabaseAdmin, id, tenantId);
    if ("error" in scoped && scoped.error) return handleApiError(scoped.error, "Failed to verify post");
    if (!("post" in scoped) || scoped.post === null) return notFoundResponse("Post not found");

    const body = await request.json();
    const { is_hidden, moderation_notes } = body;

    if (typeof is_hidden !== "boolean") {
      return errorResponse("is_hidden must be boolean", "VALIDATION_ERROR", 400);
    }

    const update: Record<string, unknown> = {
      is_hidden,
      moderated_at: new Date().toISOString(),
      moderated_by: user.id,
    };
    if (moderation_notes !== undefined) {
      update.moderation_notes = is_hidden ? (moderation_notes || null) : null;
    }

    const { data, error } = await supabaseAdmin
      .from("explore_posts")
      .update(update)
      .eq("id", id)
      .select("id, is_hidden, moderation_notes, moderated_at")
      .single();

    if (error) return handleApiError(error, "Failed to update post");
    return successResponse(data);
  } catch (error) {
    return handleApiError(error, "Failed to update post");
  }
}
