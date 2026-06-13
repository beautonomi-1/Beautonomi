import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  notFoundResponse,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_USERS_TRUST } from "@/lib/admin-sections";
import { mintGuestPortalTokenForBooking } from "@/lib/portal/guest-booking-link-delivery";

/**
 * POST /api/admin/users/[id]/guest-booking-link
 *
 * Mints a guest portal link for the user's next upcoming booking (falls back
 * to the most recent one). Lets support copy/share the tokenized portal URL
 * with guest/shadow customers who can't receive it by email or SMS.
 * Optional body: { booking_id } to target a specific booking.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminSection(ADMIN_SECTION_USERS_TRUST, request);
    const { id } = await params;
    const supabaseAdmin = getSupabaseAdmin();

    const body = (await request.json().catch(() => ({}))) as { booking_id?: string };

    const { data: userRow } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (!userRow?.id) {
      return notFoundResponse("User not found");
    }

    type BookingRow = {
      id: string;
      booking_number: string | null;
      scheduled_at: string;
      status: string;
    };

    let booking: BookingRow | null = null;

    if (body.booking_id) {
      const { data } = await supabaseAdmin
        .from("bookings")
        .select("id, booking_number, scheduled_at, status")
        .eq("id", body.booking_id)
        .eq("customer_id", id)
        .maybeSingle();
      booking = (data as BookingRow | null) ?? null;
    } else {
      // Prefer the next upcoming active booking…
      const { data: upcoming } = await supabaseAdmin
        .from("bookings")
        .select("id, booking_number, scheduled_at, status")
        .eq("customer_id", id)
        .gte("scheduled_at", new Date().toISOString())
        .not("status", "in", "(cancelled,no_show)")
        .order("scheduled_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      booking = (upcoming as BookingRow | null) ?? null;

      // …otherwise fall back to the most recent booking.
      if (!booking) {
        const { data: recent } = await supabaseAdmin
          .from("bookings")
          .select("id, booking_number, scheduled_at, status")
          .eq("customer_id", id)
          .order("scheduled_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        booking = (recent as BookingRow | null) ?? null;
      }
    }

    if (!booking) {
      return errorResponse("No bookings found for this user", "NO_BOOKINGS", 404);
    }

    const { portalUrl } = await mintGuestPortalTokenForBooking(
      supabaseAdmin,
      booking.id,
      booking.scheduled_at,
    );

    return successResponse({
      portal_url: portalUrl,
      booking_id: booking.id,
      booking_number: booking.booking_number,
      scheduled_at: booking.scheduled_at,
      status: booking.status,
    });
  } catch (error) {
    return handleApiError(error, "Failed to create guest booking link");
  }
}
