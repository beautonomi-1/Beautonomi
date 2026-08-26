import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_USERS_TRUST } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { resolveContentAuthorUserId } from "@/lib/safety/moderation-actions";

async function fetchTargetPreview(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  targetType: string,
  targetId: string,
): Promise<{ snippet: string } | null> {
  switch (targetType) {
    case "explore_post": {
      const { data } = await supabase
        .from("explore_posts")
        .select("caption")
        .eq("id", targetId)
        .maybeSingle();
      const caption = (data as { caption?: string } | null)?.caption;
      return caption ? { snippet: caption.slice(0, 200) } : null;
    }
    case "explore_comment": {
      const { data } = await supabase
        .from("explore_comments")
        .select("body")
        .eq("id", targetId)
        .maybeSingle();
      const body = (data as { body?: string } | null)?.body;
      return body ? { snippet: body.slice(0, 200) } : null;
    }
    case "message": {
      const { data } = await supabase
        .from("messages")
        .select("content")
        .eq("id", targetId)
        .maybeSingle();
      const content = (data as { content?: string } | null)?.content;
      return content ? { snippet: `[redacted] ${content.slice(0, 120)}` } : null;
    }
    case "review": {
      const { data } = await supabase
        .from("reviews")
        .select("comment")
        .eq("id", targetId)
        .maybeSingle();
      const comment = (data as { comment?: string } | null)?.comment;
      return comment ? { snippet: comment.slice(0, 200) } : null;
    }
    case "product_review": {
      const { data } = await supabase
        .from("product_reviews")
        .select("comment")
        .eq("id", targetId)
        .maybeSingle();
      const comment = (data as { comment?: string } | null)?.comment;
      return comment ? { snippet: comment.slice(0, 200) } : null;
    }
    default:
      return null;
  }
}

/**
 * GET /api/admin/content-reports
 * List content reports (superadmin). Mirrors user-reports list shape.
 * Query: status=pending|resolved|dismissed, target_type, sla_overdue=1, limit, offset
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_USERS_TRUST, request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const targetType = searchParams.get("target_type");
    const slaOverdue =
      searchParams.get("sla_overdue") === "1" ||
      searchParams.get("sla_overdue") === "true";
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);
    const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10), 0);

    let query = supabase
      .from("content_reports")
      .select(
        "id, reporter_id, target_type, target_id, reason, details, tenant_id, status, resolution_notes, resolved_by, resolved_at, created_at, updated_at, admin_action_taken, takedown_applied",
        { count: "exact" }
      )
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (slaOverdue) {
      const slaCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      query = query.eq("status", "pending").lt("created_at", slaCutoff);
    } else if (status && ["pending", "resolved", "dismissed"].includes(status)) {
      query = query.eq("status", status);
    }
    if (targetType) {
      query = query.eq("target_type", targetType);
    }

    const { data: rows, error, count } = await query;

    if (error) return handleApiError(error, "Failed to fetch content reports");

    type ReportRow = {
      reporter_id?: string;
      id: string;
      target_type?: string;
      target_id?: string;
      reason?: string;
      details?: string;
      tenant_id?: string;
      status?: string;
      resolution_notes?: string;
      resolved_by?: string;
      resolved_at?: string;
      created_at?: string;
      updated_at?: string;
    };
    type UserMapRow = { id: string; full_name: string | null; email: string };

    const authorIdByReport = new Map<string, string>();
    await Promise.all(
      (rows || []).map(async (r: ReportRow) => {
        if (!r.id || !r.target_type || !r.target_id) return;
        const authorId = await resolveContentAuthorUserId(
          supabase,
          r.target_type as Parameters<typeof resolveContentAuthorUserId>[1],
          r.target_id,
        );
        if (authorId) authorIdByReport.set(r.id, authorId);
      }),
    );

    const relatedUserIds = [
      ...new Set([
        ...(rows || [])
          .map((r: ReportRow) => r.reporter_id)
          .filter(Boolean) as string[],
        ...authorIdByReport.values(),
      ]),
    ];

    let userMap: Record<string, UserMapRow> = {};
    if (relatedUserIds.length > 0) {
      const { data: users } = await supabase
        .from("users")
        .select("id, full_name, email")
        .in("id", relatedUserIds);
      userMap = (users || []).reduce<Record<string, UserMapRow>>(
        (acc, u: UserMapRow) => {
          acc[u.id] = u;
          return acc;
        },
        {}
      );
    }

    const reports = await Promise.all(
      (rows || []).map(async (r: ReportRow) => {
        const authorUserId = authorIdByReport.get(r.id) ?? null;
        return {
          ...r,
          reporter: userMap[r.reporter_id ?? ""] ?? null,
          content_author: authorUserId ? userMap[authorUserId] ?? { id: authorUserId } : null,
          target_preview: r.target_type && r.target_id
            ? await fetchTargetPreview(supabase, r.target_type, r.target_id)
            : null,
        };
      }),
    );

    return successResponse({
      data: reports,
      total: count ?? reports.length,
      has_more: offset + limit < (count ?? reports.length),
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch content reports");
  }
}
