import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { invalidateAvailabilityCache } from "@/lib/availability/cache-invalidation";

/**
 * POST /api/availability/invalidate
 * 
 * Invalidate availability cache for a specific staff and date
 * This can be called when bookings are created/cancelled to ensure fresh data
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { staffId, date } = body;

    if (!staffId || !date) {
      return handleApiError(
        new Error("staffId and date are required"),
        "staffId and date are required",
        "VALIDATION_ERROR",
        400
      );
    }

    const supabase = await getSupabaseServer();
    await invalidateAvailabilityCache(supabase, staffId, date);

    return successResponse({ message: "Cache invalidated" });
  } catch (error) {
    return handleApiError(error, "Failed to invalidate cache");
  }
}
