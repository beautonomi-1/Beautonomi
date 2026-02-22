import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { recalculateProviderGamification } from "@/lib/services/provider-gamification";

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
    await requireRoleInApi(['superadmin']);
    const { id: providerId } = await params;

    const result = await recalculateProviderGamification(providerId);

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
