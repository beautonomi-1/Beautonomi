import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, successResponse, notFoundResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/admin/bookings/[id]
 *
 * Get detailed booking information. Uses admin client so superadmin always sees any booking.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRoleInApi(['superadmin'], request);

    const { id } = await params;
    const supabase = getSupabaseAdmin();

    // Get booking with related data
    const { data: booking, error } = await supabase
      .from("bookings")
      .select(`
        *,
        customer:users!bookings_customer_id_fkey(id, full_name, email, phone, avatar_url),
        provider:providers!bookings_provider_id_fkey(id, business_name, slug, email, phone),
        location:provider_locations(id, name, address_line1, city, country),
        booking_services(
          id,
          offering_id,
          staff_id,
          duration_minutes,
          price,
          scheduled_start_at,
          scheduled_end_at,
          offerings:offerings!booking_services_offering_id_fkey(id, title)
        ),
        booking_products(
          id,
          product_id,
          quantity,
          unit_price,
          total_price,
          products:products!booking_products_product_id_fkey(id, name, retail_price)
        )
      `)
      .eq("id", id)
      .single();

    if (error || !booking) {
      return notFoundResponse("Booking not found");
    }

    // Get payment transaction if exists
    const { data: transaction } = await supabase
      .from("payment_transactions")
      .select("*")
      .eq("booking_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    return successResponse({
      ...(booking as any),
      payment_transaction: transaction || null,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch booking");
  }
}

/**
 * PATCH /api/admin/bookings/[id]
 *
 * Update booking details
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRoleInApi(['superadmin'], request);
    const { id } = await params;
    const supabase = getSupabaseAdmin();
    const body = await request.json();

    // Verify booking exists
    const { data: booking } = await supabase
      .from("bookings")
      .select("id, status")
      .eq("id", id)
      .single();

    if (!booking) {
      return notFoundResponse("Booking not found");
    }

    // Prepare update data
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (body.status !== undefined) updateData.status = body.status;
    if (body.scheduled_at !== undefined) updateData.scheduled_at = body.scheduled_at;
    if (body.location_id !== undefined) updateData.location_id = body.location_id;
    if (body.location_type !== undefined) updateData.location_type = body.location_type;
    if (body.address_line1 !== undefined) updateData.address_line1 = body.address_line1;
    if (body.address_line2 !== undefined) updateData.address_line2 = body.address_line2;
    if (body.city !== undefined) updateData.city = body.city;
    if (body.country !== undefined) updateData.country = body.country;
    if (body.total_amount !== undefined) updateData.total_amount = body.total_amount;
    if (body.notes !== undefined) updateData.notes = body.notes;

    // Update booking
    const { data: updatedBooking, error: updateError } = await supabase
      .from("bookings")
      .update(updateData)
      .eq("id", id)
      .select(`
        *,
        customer:users!bookings_customer_id_fkey(id, full_name, email, phone, avatar_url),
        provider:providers!bookings_provider_id_fkey(id, business_name, slug, email, phone),
        location:provider_locations(id, name, address_line1, city, country),
        booking_services(
          id,
          offering_id,
          staff_id,
          duration_minutes,
          price,
          scheduled_start_at,
          scheduled_end_at,
          offerings:offerings!booking_services_offering_id_fkey(id, title)
        ),
        booking_products(
          id,
          product_id,
          quantity,
          unit_price,
          total_price,
          products:products!booking_products_product_id_fkey(id, name, retail_price)
        )
      `)
      .single();

    if (updateError || !updatedBooking) {
      return handleApiError(updateError, "Failed to update booking");
    }

    // Notify customer if status changed
    if (body.status && body.status !== booking.status) {
      try {
        const { sendToUser } = await import("@/lib/notifications/onesignal");
        const { data: bookingData } = await supabase
          .from("bookings")
          .select("customer_id, booking_number")
          .eq("id", id)
          .single();

        if (bookingData) {
          await sendToUser((bookingData as any).customer_id, {
            title: "Booking Updated",
            message: `Your booking ${(bookingData as any).booking_number} has been updated.`,
            data: {
              type: "booking_updated",
              booking_id: id,
            },
            url: `/account-settings/bookings/${id}`,
          });
        }
      } catch (notifError) {
        console.error("Error sending notification:", notifError);
      }
    }

    return successResponse(updatedBooking);
  } catch (error) {
    return handleApiError(error, "Failed to update booking");
  }
}
