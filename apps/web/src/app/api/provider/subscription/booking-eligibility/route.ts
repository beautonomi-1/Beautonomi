import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  notFoundResponse,
  getProviderIdForUser,
} from "@/lib/supabase/api-helpers";
import { checkBookingLimit, providerBookingEligibilityFromLimit } from "@/lib/subscriptions/limit-checker";

/**
 * GET /api/provider/subscription/booking-eligibility
 *
 * Whether this business can accept new online bookings (plan / subscription limits).
 * For dashboard banners and settings — does not change GET /api/provider/subscription shape.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request
    );
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase, { request });
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Service role reads plan rows directly if can_provider_create_booking fails.
    const bookingLimit = await checkBookingLimit(providerId, getSupabaseAdmin());
    const eligibility = providerBookingEligibilityFromLimit(bookingLimit);

    return successResponse({
      can_accept_online_bookings: eligibility.can_accept_online_bookings,
      booking_limit_message: eligibility.booking_limit_message,
      internal_reason: eligibility.internal_reason,
    });
  } catch (error) {
    return handleApiError(error, "Failed to check booking eligibility");
  }
}
