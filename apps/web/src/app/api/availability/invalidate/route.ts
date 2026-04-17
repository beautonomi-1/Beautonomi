import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  successResponse,
  handleApiError,
  requireAuthInApi,
} from "@/lib/supabase/api-helpers";
import { invalidateAvailabilityCache } from "@/lib/availability/cache-invalidation";

/**
 * POST /api/availability/invalidate
 *
 * Invalidate availability cache for a specific staff and date.
 * Called by provider-portal flows after booking mutations so the customer
 * booking UI sees fresh slots. §Release-audit 2026-04: previously unauthed,
 * now gated behind any signed-in Supabase user (tenants are still scoped by
 * staff id + RLS).
 */
export async function POST(request: NextRequest) {
  try {
    await requireAuthInApi(request);

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
