import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { createPortalToken, getPortalUrl } from "@/lib/portal/token";

/**
 * POST /api/public/bookings/[id]/portal-token
 * 
 * Generate a portal token for a booking (for sending magic link)
 * This endpoint is public but should be rate-limited in production
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: bookingId } = await params;
    const body = await request.json().catch(() => ({}));
    const { expiresInDays, maxUses } = body;

    const adminSupabase = getSupabaseAdmin();

    // Verify booking exists
    const { data: booking, error: bookingError } = await adminSupabase
      .from('bookings')
      .select('id, customer_id')
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      return handleApiError(
        new Error("Booking not found"),
        "Booking not found",
        "NOT_FOUND",
        404
      );
    }

    // Create portal token
    const { token, expiresAt } = await createPortalToken(
      adminSupabase,
      bookingId,
      {
        expiresInDays: expiresInDays || 7,
        maxUses: maxUses || 1,
      }
    );

    // Generate portal URL
    const portalUrl = getPortalUrl(token);

    return successResponse({
      token,
      portalUrl,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    return handleApiError(error, "Failed to create portal token");
  }
}
