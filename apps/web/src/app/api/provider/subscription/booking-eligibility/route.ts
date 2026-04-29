import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
} from "@/lib/supabase/api-helpers";
import { checkBookingLimit } from "@/lib/subscriptions/limit-checker";
import { formatProviderPortalLimitMessage } from "@/lib/subscriptions/subscription-limit-messages";

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
    const providerId = await getProviderIdForUser(user.id, supabase);

    const bookingLimit = await checkBookingLimit(providerId, supabase);

    return successResponse({
      can_accept_online_bookings: bookingLimit.canProceed,
      booking_limit_message: bookingLimit.canProceed
        ? null
        : formatProviderPortalLimitMessage(bookingLimit, "Subscription"),
      internal_reason: bookingLimit.canProceed ? null : bookingLimit.reason,
    });
  } catch (error) {
    return handleApiError(error, "Failed to check booking eligibility");
  }
}
