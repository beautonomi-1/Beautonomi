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

const CONFIRM_BACKFILL = "BACKFILL_ALL";

/**
 * POST /api/admin/gamification/backfill
 *
 * Platform-wide backfill (superadmin only). Body: { "confirm": "BACKFILL_ALL" }
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_MARKETING_COMMS, request);
    if (user.role !== "superadmin") {
      return forbiddenResponse("Superadmin only");
    }
    const body = (await request.json().catch(() => ({}))) as { confirm?: string };
    if (body.confirm !== CONFIRM_BACKFILL) {
      return errorResponse(
        `Send { "confirm": "${CONFIRM_BACKFILL}" } to run platform-wide backfill.`,
        "VALIDATION_ERROR",
        400
      );
    }

    const supabase = getSupabaseAdmin();

    // Call the backfill function
    const { data, error } = await supabase.rpc('backfill_all_provider_point_transactions');

    if (error) {
      throw error;
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "gamification_backfill_all",
      entity_type: "platform",
      entity_id: null,
      metadata: { total_providers: data?.length ?? 0 },
    });

    return successResponse({
      message: 'Point transactions backfilled successfully',
      results: data || [],
      total_providers: data?.length || 0,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to backfill point transactions');
  }
}
