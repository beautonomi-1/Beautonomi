import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { requireRoleInApi } from "@/lib/supabase/api-helpers";

/**
 * PATCH /api/admin/user-reports/[id]
 * Resolve or dismiss a report. Superadmin only.
 * Body: { status: 'resolved' | 'dismissed', resolution_notes?: string }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["superadmin"]);
    const { id } = await params;
    const body = await request.json();

    const status = body.status;
    const resolutionNotes =
      typeof body.resolution_notes === "string"
        ? body.resolution_notes.trim()
        : null;

    if (!status || !["resolved", "dismissed"].includes(status)) {
      return errorResponse(
        "status must be 'resolved' or 'dismissed'",
        "VALIDATION_ERROR",
        400
      );
    }

    const supabase = await getSupabaseAdmin();

    const { data: existing, error: fetchError } = await supabase
      .from("user_reports")
      .select("id, status")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return errorResponse("Report not found", "NOT_FOUND", 404);
    }

    if (existing.status !== "pending") {
      return errorResponse(
        "Report is already resolved or dismissed",
        "VALIDATION_ERROR",
        400
      );
    }

    const { data: updated, error } = await supabase
      .from("user_reports")
      .update({
        status,
        resolution_notes: resolutionNotes ?? null,
        resolved_by: user.id,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id, status, resolution_notes, resolved_at")
      .single();

    if (error) return handleApiError(error, "Failed to update report");

    return successResponse(updated);
  } catch (error) {
    return handleApiError(error, "Failed to update report");
  }
}
