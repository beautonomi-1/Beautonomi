import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * POST /api/admin/gamification/backfill
 * 
 * Backfill point transactions for all providers based on historical bookings and reviews (admin only)
 */
export async function POST(_request: NextRequest) {
  try {
    await requireRoleInApi(['superadmin']);
    const supabase = getSupabaseAdmin();

    // Call the backfill function
    const { data, error } = await supabase.rpc('backfill_all_provider_point_transactions');

    if (error) {
      throw error;
    }

    return successResponse({
      message: 'Point transactions backfilled successfully',
      results: data || [],
      total_providers: data?.length || 0,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to backfill point transactions');
  }
}

/**
 * POST /api/admin/gamification/backfill/initialize
 * 
 * Initialize points and backfill transactions for all providers (admin only)
 */
export async function PUT(_request: NextRequest) {
  try {
    await requireRoleInApi(['superadmin']);
    const supabase = getSupabaseAdmin();

    // Call the initialization function which now includes backfilling
    const { data, error } = await supabase.rpc('initialize_provider_points_for_all');

    if (error) {
      throw error;
    }

    return successResponse({
      message: 'Provider points initialized and transactions backfilled successfully',
      providers_processed: data || 0,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to initialize provider points');
  }
}
