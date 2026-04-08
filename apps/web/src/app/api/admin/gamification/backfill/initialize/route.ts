import { NextRequest } from "next/server";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  errorResponse,
  forbiddenResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_MARKETING_COMMS } from "@/lib/admin-sections";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit/audit";

const CONFIRM_INIT = "INITIALIZE_ALL";

/**
 * PUT /api/admin/gamification/backfill/initialize
 *
 * Legacy path (Next admin badges page). Same contract as PUT /api/admin/gamification/backfill.
 */
export async function PUT(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_MARKETING_COMMS, request);
    if (user.role !== "superadmin") {
      return forbiddenResponse("Superadmin only");
    }
    const body = (await request.json().catch(() => ({}))) as { confirm?: string };
    if (body.confirm !== CONFIRM_INIT) {
      return errorResponse(
        `Send { "confirm": "${CONFIRM_INIT}" } to run platform-wide initialization.`,
        "VALIDATION_ERROR",
        400
      );
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc("initialize_provider_points_for_all");

    if (error) {
      throw error;
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "gamification_initialize_all",
      entity_type: "platform",
      entity_id: null,
      metadata: { providers_processed: data ?? 0, path: "backfill/initialize" },
    });

    return successResponse({
      message: "Provider points initialized and transactions backfilled successfully",
      providers_processed: data || 0,
    });
  } catch (error) {
    return handleApiError(error, "Failed to initialize provider points");
  }
}
