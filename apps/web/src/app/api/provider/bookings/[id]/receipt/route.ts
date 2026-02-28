import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";

/**
 * GET /api/provider/bookings/[id]/receipt
 *
 * Get booking receipt data for print/display.
 * Returns data in the format expected by generateInvoiceHTMLFromData on the clients page.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: booking, error } = await supabase
      .from("bookings")
      .select(
        `
        *,
        customers:users!bookings_customer_id_fkey(id, full_name, email, phone),
        locations:provider_locations(id, name, address_line1, address_line2, city, state, postal_code),
        providers:providers!bookings_provider_id_fkey(id, business_name, owner_email, phone, address),
        group_bookings(ref_number),
        booking_services(
          id,
          offering_id,
          staff_id,
          duration_minutes,
          price,
          guest_name,
          offerings:offerings!booking_services_offering_id_fkey(id, title),
          staff:provider_staff(id, name)
        ),
        booking_products(
          id,
          product_id,
          quantity,
          unit_price,
          total_price,
          products:products!booking_products_product_id_fkey(id, name, retail_price)
        )
      `
      )
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (error || !booking) {
      return notFoundResponse("Booking not found");
    }

    const b = booking as any;
    const provider = b.providers || {};
    const address = provider.address && typeof provider.address === "object"
      ? provider.address
      : { line1: "", line2: "", city: "", state: "", postal_code: "" };
    const loc = b.locations;
    const customer = b.customers || {};

    // Build line items for invoice display (include guest_name for group bookings)
    const serviceItems = (b.booking_services || []).map((bs: any) => ({
      description: bs.guest_name ? `${bs.offerings?.title || "Service"} (${bs.guest_name})` : (bs.offerings?.title || "Service"),
      staff: bs.staff?.name || null,
      duration: bs.duration_minutes || null,
      quantity: 1,
      unit_price: bs.price || 0,
      total: bs.price || 0,
    }));

    const productItems = (b.booking_products || []).map((bp: any) => ({
      description: bp.products?.name || "Product",
      staff: null,
      duration: null,
      quantity: bp.quantity || 1,
      unit_price: bp.unit_price || bp.products?.retail_price || 0,
      total: bp.total_price || (bp.unit_price || bp.products?.retail_price || 0) * (bp.quantity || 1),
    }));

    const items = [...serviceItems, ...productItems];

    const subtotal = b.subtotal ?? items.reduce((s: number, i: any) => s + (i.total || 0), 0);
    const travelFee = b.travel_fee || 0;
    const taxAmount = b.tax_amount || 0;
    const taxRate = b.tax_rate || 0;
    const serviceFeeAmount = b.service_fee_amount || 0;
    const serviceFeePercentage = b.service_fee_percentage || 0;
    const tipAmount = b.tip_amount || 0;
    const discountAmount = b.discount_amount || 0;
    const totalAmount = b.total_amount ?? subtotal + travelFee + taxAmount + serviceFeeAmount + tipAmount - discountAmount;

    const receiptData = {
      invoice_number: b.booking_number || `BKG-${b.id?.slice(0, 8)}`,
      group_booking_ref: (b as any).group_bookings?.ref_number || null,
      invoice_date: new Date(b.created_at || Date.now()).toLocaleDateString(),
      booking_date: b.scheduled_at
        ? new Date(b.scheduled_at).toLocaleDateString()
        : new Date(b.created_at).toLocaleDateString(),
      provider: {
        name: provider.business_name || "Provider",
        email: provider.owner_email || "",
        phone: provider.phone || "",
        address: {
          line1: loc?.address_line1 || address?.line1 || "",
          line2: loc?.address_line2 || address?.line2 || "",
          city: loc?.city || address?.city || "",
          state: loc?.state || address?.state || "",
          postal_code: loc?.postal_code || address?.postal_code || "",
        },
      },
      customer: {
        name: customer.full_name || "Customer",
        email: customer.email || "",
        phone: customer.phone || "",
      },
      items,
      subtotal,
      discount_amount: discountAmount,
      discount_reason: b.discount_reason || null,
      travel_fee: travelFee,
      tax_amount: taxAmount,
      tax_rate: taxRate,
      service_fee_amount: serviceFeeAmount,
      service_fee_percentage: serviceFeePercentage,
      tip_amount: tipAmount,
      total_amount: totalAmount,
      currency: b.currency || "ZAR",
      payment_status: b.payment_status || "pending",
      location_type: b.location_type || "at_salon",
      service_address: b.address_line1
        ? {
            line1: b.address_line1,
            line2: b.address_line2 || "",
            city: b.address_city || "",
            state: b.address_state || "",
            postal_code: b.address_postal_code || "",
          }
        : null,
      notes: b.special_requests || null,
    };

    return successResponse(receiptData);
  } catch (error) {
    return handleApiError(error, "Failed to fetch receipt");
  }
}
