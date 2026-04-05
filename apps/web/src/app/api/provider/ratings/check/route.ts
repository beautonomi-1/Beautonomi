import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  getProviderIdForUser,
  successResponse,
  handleApiError,
  requireRoleInApi,
} from "@/lib/supabase/api-helpers";
import { z } from "zod";

const batchCheckSchema = z.object({
  booking_ids: z
    .array(z.string().uuid("Invalid booking ID"))
    .min(1, "At least one booking ID required")
    .max(200, "Maximum 200 booking IDs per request"),
});

/**
 * POST /api/provider/ratings/check
 *
 * Batch-check which bookings already have a provider rating.
 * Replaces N individual GET /api/provider/ratings?booking_id=... calls.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request,
    );
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return handleApiError(
        new Error("Provider not found"),
        "Provider account required",
        403,
      );
    }

    const body = batchCheckSchema.parse(await request.json());
    const { booking_ids } = body;

    const { data: ratings, error } = await supabase
      .from("provider_client_ratings")
      .select("booking_id")
      .eq("provider_id", providerId)
      .in("booking_id", booking_ids);

    if (error) throw error;

    const ratedSet = new Set(ratings?.map((r) => r.booking_id) ?? []);
    const results: Record<string, boolean> = {};
    for (const id of booking_ids) {
      results[id] = ratedSet.has(id);
    }

    return successResponse({ rated: results });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(
        error,
        error.issues.map((e) => e.message).join(", "),
        "VALIDATION_ERROR",
        400,
      );
    }
    return handleApiError(error, "Failed to check ratings");
  }
}
