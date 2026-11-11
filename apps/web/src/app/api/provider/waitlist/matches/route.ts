import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getProviderIdForUser, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { hasPermission } from "@/lib/auth/permissions";
import { redactBookingCustomerContacts } from "@/lib/provider/redact-booking-customer-contact";
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
    const canViewClients =
      user.role === "superadmin" ||
      (await hasPermission(user.id, "view_clients", undefined, request));
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

    const userProviderId = await getProviderIdForUser(user.id, supabase);
    if (!userProviderId || userProviderId !== providerId) {
      return handleApiError(
        new Error("Unauthorized"),
        "You can only view matches for your provider",
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
      matches: redactBookingCustomerContacts(matches, canViewClients),
      count: matches.length,
    });
  } catch (error) {
    return handleApiError(error, "Failed to find waitlist matches");
  }
}
