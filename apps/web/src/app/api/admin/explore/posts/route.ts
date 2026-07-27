import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_CONTENT_CATALOG } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { fetchProviderInAdminTenant } from "@/lib/tenant/admin-booking-tenant";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import { moderationNotesForMedicalClaims } from "@/lib/safety/medical-claims-keywords";

const _SORT_OPTIONS = [
  "published_at_desc",
  "published_at_asc",
  "like_count_desc",
  "comment_count_desc",
  "save_count_desc",
  "created_at_desc",
] as const;
const SELECT_WITH_SAVE_COUNT = `
        id,
        provider_id,
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
        providers:provider_id!inner(id, business_name, slug, tenant_id)
      `;
const SELECT_WITHOUT_SAVE_COUNT = `
        id,
        provider_id,
        caption,
        media_urls,
        status,
        published_at,
        like_count,
        comment_count,
        is_hidden,
        moderation_notes,
        moderated_at,
        moderated_by,
        created_at,
        providers:provider_id!inner(id, business_name, slug, tenant_id)
      `;

function isMissingSaveCountColumnError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  const code = typeof record.code === "string" ? record.code : "";
  const message = typeof record.message === "string" ? record.message : "";
  return code === "42703" && message.includes("save_count");
}

/**
 * GET /api/admin/explore/posts
 * List all posts with filters. Superadmin only.
 * Query: status, provider_id, hidden, search, date_from, date_to, sort, limit, offset
 */
export async function GET(request: NextRequest) {
  try {
    const { user: _user } = await requireAdminSection(ADMIN_SECTION_CONTENT_CATALOG, request);
    const supabaseAdmin = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const providerId = searchParams.get("provider_id");
    const hidden = searchParams.get("hidden");
    const search = searchParams.get("search")?.trim();
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");
    const sortRaw = searchParams.get("sort") || "published_at_desc";
    const sort = (_SORT_OPTIONS as readonly string[]).includes(sortRaw)
      ? (sortRaw as (typeof _SORT_OPTIONS)[number])
      : "published_at_desc";
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);
    const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10));

    if (providerId) {
      const prov = await fetchProviderInAdminTenant(supabaseAdmin, providerId, tenantId, "id");
      if ("error" in prov) {
        return prov.error;
      }
    }

    const buildQuery = async (includeSaveCount: boolean) => {
      const selectClause = includeSaveCount ? SELECT_WITH_SAVE_COUNT : SELECT_WITHOUT_SAVE_COUNT;
      let query = supabaseAdmin
      .from("explore_posts")
      .select(selectClause, { count: "exact" })
      .eq("providers.tenant_id", tenantId)
      .range(offset, offset + limit - 1);

      if (status) query = query.eq("status", status);
      if (providerId) query = query.eq("provider_id", providerId);
      if (hidden === "true") query = query.eq("is_hidden", true);
      if (hidden === "false") query = query.eq("is_hidden", false);
      if (dateFrom) query = query.gte("published_at", dateFrom);
      if (dateTo) query = query.lte("published_at", dateTo + "T23:59:59.999Z");

      if (search) {
        const safeSearch = search.replace(/[%*\\(),."]/g, "").trim();
        if (safeSearch) {
          const { data: providerRows } = await supabaseAdmin
            .from("providers")
            .select("id")
            .eq("tenant_id", tenantId)
            .ilike("business_name", `%${safeSearch}%`);
          const providerIds = (providerRows || []).map((p: { id: string }) => p.id);
          if (providerIds.length > 0) {
            query = query.or(
              `caption.ilike.%${safeSearch}%,provider_id.in.(${providerIds.join(",")})`
            );
          } else {
            query = query.ilike("caption", `%${safeSearch}%`);
          }
        }
      }

      switch (sort) {
        case "published_at_asc":
          query = query.order("published_at", { ascending: true }).order("id", { ascending: true });
          break;
        case "like_count_desc":
          query = query.order("like_count", { ascending: false }).order("published_at", { ascending: false });
          break;
        case "comment_count_desc":
          query = query.order("comment_count", { ascending: false }).order("published_at", { ascending: false });
          break;
        case "save_count_desc":
          query = includeSaveCount
            ? query.order("save_count", { ascending: false }).order("published_at", { ascending: false })
            : query.order("published_at", { ascending: false }).order("id", { ascending: false });
          break;
        case "created_at_desc":
          query = query.order("created_at", { ascending: false }).order("id", { ascending: false });
          break;
        default:
          query = query.order("published_at", { ascending: false }).order("id", { ascending: false });
      }
      return query;
    };

    let { data, error, count } = await buildQuery(true);
    if (error && isMissingSaveCountColumnError(error)) {
      console.warn("[admin/explore/posts] save_count column missing; falling back to compatibility mode");
      ({ data, error, count } = await buildQuery(false));
    }

    if (error) {
      console.error("explore_posts query error:", { message: error.message, details: error.details, hint: error.hint, code: error.code });
      return handleApiError(error, `Failed to fetch posts: ${error.message}`);
    }

    return successResponse({
      posts: data || [],
      total: count ?? (data?.length ?? 0),
      limit,
      offset,
    });
  } catch (error) {
    console.error("explore_posts catch error:", error);
    return handleApiError(error, "Failed to fetch posts");
  }
}

/**
 * POST /api/admin/explore/posts
 * Bulk hide/unhide. Body: { action: "hide" | "unhide", post_ids: string[], moderation_notes?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_CONTENT_CATALOG, request);
    const supabaseAdmin = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    const body = await request.json();
    const { action, post_ids, moderation_notes } = body || {};

    if (!action || !["hide", "unhide"].includes(action) || !Array.isArray(post_ids) || post_ids.length === 0) {
      return errorResponse("action (hide|unhide) and post_ids (non-empty array) required", "VALIDATION_ERROR", 400);
    }

    const isHidden = action === "hide";
    const ids = post_ids.slice(0, 50).filter((id: unknown): id is string => typeof id === "string");

    const { data: scopedRows } = await supabaseAdmin
      .from("explore_posts")
      .select("id, providers:provider_id!inner(tenant_id)")
      .in("id", ids)
      .eq("providers.tenant_id", tenantId);
    const allowedIds = (scopedRows ?? []).map((r: { id: string }) => r.id);
    if (allowedIds.length === 0) {
      return successResponse({ updated: 0, post_ids: [] });
    }

    const { data, error } = await supabaseAdmin
      .from("explore_posts")
      .update({
        is_hidden: isHidden,
        moderation_notes: isHidden ? (moderation_notes || null) : null,
        moderated_at: new Date().toISOString(),
        moderated_by: user.id,
      })
      .in("id", allowedIds)
      .select("id");

    if (error) return handleApiError(error, "Failed to update posts");

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: "admin.explore.posts.moderate",
      entity_type: "explore_post",
      module: "content_catalog",
      risk_level: "high",
      retention_tier: "operational",
      metadata: { action, post_ids: allowedIds, count: data?.length ?? 0 },
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    return successResponse({ updated: data?.length ?? 0, post_ids: allowedIds });
  } catch (error) {
    return handleApiError(error, "Failed to update posts");
  }
}

/**
 * PATCH /api/admin/explore/posts
 * Update post caption (tenant-scoped). Auto-flags moderation_notes when caption matches medical claims.
 * Body: { id: string, caption?: string }
 */
export async function PATCH(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_CONTENT_CATALOG, request);
    const supabaseAdmin = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    const body = await request.json();
    const postId = typeof body.id === "string" ? body.id.trim() : "";
    if (!postId) {
      return errorResponse("id is required", "VALIDATION_ERROR", 400);
    }

    const { data: scopedRow } = await supabaseAdmin
      .from("explore_posts")
      .select("id, caption, moderation_notes, providers:provider_id!inner(tenant_id)")
      .eq("id", postId)
      .maybeSingle();

    if (!scopedRow) {
      return errorResponse("Post not found", "NOT_FOUND", 404);
    }
    const prov = (scopedRow as { providers?: { tenant_id?: string } }).providers;
    if (prov?.tenant_id !== tenantId) {
      return errorResponse("Post not found", "NOT_FOUND", 404);
    }

    const updates: Record<string, unknown> = {
      moderated_at: new Date().toISOString(),
      moderated_by: user.id,
    };

    if (body.caption !== undefined) {
      const caption =
        typeof body.caption === "string" ? body.caption.trim() : null;
      updates.caption = caption || null;
      const existingNotes = (scopedRow as { moderation_notes?: string | null })
        .moderation_notes;
      updates.moderation_notes = moderationNotesForMedicalClaims(
        existingNotes,
        caption
      );
    }

    if (Object.keys(updates).length <= 2) {
      return errorResponse("caption is required to update", "VALIDATION_ERROR", 400);
    }

    const { data, error } = await supabaseAdmin
      .from("explore_posts")
      .update(updates)
      .eq("id", postId)
      .select("id, caption, moderation_notes, moderated_at")
      .single();

    if (error) return handleApiError(error, "Failed to update post");

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: "admin.explore.post.caption_update",
      entity_type: "explore_post",
      entity_id: postId,
      module: "content_catalog",
      risk_level: "medium",
      retention_tier: "operational",
      metadata: { has_medical_flag: Boolean(updates.moderation_notes) },
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    return successResponse(data);
  } catch (error) {
    return handleApiError(error, "Failed to update post");
  }
}
