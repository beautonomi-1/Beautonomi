import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, handleApiError } from "@/lib/supabase/api-helpers";
import { generateICSText } from "@/lib/calendar/ics";

/**
 * GET /api/me/bookings/[id]/calendar.ics
 *
 * Returns an .ics file for the booking so the customer can add it to their calendar.
 * Requires auth (customer or provider viewing the booking).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRoleInApi(["customer", "provider_owner", "provider_staff", "superadmin"], request);

    const supabase = await getSupabaseServer(request);
    const { id: bookingId } = await params;

    const query = supabase
      .from("bookings")
      .select(
        `
        id,
        booking_number,
        scheduled_at,
        location_type,
        provider:providers(business_name),
        location:provider_locations(name, address_line1, address_line2, city, country),
        address_line1,
        address_city,
        address_country,
        booking_services:booking_services(
          duration_minutes,
          offering:offerings(title, duration_minutes)
        )
      `
      )
      .eq("id", bookingId);

    const { data: booking, error } = await ((auth.user as { role?: string }).role === "customer"
      ? query.eq("customer_id", auth.user.id)
      : query
    ).single();

    if (error || !booking) {
      return handleApiError(
        new Error("Booking not found"),
        "Booking not found",
        "NOT_FOUND",
        404
      );
    }

    const provider = booking.provider as { business_name?: string } | null;
    const location = booking.location as {
      name?: string;
      address_line1?: string;
      address_line2?: string;
      city?: string;
      country?: string;
    } | null;
    const services = (booking.booking_services as Array<{ duration_minutes?: number; offering?: { title?: string; duration_minutes?: number } }>) ?? [];

    const totalMinutes = services.reduce(
      (sum, s) => sum + (s.duration_minutes ?? s.offering?.duration_minutes ?? 0),
      0
    );
    const start = new Date(booking.scheduled_at);
    const end = new Date(start.getTime() + totalMinutes * 60 * 1000);

    const locationStr =
      booking.location_type === "at_salon" && location
        ? [location.name, location.address_line1, location.address_line2, location.city, location.country]
            .filter(Boolean)
            .join(", ") || "Salon"
        : booking.address_line1
          ? [booking.address_line1, booking.address_city, booking.address_country].filter(Boolean).join(", ")
          : "Address TBD";

    const title = `Appointment with ${provider?.business_name ?? "Beautonomi"}`;
    const description = `Booking #${booking.booking_number}\n${services.map((s) => `${s.offering?.title ?? "Service"} (${s.duration_minutes ?? s.offering?.duration_minutes ?? 0} min)`).join("\n")}`;

    const ics = generateICSText({
      title,
      description,
      location: locationStr,
      start,
      end,
    });

    const filename = `booking-${booking.booking_number ?? bookingId}.ics`;

    return new Response(ics, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (err) {
    return handleApiError(err, "Failed to generate calendar file");
  }
}
