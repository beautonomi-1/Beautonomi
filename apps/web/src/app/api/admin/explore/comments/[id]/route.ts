import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_CONTENT_CATALOG } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

/**
 * DELETE /api/admin/explore/comments/[id]
 * Remove a comment (tenant-scoped via post’s provider).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_CONTENT_CATALOG, request);
    const supabaseAdmin = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const { id: commentId } = await params;

    const { data: comment, error: c0 } = await supabaseAdmin
      .from("explore_comments")
      .select("id, post_id")
      .eq("id", commentId)
      .maybeSingle();
    if (c0) return handleApiError(c0, "Failed to load comment");
    if (!comment) return notFoundResponse("Comment not found");

    const { data: post, error: p0 } = await supabaseAdmin
      .from("explore_posts")
      .select("id, providers:provider_id!inner(tenant_id)")
      .eq("id", comment.post_id)
      .maybeSingle();
    if (p0) return handleApiError(p0, "Failed to verify post");
    if (!post) return notFoundResponse("Comment not found");
    const prov = post.providers as unknown as { tenant_id: string };
    if (prov.tenant_id !== tenantId) return notFoundResponse("Comment not found");

    const { error: delErr } = await supabaseAdmin.from("explore_comments").delete().eq("id", commentId);
    if (delErr) return handleApiError(delErr, "Failed to delete comment");

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: "admin.explore.comment.delete",
      entity_type: "explore_comment",
      entity_id: commentId,
      module: "content_catalog",
      risk_level: "high",
      retention_tier: "operational",
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    return successResponse({ deleted: true, id: commentId });
  } catch (error) {
    return handleApiError(error, "Failed to delete comment");
  }
}
