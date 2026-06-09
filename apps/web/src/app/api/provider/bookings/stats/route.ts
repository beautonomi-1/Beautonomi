import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  computeBookingsStats,
  type BookingsStatsRange,
} from "@/lib/server/provider/bookings-stats";

const VALID_RANGES = new Set<BookingsStatsRange>(["today", "week", "month", "all"]);

/**
 * GET /api/provider/bookings/stats?range=today|week|month|all&location_id=
 *
 * Operational booking stats with booked GMV (scheduled_at) and recognized ledger revenue.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request,
    );
    const supabaseAdmin = getSupabaseAdmin();
    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");

    const rangeParam = request.nextUrl.searchParams.get("range") ?? "today";
    if (!VALID_RANGES.has(rangeParam as BookingsStatsRange)) {
      return errorResponse("Invalid range", "VALIDATION_ERROR", 400);
    }
    const locationId = request.nextUrl.searchParams.get("location_id")?.trim() || undefined;

    const stats = await computeBookingsStats(
      supabaseAdmin,
      providerId,
      rangeParam as BookingsStatsRange,
      locationId,
    );

    return successResponse(stats);
  } catch (error) {
    return handleApiError(error, "Failed to fetch booking stats");
  }
}
