import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_USERS_TRUST } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import {
  applyContentModerationTakedown,
  resolveContentAuthorUserId,
  suspendUserAsAdmin,
} from "@/lib/safety/moderation-actions";
import { slackNotifyContentReportTakedown } from "@/lib/integrations/slack/ops-triggers";

async function fetchContentAuthor(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  targetType: string,
  targetId: string,
) {
  const authorUserId = await resolveContentAuthorUserId(
    supabase,
    targetType as Parameters<typeof resolveContentAuthorUserId>[1],
    targetId,
  );
  if (!authorUserId) return null;

  const { data: author } = await supabase
    .from("users")
    .select("id, full_name, email")
    .eq("id", authorUserId)
    .maybeSingle();

  return author ?? { id: authorUserId };
}

/**
 * GET /api/admin/content-reports/[id]
 * Fetch a single content report with reporter and content author.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminSection(ADMIN_SECTION_USERS_TRUST, request);
    const tenantId = await resolveAdminApiTenantId(request);
    const { id } = await params;
    const supabase = getSupabaseAdmin();

    const { data: row, error } = await supabase
      .from("content_reports")
      .select(
        "id, reporter_id, target_type, target_id, reason, details, tenant_id, status, resolution_notes, resolved_by, resolved_at, created_at, updated_at, admin_action_taken, takedown_applied",
      )
      .eq("id", id)
      .single();

    if (error || !row) {
      return errorResponse("Report not found", "NOT_FOUND", 404);
    }

    if ((row as { tenant_id?: string }).tenant_id !== tenantId) {
      return errorResponse("Report not found", "NOT_FOUND", 404);
    }

    type UserRow = { id: string; full_name: string | null; email: string };
    const reporterId = (row as { reporter_id?: string }).reporter_id;
    let reporter: UserRow | null = null;
    if (reporterId) {
      const { data } = await supabase
        .from("users")
        .select("id, full_name, email")
        .eq("id", reporterId)
        .maybeSingle();
      reporter = (data as UserRow | null) ?? null;
    }

    const targetType = String((row as { target_type?: string }).target_type ?? "");
    const targetId = String((row as { target_id?: string }).target_id ?? "");
    const content_author =
      targetType && targetId
        ? await fetchContentAuthor(supabase, targetType, targetId)
        : null;

    return successResponse({
      ...row,
      reporter,
      content_author,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch content report");
  }
}

/**
 * PATCH /api/admin/content-reports/[id]
 * Resolve or dismiss a content report (superadmin).
 * Body: {
 *   status: 'resolved' | 'dismissed',
 *   resolution_notes?: string,
 *   apply_takedown?: boolean,
 *   takedown_action?: 'hide' | 'delete',
 *   admin_action_taken?: string,
 *   suspend_author?: boolean
 * }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_USERS_TRUST, request);
    const tenantId = await resolveAdminApiTenantId(request);
    const { id } = await params;
    const body = await request.json();

    const status = body.status;
    const resolutionNotes =
      typeof body.resolution_notes === "string"
        ? body.resolution_notes.trim()
        : null;
    const applyTakedown = body.apply_takedown === true;
    const suspendAuthor = body.suspend_author === true;
    const takedownAction =
      body.takedown_action === "delete" ? "delete" : "hide";
    const adminActionTaken =
      typeof body.admin_action_taken === "string"
        ? body.admin_action_taken.trim()
        : null;

    if (!status || !["resolved", "dismissed"].includes(status)) {
      return errorResponse(
        "status must be 'resolved' or 'dismissed'",
        "VALIDATION_ERROR",
        400
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: existing, error: fetchError } = await supabase
      .from("content_reports")
      .select("id, status, tenant_id, target_type, target_id")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return errorResponse("Report not found", "NOT_FOUND", 404);
    }

    if ((existing as { tenant_id?: string }).tenant_id !== tenantId) {
      return errorResponse("Report not found", "NOT_FOUND", 404);
    }

    if (existing.status !== "pending") {
      return errorResponse(
        "Report is already resolved or dismissed",
        "VALIDATION_ERROR",
        400
      );
    }

    let takedownApplied = false;
    if (applyTakedown && status === "resolved") {
      const result = await applyContentModerationTakedown(supabase, {
        targetType: existing.target_type as Parameters<
          typeof applyContentModerationTakedown
        >[1]["targetType"],
        targetId: existing.target_id as string,
        adminUserId: user.id,
        action: takedownAction,
        notes: resolutionNotes,
      });
      takedownApplied = result.applied;
      if (takedownApplied && tenantId) {
        slackNotifyContentReportTakedown({
          tenantId,
          reportId: id,
          targetType: String(existing.target_type),
          targetId: String(existing.target_id),
          action: result.action ?? takedownAction,
        });
      }
    }

    let authorSuspended = false;
    let authorSuspendWarning: string | undefined;
    if (
      suspendAuthor &&
      applyTakedown &&
      status === "resolved"
    ) {
      const authorUserId = await resolveContentAuthorUserId(
        supabase,
        existing.target_type as Parameters<typeof resolveContentAuthorUserId>[1],
        String(existing.target_id),
      );
      if (!authorUserId) {
        authorSuspendWarning = "Content author could not be resolved for suspension.";
      } else {
        const suspendResult = await suspendUserAsAdmin(supabase, {
          userId: authorUserId,
          adminUserId: user.id,
          reason:
            adminActionTaken ??
            resolutionNotes ??
            "Suspended after content report takedown",
        });
        authorSuspended = suspendResult.suspended;
        if (!authorSuspended && suspendResult.message) {
          authorSuspendWarning = suspendResult.message;
        }
      }
    }

    const { data: updated, error } = await supabase
      .from("content_reports")
      .update({
        status,
        resolution_notes: resolutionNotes ?? null,
        resolved_by: user.id,
        resolved_at: new Date().toISOString(),
        admin_action_taken: adminActionTaken,
        takedown_applied: takedownApplied,
      })
      .eq("id", id)
      .select("id, status, resolution_notes, resolved_at, target_type, target_id, admin_action_taken, takedown_applied")
      .single();

    if (error) return handleApiError(error, "Failed to update content report");

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: "admin.content_report.resolve",
      entity_type: "content_report",
      entity_id: id,
      module: "providers_operations",
      risk_level: "high",
      retention_tier: "operational",
      metadata: {
        status,
        target_type: (existing as { target_type?: string }).target_type,
        target_id: (existing as { target_id?: string }).target_id,
        takedown_applied: takedownApplied,
        author_suspended: authorSuspended,
      },
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    const targetType = String((existing as { target_type?: string }).target_type ?? "");
    const targetId = String((existing as { target_id?: string }).target_id ?? "");
    const content_author =
      targetType && targetId
        ? await fetchContentAuthor(supabase, targetType, targetId)
        : null;

    if (applyTakedown && status === "resolved" && !takedownApplied) {
      return successResponse({
        ...updated,
        content_author,
        author_suspended: authorSuspended,
        author_suspend_warning: authorSuspendWarning,
        takedown_warning: "Report resolved but content could not be hidden for this target type.",
      });
    }

    return successResponse({
      ...updated,
      content_author,
      author_suspended: authorSuspended,
      author_suspend_warning: authorSuspendWarning,
    });
  } catch (error) {
    return handleApiError(error, "Failed to update content report");
  }
}
