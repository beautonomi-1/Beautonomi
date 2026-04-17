import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireSuperadmin, successResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * POST /api/admin/gods-eye/retention
 * Superadmin only. Runs purge_old_provider_location_events() to delete pings older than retention_days.
 * Use for manual run or from a cron job (with superadmin auth).
 */
export async function POST(request: NextRequest) {
  try {
    await requireSuperadmin(request);
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.rpc("purge_old_provider_location_events");
    if (error) throw error;
    return successResponse({ deleted: data ?? 0 });
  } catch (error) {
    return handleApiError(error, "Failed to run retention purge");
  }
}
