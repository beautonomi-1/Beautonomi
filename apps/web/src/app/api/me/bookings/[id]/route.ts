import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi } from "@/lib/supabase/api-helpers";
/**
 * GET /api/me/bookings/[id]
 * 
 * Get a specific booking by ID
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRoleInApi(["customer", "provider_owner", "provider_staff", "superadmin"], request);

    const supabase = await getSupabaseServer();
    const { id } = await params;

    const { data: booking, error } = await supabase
      .from("bookings")
      .select(`
        *,
        version,
        provider:providers(
          id,
          business_name,
          slug,
          phone,
          email
        ),
        group_bookings(ref_number),
        location:provider_locations(
          id,
          name,
          address_line1,
          address_line2,
          city,
          country
        ),
        booking_services:booking_services(
          id,
          offering_id,
          staff_id,
          duration_minutes,
          price,
          guest_name,
          offering:offerings(
            id,
            title,
            duration_minutes,
            price
          ),
          staff:provider_staff(
            id,
            name
          )
        ),
        booking_addons:booking_addons(
          id,
          addon_id,
          quantity,
          price,
          offering:offerings(
            id,
            title,
            price
          )
        ),
        booking_products:booking_products(
          id,
          product_id,
          quantity,
          unit_price,
          total_price,
          products:products!booking_products_product_id_fkey(
            id,
            name,
            retail_price
          )
        ),
        additional_charges:additional_charges(
          id,
          description,
          amount,
          currency,
          status,
          requested_at,
          paid_at
        )
      `)
      .eq("id", id)
      .eq("customer_id", auth.user.id)
      .single();

    if (error || !booking) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Booking not found",
            code: "NOT_FOUND",
          },
        },
        { status: 404 }
      );
    }

    // Transform booking data to match confirmation page format
    const bookingData = booking as any;
    const transformedBooking = {
      id: bookingData.id,
      booking_number: bookingData.booking_number,
      status: bookingData.status,
      selected_datetime: bookingData.scheduled_at,
      location_type: bookingData.location_type === "at_salon" ? "at_salon" : "at_home",
      total_amount: bookingData.total_amount,
      currency: bookingData.currency,
      services: (bookingData.booking_services || []).map((bs: any) => ({
        id: bs.id,
        offering_id: bs.offering_id,
        offering_name: bs.offering?.title || "Service",
        staff_id: bs.staff_id,
        staff_name: bs.staff?.name || null,
        duration_minutes: bs.duration_minutes || bs.offering?.duration_minutes || 0,
        price: bs.price || bs.offering?.price || 0,
        guest_name: bs.guest_name || undefined,
      })),
      addons: (bookingData.booking_addons || []).map((ba: any) => ({
        id: ba.id,
        offering_id: ba.addon_id, // Note: addon_id references offerings table
        offering_name: ba.offering?.title || "Addon",
        price: ba.price || ba.offering?.price || 0,
      })),
      products: (bookingData.booking_products || []).map((bp: any) => ({
        id: bp.id,
        product_id: bp.product_id,
        product_name: bp.products?.name || "Product",
        quantity: bp.quantity || 1,
        unit_price: bp.unit_price || bp.products?.retail_price || 0,
        total_price: bp.total_price || (bp.unit_price || bp.products?.retail_price || 0) * (bp.quantity || 1),
      })),
      address: bookingData.location_type === "at_home" && bookingData.address_line1 ? {
        line1: bookingData.address_line1 || "",
        line2: bookingData.address_line2 || undefined,
        city: bookingData.address_city || "",
        state: bookingData.address_state || undefined,
        country: bookingData.address_country || "",
        postal_code: bookingData.address_postal_code || undefined,
        latitude: bookingData.address_latitude || undefined,
        longitude: bookingData.address_longitude || undefined,
      } : null,
      location: bookingData.location ? {
        name: bookingData.location.name,
        address: [
          bookingData.location.address_line1,
          bookingData.location.address_line2,
          bookingData.location.city,
          bookingData.location.country,
        ].filter(Boolean).join(", "),
      } : undefined,
      client_info: {
        first_name: auth.user.user_metadata?.first_name || "",
        last_name: auth.user.user_metadata?.last_name || "",
        email: auth.user.email || "",
        phone: auth.user.user_metadata?.phone || "",
      },
      special_requests: bookingData.special_requests,
      is_group_booking: !!bookingData.group_booking_id,
      group_booking_ref: bookingData.group_bookings?.ref_number ?? null,
      provider: bookingData.provider ? {
        id: bookingData.provider.id,
        business_name: bookingData.provider.business_name,
        slug: bookingData.provider.slug,
        phone: bookingData.provider.phone,
        email: bookingData.provider.email,
      } : undefined,
      additional_charges: (bookingData.additional_charges || []).map((ac: any) => ({
        id: ac.id,
        description: ac.description,
        amount: Number(ac.amount),
        currency: ac.currency,
        status: ac.status,
        requested_at: ac.requested_at,
        paid_at: ac.paid_at,
      })),
      // Calculate outstanding balance (original booking + unpaid additional charges - total_paid)
      outstanding_balance: (() => {
        const bookingTotal = Number(bookingData.total_amount || 0);
        const totalPaid = Number(bookingData.total_paid || 0);
        const unpaidCharges = (bookingData.additional_charges || [])
          .filter((ac: any) => ac.status !== 'paid' && ac.status !== 'rejected')
          .reduce((sum: number, ac: any) => sum + Number(ac.amount || 0), 0);
        return Math.max(0, bookingTotal + unpaidCharges - totalPaid);
      })(),
    };

    return NextResponse.json({
      data: transformedBooking,
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/me/bookings/[id]:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to fetch booking",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
