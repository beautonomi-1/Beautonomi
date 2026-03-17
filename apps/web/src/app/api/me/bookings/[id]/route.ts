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

    const supabase = await getSupabaseServer(request);
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

    type BookingDataRow = Record<string, unknown> & {
      id: string; booking_number?: string; status?: string; current_stage?: string;
      estimated_arrival?: string; provider_en_route_at?: string; provider_arrived_at?: string;
      provider_location?: unknown; scheduled_at?: string; location_type?: string;
      total_amount?: number; currency?: string; total_paid?: number;
      booking_services?: unknown[]; booking_addons?: unknown[]; booking_products?: unknown[];
      additional_charges?: unknown[]; arrival_otp_verified?: boolean; arrival_otp_expires_at?: string;
      arrival_otp?: string;
      address_line1?: string; address_line2?: string; address_city?: string; address_state?: string;
      address_country?: string; address_postal_code?: string; address_latitude?: number; address_longitude?: number;
      location?: { name?: string; address_line1?: string; address_line2?: string; city?: string; country?: string };
      special_requests?: string; group_booking_id?: string; group_bookings?: { ref_number?: string };
      provider?: { id: string; business_name?: string; slug?: string; phone?: string; email?: string };
    };
    const bookingData = booking as BookingDataRow;
    const transformedBooking = {
      id: bookingData.id,
      booking_number: bookingData.booking_number,
      status: bookingData.status,
      current_stage: bookingData.current_stage ?? undefined,
      estimated_arrival: bookingData.estimated_arrival ?? undefined,
      provider_en_route_at: bookingData.provider_en_route_at ?? undefined,
      provider_arrived_at: bookingData.provider_arrived_at ?? undefined,
      provider_location: bookingData.provider_location ?? undefined,
      selected_datetime: bookingData.scheduled_at,
      location_type: bookingData.location_type === "at_salon" ? "at_salon" : "at_home",
      total_amount: bookingData.total_amount,
      currency: bookingData.currency,
      services: (bookingData.booking_services ?? []).map((bs: unknown) => {
        const b = bs as { id: string; offering_id?: string; staff_id?: string; duration_minutes?: number; price?: number; guest_name?: string; offering?: { title?: string; duration_minutes?: number; price?: number }; staff?: { name?: string } };
        return ({
        id: b.id,
        offering_id: b.offering_id,
        offering_name: b.offering?.title ?? "Service",
        staff_id: b.staff_id,
        staff_name: b.staff?.name ?? null,
        duration_minutes: b.duration_minutes ?? b.offering?.duration_minutes ?? 0,
        price: b.price ?? b.offering?.price ?? 0,
        guest_name: b.guest_name ?? undefined,
      }); }),
      addons: (bookingData.booking_addons ?? []).map((ba: unknown) => {
        const a = ba as { id: string; addon_id?: string; price?: number; offering?: { title?: string; price?: number } };
        return { id: a.id, offering_id: a.addon_id, offering_name: a.offering?.title ?? "Addon", price: a.price ?? a.offering?.price ?? 0 };
      }),
      products: (bookingData.booking_products ?? []).map((bp: unknown) => {
        const p = bp as { id: string; product_id?: string; quantity?: number; unit_price?: number; total_price?: number; products?: { name?: string; retail_price?: number } };
        return { id: p.id, product_id: p.product_id, product_name: p.products?.name ?? "Product", quantity: p.quantity ?? 1, unit_price: p.unit_price ?? p.products?.retail_price ?? 0, total_price: p.total_price ?? (p.unit_price ?? p.products?.retail_price ?? 0) * (p.quantity ?? 1) };
      }),
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
        name: (bookingData.location as { name?: string }).name,
        address: [
          (bookingData.location as { address_line1?: string }).address_line1,
          (bookingData.location as { address_line2?: string }).address_line2,
          (bookingData.location as { city?: string }).city,
          (bookingData.location as { country?: string }).country,
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
      group_booking_ref: (bookingData.group_bookings as { ref_number?: string } | undefined)?.ref_number ?? null,
      provider: bookingData.provider ? {
        id: bookingData.provider.id,
        business_name: bookingData.provider.business_name,
        slug: bookingData.provider.slug,
        phone: bookingData.provider.phone,
        email: bookingData.provider.email,
      } : undefined,
      additional_charges: (bookingData.additional_charges ?? []).map((ac: unknown) => {
        const a = ac as { id: string; description?: string; amount?: number; currency?: string; status?: string; requested_at?: string; paid_at?: string };
        return {
        id: a.id,
        description: a.description,
        amount: Number(a.amount),
        currency: a.currency,
        status: a.status,
        requested_at: a.requested_at,
        paid_at: a.paid_at,
      }; }),
      outstanding_balance: (() => {
        const bookingTotal = Number(bookingData.total_amount ?? 0);
        const totalPaid = Number(bookingData.total_paid ?? 0);
        type AcRow = { status?: string; amount?: number };
        const unpaidCharges = (bookingData.additional_charges ?? [])
          .filter((ac: AcRow) => ac.status !== "paid" && ac.status !== "rejected")
          .reduce((sum: number, ac: AcRow) => sum + Number(ac.amount ?? 0), 0);
        return Math.max(0, bookingTotal + unpaidCharges - totalPaid);
      })(),
      // Arrival verification (customer-holds-PIN: customer needs these to show PIN and countdown)
      arrival_otp_verified: bookingData.arrival_otp_verified ?? false,
      arrival_otp_expires_at: bookingData.arrival_otp_expires_at ?? undefined,
      // Expose arrival_otp only when customer must display it (at_home, arrived, not yet verified)
      ...(bookingData.location_type === "at_home" &&
        bookingData.current_stage === "provider_arrived" &&
        !bookingData.arrival_otp_verified &&
        bookingData.arrival_otp != null && {
        arrival_otp: bookingData.arrival_otp,
      }),
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
