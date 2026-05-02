import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi } from "@/lib/supabase/api-helpers";
import { computeBookingOutstandingDisplay } from "@/lib/bookings/display-invariants";
import { resolveBookingDisplayTimeZone } from "@/lib/bookings/display-datetime";
/**
 * GET /api/me/bookings/[id]
 *
 * Get a specific booking by ID.
 * @tenant-hint Service-role read is scoped with .eq("customer_id", auth.user.id) (customer self); not a cross-tenant listing.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRoleInApi(["customer", "provider_owner", "provider_staff", "superadmin"], request);

    // Service-role read scoped to this customer — same reliability as GET /api/me/bookings list.
    const supabase = getSupabaseAdmin();
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
          email,
          timezone
        ),
        group_bookings!bookings_group_booking_id_fkey(ref_number),
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
          addon_name,
          quantity,
          price
        ),
        booking_products:booking_products(
          id,
          product_id,
          product_variant_id,
          quantity,
          unit_price,
          total_price,
          products:products!booking_products_product_id_fkey(
            id,
            name,
            retail_price
          ),
          product_variant:product_variants(id, option_values)
        ),
        additional_charges:additional_charges(
          id,
          description,
          amount,
          currency,
          status,
          requested_at,
          paid_at
        ),
        service_packages:package_id(id, name)
      `)
      .eq("id", id)
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

    // Security: must be the customer themselves, the provider owner, or an active staff member
    const bookingRow = booking as Record<string, unknown>;
    const isCustomer = bookingRow.customer_id === auth.user.id;
    if (!isCustomer) {
      // Check if requester is the provider's owner
      const { data: providerOwner } = await supabase
        .from("providers")
        .select("user_id")
        .eq("id", bookingRow.provider_id as string)
        .maybeSingle();

      const isProviderOwner = (providerOwner as { user_id?: string } | null)?.user_id === auth.user.id;

      if (!isProviderOwner) {
        // Check if requester is active staff for this provider
        const { data: staffRow } = await supabase
          .from("provider_staff")
          .select("id")
          .eq("user_id", auth.user.id)
          .eq("provider_id", bookingRow.provider_id as string)
          .eq("is_active", true)
          .maybeSingle();

        if (!staffRow) {
          return NextResponse.json(
            { data: null, error: { message: "Booking not found", code: "NOT_FOUND" } },
            { status: 404 }
          );
        }
      }
    }

    type BookingDataRow = Record<string, unknown> & {
      id: string; booking_number?: string; status?: string; current_stage?: string;
      estimated_arrival?: string; provider_en_route_at?: string; provider_arrived_at?: string;
      provider_location?: unknown; scheduled_at?: string; location_type?: string;
      total_amount?: number; currency?: string; total_paid?: number;
      booking_services?: unknown[]; booking_addons?: unknown[]; booking_products?: unknown[];
      additional_charges?: unknown[]; arrival_otp_verified?: boolean; arrival_otp_expires_at?: string;
      arrival_otp?: string;
      qr_code_data?: unknown;
      qr_code_verified?: boolean;
      qr_code_expires_at?: string | null;
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
      scheduled_at: bookingData.scheduled_at,
      completed_at: (bookingData as Record<string, unknown>).completed_at ?? undefined,
      location_type: bookingData.location_type === "at_salon" ? "at_salon" : "at_home",
      // Financial fields — all guarded with Number() to prevent undefined.toFixed() crashes
      subtotal: Number((bookingData as Record<string, unknown>).subtotal ?? 0),
      tip_amount: Number((bookingData as Record<string, unknown>).tip_amount ?? 0),
      discount_amount: Number((bookingData as Record<string, unknown>).discount_amount ?? 0),
      discount_code: (bookingData as Record<string, unknown>).discount_code ?? undefined,
      discount_reason: (bookingData as Record<string, unknown>).discount_reason ?? undefined,
      promotion_discount_amount: Number((bookingData as Record<string, unknown>).promotion_discount_amount ?? 0),
      gift_card_amount: Number((bookingData as Record<string, unknown>).gift_card_amount ?? 0),
      wallet_amount: Number((bookingData as Record<string, unknown>).wallet_amount ?? 0),
      loyalty_discount_amount: Number((bookingData as Record<string, unknown>).loyalty_discount_amount ?? 0),
      loyalty_points_redeemed: Number((bookingData as Record<string, unknown>).loyalty_points_redeemed ?? 0),
      membership_discount_amount: Number((bookingData as Record<string, unknown>).membership_discount_amount ?? 0),
      membership_discount_percentage: Number((bookingData as Record<string, unknown>).membership_discount_percentage ?? 0),
      travel_fee: Number((bookingData as Record<string, unknown>).travel_fee ?? 0),
      tax_amount: Number((bookingData as Record<string, unknown>).tax_amount ?? 0),
      tax_rate: Number((bookingData as Record<string, unknown>).tax_rate ?? 0),
      platform_fee_amount: Number((bookingData as Record<string, unknown>).platform_fee_amount ?? (bookingData as Record<string, unknown>).service_fee_amount ?? 0),
      platform_fee_percentage: Number((bookingData as Record<string, unknown>).platform_fee_percentage ?? (bookingData as Record<string, unknown>).service_fee_percentage ?? 0),
      platform_service_fee: Number((bookingData as Record<string, unknown>).platform_fee_amount ?? (bookingData as Record<string, unknown>).platform_service_fee ?? (bookingData as Record<string, unknown>).service_fee_amount ?? 0),
      service_fee_amount: Number((bookingData as Record<string, unknown>).platform_fee_amount ?? (bookingData as Record<string, unknown>).service_fee_amount ?? 0),
      service_fee_percentage: Number((bookingData as Record<string, unknown>).platform_fee_percentage ?? (bookingData as Record<string, unknown>).service_fee_percentage ?? 0),
      total_amount: Number(bookingData.total_amount ?? 0),
      total_paid: Number((bookingData as Record<string, unknown>).total_paid ?? 0),
      total_refunded: Number((bookingData as Record<string, unknown>).total_refunded ?? 0),
      cancellation_fee: Number((bookingData as Record<string, unknown>).cancellation_fee ?? 0),
      loyalty_points_earned: Number((bookingData as Record<string, unknown>).loyalty_points_earned ?? 0),
      loyalty_points_used: Number((bookingData as Record<string, unknown>).loyalty_points_used ?? 0),
      currency: bookingData.currency ?? "ZAR",
      payment_status: bookingData.payment_status as string | undefined,
      payment_method_id: (bookingData as Record<string, unknown>).payment_method_id ?? undefined,
      payment_reference: (bookingData as { payment_reference?: string }).payment_reference ?? undefined,
      payment_date: (bookingData as Record<string, unknown>).payment_date ?? undefined,
      notes: (bookingData as Record<string, unknown>).notes ?? undefined,
      cancellation_reason: (bookingData as Record<string, unknown>).cancellation_reason ?? undefined,
      cancelled_at: (bookingData as Record<string, unknown>).cancelled_at ?? undefined,
      booking_source: (bookingData as Record<string, unknown>).booking_source ?? undefined,
      package_id: ((bookingData as Record<string, unknown>).package_id as string | null | undefined) ?? null,
      package_name: (() => {
        const sp = (bookingData as Record<string, unknown>).service_packages as
          | { name?: string | null }
          | Array<{ name?: string | null }>
          | null
          | undefined;
        const row = Array.isArray(sp) ? sp[0] : sp;
        return row?.name ?? null;
      })(),
      payment_provider: (bookingData as Record<string, unknown>).payment_provider ?? undefined,
      services: (bookingData.booking_services ?? []).map((bs: unknown) => {
        const b = bs as { id: string; offering_id?: string; staff_id?: string; duration_minutes?: number; price?: number; guest_name?: string; offering?: { title?: string; duration_minutes?: number; price?: number }; staff?: { name?: string } };
        const offeringName = b.offering?.title ?? "Service";
        const durationMins = b.duration_minutes ?? b.offering?.duration_minutes ?? 0;
        return ({
        id: b.id,
        offering_id: b.offering_id,
        offering_name: offeringName,
        title: offeringName,
        staff_id: b.staff_id,
        staff_name: b.staff?.name ?? null,
        duration_minutes: durationMins,
        duration: durationMins,
        price: b.price ?? b.offering?.price ?? 0,
        guest_name: b.guest_name ?? undefined,
      }); }),
      addons: (bookingData.booking_addons ?? []).map((ba: unknown) => {
        const a = ba as { id: string; addon_id?: string; addon_name?: string; quantity?: number; price?: number };
        return { id: a.id, offering_id: a.addon_id, offering_name: a.addon_name || "Add-on", quantity: a.quantity ?? 1, price: a.price ?? 0 };
      }),
      products: (bookingData.booking_products ?? []).map((bp: unknown) => {
        const p = bp as {
          id: string;
          product_id?: string;
          quantity?: number;
          unit_price?: number;
          total_price?: number;
          products?: { name?: string; retail_price?: number };
          product_variant?: { option_values?: Record<string, unknown> | null };
        };
        const ov = p.product_variant?.option_values;
        const variantLabel =
          ov && typeof ov === "object"
            ? ` · ${Object.values(ov).join(" / ")}`
            : "";
        return {
          id: p.id,
          product_id: p.product_id,
          product_name: `${p.products?.name ?? "Product"}${variantLabel}`,
          quantity: p.quantity ?? 1,
          unit_price: p.unit_price ?? p.products?.retail_price ?? 0,
          total_price: p.total_price ?? (p.unit_price ?? p.products?.retail_price ?? 0) * (p.quantity ?? 1),
        };
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
        timezone: (bookingData.provider as { timezone?: string | null }).timezone ?? null,
      } : undefined,
      /** IANA zone for formatting `scheduled_at` (provider default). */
      display_time_zone: resolveBookingDisplayTimeZone(
        (bookingData.provider as { timezone?: string | null } | undefined)?.timezone,
      ),
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
        const totalRefunded = Number((bookingData as Record<string, unknown>).total_refunded ?? 0);
        // wallet_amount was debited from the customer's wallet balance at booking time and is
        // NOT recorded in booking_payments (which only tracks gateway transactions). We must
        // subtract it here so wallet-covered amounts don't show as outstanding balance.
        const walletAmount = Number((bookingData as Record<string, unknown>).wallet_amount ?? 0);
        const giftCardAmount = Number((bookingData as Record<string, unknown>).gift_card_amount ?? 0);
        type AcRow = { status?: string; amount?: number };
        const unpaidCharges = (bookingData.additional_charges ?? [])
          .filter((ac: AcRow) => ac.status !== "paid" && ac.status !== "rejected")
          .reduce((sum: number, ac: AcRow) => sum + Number(ac.amount ?? 0), 0);
        return computeBookingOutstandingDisplay({
          totalAmount: bookingTotal,
          totalPaid,
          totalRefunded,
          walletAmount,
          giftCardAmount,
          unpaidAdditionalCharges: unpaidCharges,
          paymentStatus: bookingData.payment_status as string | undefined,
        });
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
      // Customer shows QR for provider to scan (same payload as encoded in the QR image)
      // Include QR payload even when expired so the customer app can show expiry + refresh.
      ...(isCustomer &&
        bookingData.location_type === "at_home" &&
        bookingData.current_stage === "provider_arrived" &&
        !bookingData.arrival_otp_verified &&
        !bookingData.qr_code_verified &&
        bookingData.qr_code_data != null && {
        qr_code_data: bookingData.qr_code_data as Record<string, unknown>,
        qr_code_expires_at: bookingData.qr_code_expires_at ?? undefined,
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
