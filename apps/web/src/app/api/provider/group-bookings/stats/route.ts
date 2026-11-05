import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { computeCompletedGroupBookingStats } from "@/lib/bookings/group-booking-completed-stats";

export const maxDuration = 30;

/** GET /api/provider/group-bookings/stats — aggregate completed-group metrics (lazy-loaded). */
export async function GET(request: NextRequest) {
  try {
    const permissionCheck = await requirePermission("view_calendar", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;

    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const admin = getSupabaseAdmin();
    const stats = await computeCompletedGroupBookingStats(admin, providerId);
    return successResponse({ stats });
  } catch (error) {
    return handleApiError(error, "Failed to fetch group booking stats");
  }
}
