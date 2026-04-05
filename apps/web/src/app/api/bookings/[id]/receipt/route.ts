import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, getProviderIdForUser } from "@/lib/supabase/api-helpers";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

type BookingServiceRow = {
  price?: number | null;
  offerings?: { title?: string | null; price?: number | null } | null;
};

type BookingAddonRow = {
  quantity?: number | null;
  price?: number | null;
};

type BookingProductRow = {
  quantity?: number | null;
  unit_price?: number | null;
  total_price?: number | null;
  products?: { name?: string | null; retail_price?: number | null } | null;
  product_variant?: { option_values?: Record<string, unknown> | null } | null;
};

type AdditionalChargeRow = {
  id: string;
  description?: string | null;
  amount?: number | null;
  currency?: string | null;
  status?: string | null;
  requested_at?: string | null;
  paid_at?: string | null;
};

type BookingReceiptRow = {
  id: string;
  tenant_id?: string | null;
  booking_number?: string | null;
  created_at?: string | null;
  scheduled_at?: string | null;
  customer_id: string;
  provider_id: string;
  subtotal?: number | null;
  tax_amount?: number | null;
  service_fee_amount?: number | null;
  travel_fee?: number | null;
  tip_amount?: number | null;
  discount_amount?: number | null;
  discount_reason?: string | null;
  cancellation_fee?: number | null;
  total_amount?: number | null;
  currency?: string | null;
  payment_status?: string | null;
  customer?: unknown;
  provider?: unknown;
  booking_services?: BookingServiceRow[] | null;
  booking_addons?: BookingAddonRow[] | null;
  booking_products?: BookingProductRow[] | null;
  booking_payments?: unknown[] | null;
  additional_charges?: AdditionalChargeRow[] | null;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: bookingId } = await params;
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request
    );
    // Use admin client so RLS doesn't block access — ownership is verified below
    const supabase = getSupabaseAdmin();
    // Still need a scoped client for getProviderIdForUser (which uses RLS-aware client)
    const scopedSupabase = await getSupabaseServer(request);

    // Get booking with all related data
    const { data: bookingRaw, error: bookingError } = await supabase
      .from("bookings")
      .select(`
        *,
        customer:users(id, email, full_name, phone),
        provider:providers(
          id,
          business_name,
          owner_email,
          phone,
          address
        ),
        booking_services:booking_services(
          id,
          offering_id,
          duration_minutes,
          price,
          currency,
          offerings:offerings(id, title, price, duration_minutes)
        ),
        booking_addons:booking_addons(
          id,
          addon_id,
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
        booking_payments:booking_payments(
          id,
          amount,
          payment_method,
          payment_provider,
          status,
          created_at
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
      .eq("id", bookingId)
      .single();

    if (bookingError) {
      console.error("[receipt] Supabase error:", bookingError.message, bookingError.code);
    }

    if (bookingError || !bookingRaw) {
      return NextResponse.json(
        { error: "Booking not found" },
        { status: 404 }
      );
    }

    const booking = bookingRaw as BookingReceiptRow;

    const tenantRegion = booking.tenant_id
      ? await getTenantRegionConfig(booking.tenant_id)
      : null;
    const currencyFallback = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;

    // Verify access: customer = booking owner; provider = owner or staff of the booking's provider; superadmin = support
    const isCustomer = booking.customer_id === user.id;
    const providerId = await getProviderIdForUser(user.id, scopedSupabase);
    const isProvider = providerId != null && booking.provider_id === providerId;
    const isAdmin = user.role === "superadmin";

    if (!isCustomer && !isProvider && !isAdmin) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    // Calculate totals (booking_services stores price per service line, no quantity)
    const servicesTotal =
      booking.booking_services?.reduce(
        (sum: number, bs: BookingServiceRow) => sum + Number(bs.price || 0),
        0
      ) || 0;

    const productsTotal =
      booking.booking_products?.reduce(
        (sum: number, bp: BookingProductRow) =>
          sum +
          Number(
            bp.total_price ||
              (bp.unit_price || bp.products?.retail_price || 0) * (bp.quantity || 1)
          ),
        0
      ) || 0;

    const addonsTotal =
      booking.booking_addons?.reduce(
        (sum: number, ba: BookingAddonRow) =>
          sum + Number(ba.price || 0) * Number(ba.quantity || 1),
        0
      ) || 0;

    const linesSubtotal = servicesTotal + productsTotal + addonsTotal;
    const storedSubtotal = booking.subtotal != null ? Number(booking.subtotal) : null;
    const subtotal = storedSubtotal != null && !Number.isNaN(storedSubtotal) ? storedSubtotal : linesSubtotal;

    const tax = Number(booking.tax_amount || 0);
    const serviceFee = Number(booking.service_fee_amount || 0);
    const travelFee = Number(booking.travel_fee || 0);
    const tipAmount = Number(booking.tip_amount || 0);
    const discount = Number(booking.discount_amount || 0);
    const cancellationFee = Number(booking.cancellation_fee || 0);

    const totalFromRow =
      booking.total_amount != null && !Number.isNaN(Number(booking.total_amount))
        ? Number(booking.total_amount)
        : subtotal + tax + serviceFee + travelFee + tipAmount - discount - cancellationFee;

    const additionalCharges = (booking.additional_charges || []).map((ac: AdditionalChargeRow) => ({
      id: ac.id,
      description: ac.description || "Additional charge",
      amount: Number(ac.amount || 0),
      currency: ac.currency || booking.currency || currencyFallback,
      status: ac.status || "pending",
      requested_at: ac.requested_at || null,
      paid_at: ac.paid_at || null,
    }));

    const receipt = {
      booking_number: booking.booking_number,
      booking_date: booking.created_at,
      service_date: booking.scheduled_at,
      customer: booking.customer,
      provider: booking.provider,
      services: booking.booking_services?.map((bs: BookingServiceRow) => ({
        name: bs.offerings?.title || "Service",
        quantity: 1,
        price: bs.price || bs.offerings?.price || 0,
        total: bs.price || bs.offerings?.price || 0,
      })) || [],
      addons:
        booking.booking_addons?.map((ba: BookingAddonRow) => ({
          name: "Add-on",
          quantity: ba.quantity || 1,
          price: Number(ba.price || 0),
          total: Number(ba.price || 0) * Number(ba.quantity || 1),
        })) || [],
      products: booking.booking_products?.map((bp: BookingProductRow) => {
        const ov = bp.product_variant?.option_values;
        const variantLabel =
          ov && typeof ov === "object"
            ? ` · ${Object.values(ov).join(" / ")}`
            : "";
        return {
          name: `${bp.products?.name || "Product"}${variantLabel}`,
          quantity: bp.quantity || 1,
          price: bp.unit_price || bp.products?.retail_price || 0,
          total:
            bp.total_price ||
            (bp.unit_price || bp.products?.retail_price || 0) * (bp.quantity || 1),
        };
      }) || [],
      subtotal,
      tax,
      /** Platform / service fee (Beautonomi fee), not tips */
      fees: serviceFee,
      travel_fee: travelFee,
      tip_amount: tipAmount,
      cancellation_fee: cancellationFee,
      discount,
      discount_reason: booking.discount_reason || null,
      total: totalFromRow,
      currency: booking.currency || currencyFallback,
      payment_status: booking.payment_status,
      transactions: booking.booking_payments || [],
      additional_charges: additionalCharges,
    };

    return NextResponse.json({ receipt });
  } catch (error: unknown) {
    console.error("Error generating receipt:", error);
    const message =
      error instanceof Error ? error.message : "Failed to generate receipt";
    const lower = message.toLowerCase();
    if (
      lower.includes("insufficient permissions") ||
      lower.includes("authentication required")
    ) {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
