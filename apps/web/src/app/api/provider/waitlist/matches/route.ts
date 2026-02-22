import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { findWaitlistMatches } from "@/lib/waitlist/matching";

/**
 * GET /api/provider/waitlist/matches
 * 
 * Find waitlist entries that match available slots
 * Used by providers to see which waitlist entries can be booked
 */
export async function GET(request: NextRequest) {
  try {
    const permissionCheck = await requirePermission('view_calendar', request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const { searchParams } = new URL(request.url);
    const providerId = searchParams.get('providerId');
    const date = searchParams.get('date') || undefined;
    const staffId = searchParams.get('staffId') || undefined;
    const maxMatches = parseInt(searchParams.get('maxMatches') || '10');

    if (!providerId) {
      return handleApiError(
        new Error("Provider ID required"),
        "Provider ID is required",
        "VALIDATION_ERROR",
        400
      );
    }

    const supabase = await getSupabaseServer(request);

    // Verify user owns the provider
    const { data: provider, error: providerError } = await supabase
      .from('providers')
      .select('id, user_id')
      .eq('id', providerId)
      .single();

    if (providerError || !provider) {
      return handleApiError(
        new Error("Provider not found"),
        "Provider not found",
        "NOT_FOUND",
        404
      );
    }

    if (provider.user_id !== user.id) {
      return handleApiError(
        new Error("Unauthorized"),
        "You can only view matches for your own provider",
        "UNAUTHORIZED",
        403
      );
    }

    // Find matches
    const matches = await findWaitlistMatches(supabase, providerId, {
      date,
      staffId: staffId || null,
      maxMatches,
    });

    return successResponse({
      matches,
      count: matches.length,
    });
  } catch (error) {
    return handleApiError(error, "Failed to find waitlist matches");
  }
}
