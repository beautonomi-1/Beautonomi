import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDERS_OPERATIONS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { awardProviderPoints, recalculateProviderGamification } from "@/lib/services/provider-gamification";

/**
 * POST /api/admin/providers/[id]/gamification/deduct
 * Deduct points from a provider and recalculate badge.
 * Body: { points: number, reason: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_PROVIDERS_OPERATIONS, request);
    const tenantId = await resolveAdminApiTenantId(request);
    const { id: providerId } = await params;
    const body = await request.json();

    const points = typeof body.points === "number" ? Math.abs(body.points) : 0;
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";

    if (points <= 0) {
      return errorResponse("points must be a positive number", "VALIDATION_ERROR", 400);
    }
    if (!reason) {
      return errorResponse("reason is required", "VALIDATION_ERROR", 400);
    }

    const supabase = getSupabaseAdmin();

    const { data: provider, error: providerError } = await supabase
      .from("providers")
      .select("id, business_name, tenant_id")
      .eq("id", providerId)
      .single();

    if (providerError || !provider) {
      return errorResponse("Provider not found", "NOT_FOUND", 404);
    }
    if ((provider as { tenant_id?: string }).tenant_id !== tenantId) {
      return errorResponse("Provider not found", "NOT_FOUND", 404);
    }

    const newTotal = await awardProviderPoints(
      providerId,
      -points,
      "admin_penalty",
      undefined,
      `Points deducted by admin (${user.id}): ${reason}`
    );

    const result = await recalculateProviderGamification(providerId);

    return successResponse({
      provider_id: providerId,
      points_deducted: points,
      new_total_points: newTotal,
      new_badge_id: result.badge_id,
      reason,
    });
  } catch (error) {
    return handleApiError(error, "Failed to deduct points");
  }
}
