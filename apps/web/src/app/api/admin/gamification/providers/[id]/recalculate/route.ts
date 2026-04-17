import { NextRequest } from "next/server";
import { requireAdminSection, successResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_MARKETING_COMMS } from "@/lib/admin-sections";
import { recalculateProviderGamification } from "@/lib/services/provider-gamification";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

/**
 * POST /api/admin/gamification/providers/[id]/recalculate
 * 
 * Manually recalculate gamification for a specific provider (admin only)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_MARKETING_COMMS, request);
    const { id: providerId } = await params;

    const result = await recalculateProviderGamification(providerId);

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: "admin.gamification.recalculate",
      entity_type: "provider",
      entity_id: providerId,
      module: "marketing_comms",
      risk_level: "low",
      retention_tier: "routine",
      metadata: { points: result.points, badge_id: result.badge_id },
      ...extractRequestMeta(request),
    });

    return successResponse({
      message: 'Gamification recalculated successfully',
      provider_id: providerId,
      points: result.points,
      badge_id: result.badge_id,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to recalculate gamification');
  }
}
