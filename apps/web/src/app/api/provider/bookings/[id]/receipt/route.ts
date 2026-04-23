import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { computeBookingOutstandingDisplay } from "@/lib/bookings/display-invariants";

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  notFoundResponse,
  forbiddenResponse,
  userHasProviderAccessAdmin,
} from "@/lib/supabase/api-helpers";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { parseReceiptDownloadToken } from "@/lib/receipts/receipt-download-token";

/**
 * GET /api/provider/bookings/[id]/receipt
 *
 * Get booking receipt data for print/display.
 * Uses admin client to bypass RLS (especially users table) so provider can
 * see customer name/email on receipts. Ownership is verified in app code.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // §Provider-audit 2026-04: same auth issue as the customer-facing
    // receipt — the PDF sibling route sends a service-role Bearer which
    // `requireRoleInApi` cannot translate into a user. Accept the signed
    // `?token=` directly so mobile receipt downloads actually work.
    const url = new URL(request.url);
    const downloadToken = url.searchParams.get("token");
    let tokenUserId: string | null = null;
    if (downloadToken) {
      const parsed = parseReceiptDownloadToken(downloadToken, {
        kind: "provider_booking_receipt",
        subjectId: id,
      });
      if (!parsed) {
        return NextResponse.json(
          { error: "Signed download token is invalid or expired" },
          { status: 401 },
        );
      }
      tokenUserId = parsed.userId;
    }

    const supabaseAdmin = getSupabaseAdmin();

    let user: { id: string; role: string };
    if (tokenUserId) {
      const { data: userRow } = await supabaseAdmin
        .from("users")
        .select("id, role")
        .eq("id", tokenUserId)
        .maybeSingle();
      if (!userRow) {
        return NextResponse.json(
          { error: "Signed download token is invalid or expired" },
          { status: 401 },
        );
      }
      user = {
        id: userRow.id as string,
        role: (userRow.role as string) || "provider_owner",
      };
    } else {
      const authed = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
      user = { id: authed.user.id, role: authed.user.role as string };
    }

    // §Multi-provider staff 2026-04: never gate this read on
    // getProviderIdForUser() — that helper returns only the *first*
    // active provider_staff row, so a staff member who works for two
    // salons would get 404 on bookings for the other salon. Load by
    // booking id, then verify access against the row's provider_id.
    const { data: booking, error } = await supabaseAdmin
      .from("bookings")
      .select(
        `
        *,
        customers:users!bookings_customer_id_fkey(id, full_name, email, phone),
        locations:provider_locations(id, name, address_line1, address_line2, city, state, postal_code),
        providers:providers!bookings_provider_id_fkey(id, business_name, owner_email, phone, address, receipt_prefix, receipt_next_number, receipt_header, receipt_footer),
        group_bookings!bookings_group_booking_id_fkey(ref_number),
        booking_services(
          id,
          offering_id,
          staff_id,
          duration_minutes,
          price,
          guest_name,
          tax_snapshot,
          offerings:offerings!booking_services_offering_id_fkey(id, title),
          staff:provider_staff(id, name)
        ),
        booking_products(
          id,
          product_id,
          product_variant_id,
          quantity,
          unit_price,
          total_price,
          products:products!booking_products_product_id_fkey(id, name, retail_price),
          product_variant:product_variants(id, option_values)
        ),
        booking_addons(
          id,
          addon_id,
          addon_name,
          quantity,
          price
        ),
        booking_payments(
          id,
          amount,
          payment_method,
          payment_provider,
          status,
          created_at
        ),
        additional_charges(
          id,
          description,
          amount,
          currency,
          status,
          requested_at,
          paid_at
        )
      `
      )
      .eq("id", id)
      .maybeSingle();

    if (error || !booking) {
      return notFoundResponse("Booking not found");
    }

    const bookingProviderId = (booking as { provider_id?: string | null }).provider_id;
    if (user.role !== "superadmin") {
      if (!bookingProviderId) {
        return forbiddenResponse("Invalid booking record");
      }
      const allowed = await userHasProviderAccessAdmin(
        supabaseAdmin,
        user.id,
        bookingProviderId,
      );
      if (!allowed) {
        return forbiddenResponse("You do not have access to this booking");
      }
    }

    const b = booking as any;
    const tenantRegion = b.tenant_id
      ? await getTenantRegionConfig(b.tenant_id as string)
      : null;
    const currencyFallback = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;

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
      // B14: forward the immutable tax snapshot stamped at booking creation
      // so the provider invoice renders the real VAT context applied to the
      // sale, even if the provider/platform tax rate has since changed.
      tax_snapshot: bs.tax_snapshot ?? null,
    }));

    const productItems = (b.booking_products || []).map((bp: any) => {
      const variantLabel = bp.product_variant?.option_values && typeof bp.product_variant.option_values === "object"
        ? ` · ${Object.values(bp.product_variant.option_values).join(" / ")}`
        : "";
      return {
        description: `${bp.products?.name || "Product"}${variantLabel}`,
        staff: null,
        duration: null,
        quantity: bp.quantity || 1,
        unit_price: bp.unit_price || bp.products?.retail_price || 0,
        total: bp.total_price || (bp.unit_price || bp.products?.retail_price || 0) * (bp.quantity || 1),
      };
    });

    const addonItems = (b.booking_addons || []).map((ba: any) => ({
      description: ba.addon_name || "Add-on",
      staff: null,
      duration: null,
      quantity: ba.quantity || 1,
      unit_price: Number(ba.price || 0),
      total: Number(ba.price || 0) * (ba.quantity || 1),
    }));

    const items = [...serviceItems, ...addonItems, ...productItems];

    const linesSubtotal = items.reduce((s: number, i: any) => s + (i.total || 0), 0);
    const subtotal = b.subtotal != null ? Number(b.subtotal) : linesSubtotal;
    const travelFee = Number(b.travel_fee || 0);
    const taxAmount = Number(b.tax_amount || 0);
    const taxRate = Number(b.tax_rate || 0);
    const serviceFeeAmount = Number(b.service_fee_amount || 0);
    const serviceFeePercentage = Number(b.service_fee_percentage || 0);
    const tipAmount = Number(b.tip_amount || 0);
    const discountAmount = Number(b.discount_amount || 0);
    const cancellationFee = Number(b.cancellation_fee || 0);
    const totalAmount =
      b.total_amount != null && !Number.isNaN(Number(b.total_amount))
        ? Number(b.total_amount)
        : subtotal + taxAmount + serviceFeeAmount + travelFee + tipAmount - discountAmount - cancellationFee;

    const completedPayments = (b.booking_payments || []).filter((p: any) => p.status === "completed");
    const paymentsPaid = completedPayments.reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
    const walletCredit = Number((b as any).wallet_amount || 0);
    const giftCardCredit = Number((b as any).gift_card_amount || 0);
    const amountPaid = paymentsPaid + walletCredit + giftCardCredit;
    const totalRefunded = Number(b.total_refunded || 0);
    const unpaidAdditionalCharges = (b.additional_charges || [])
      .filter((ac: any) => ac.status !== "paid" && ac.status !== "rejected")
      .reduce((s: number, ac: any) => s + Number(ac.amount || 0), 0);
    const balanceDue = computeBookingOutstandingDisplay({
      totalAmount,
      totalPaid: Number(b.total_paid || 0),
      totalRefunded,
      walletAmount: walletCredit,
      giftCardAmount: giftCardCredit,
      unpaidAdditionalCharges,
      paymentStatus: b.payment_status,
    });

    const additionalCharges = (b.additional_charges || []).map((ac: any) => ({
      id: ac.id,
      description: ac.description || "Additional charge",
      amount: Number(ac.amount || 0),
      currency: ac.currency || b.currency || currencyFallback,
      status: ac.status || "pending",
      requested_at: ac.requested_at || null,
      paid_at: ac.paid_at || null,
    }));

    const depositRequired = Boolean(b.deposit_required);
    const depositAmount = Number(b.deposit_amount || 0);
    const depositPercentage = Number(b.deposit_percentage || 0);
    const paymentOption = b.payment_option || "full";

    const receiptPrefix = provider.receipt_prefix || "REC";
    const receiptNextNumber = Number(provider.receipt_next_number || 1);
    const receiptHeader = provider.receipt_header || null;
    const receiptFooter = provider.receipt_footer || null;

    const receiptData = {
      invoice_number: b.booking_number || `${receiptPrefix}-${String(receiptNextNumber).padStart(4, "0")}`,
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
      subtotal: Math.max(0, subtotal - travelFee),
      discount_amount: discountAmount,
      discount_reason: b.discount_reason || null,
      travel_fee: travelFee,
      tax_amount: taxAmount,
      tax_rate: taxRate,
      service_fee_amount: serviceFeeAmount,
      service_fee_percentage: serviceFeePercentage,
      tip_amount: tipAmount,
      cancellation_fee: cancellationFee,
      total_amount: totalAmount,
      currency: b.currency || currencyFallback,
      payment_status: b.payment_status || "pending",
      deposit_required: depositRequired,
      deposit_amount: depositAmount,
      deposit_percentage: depositPercentage,
      payment_option: paymentOption,
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
      amount_paid: amountPaid,
      balance_due: balanceDue,
      // B14: expose aggregated refund total so the invoice can render a
      // "Refunded" line and compute net paid. `bookings.total_refunded` is
      // maintained by the finance ledger trigger (migration 490).
      total_refunded: totalRefunded,
      additional_charges: additionalCharges,
      transactions: b.booking_payments || [],
      notes: b.special_requests || null,
      receipt_header: receiptHeader,
      receipt_footer: receiptFooter,
    };

    return successResponse(receiptData);
  } catch (error) {
    return handleApiError(error, "Failed to fetch receipt");
  }
}
