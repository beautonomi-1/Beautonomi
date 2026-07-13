import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError, errorResponse  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDERS_OPERATIONS } from "@/lib/admin-sections";
import { writeAuditLog } from "@/lib/audit/audit";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { fetchBookingInAdminTenant } from "@/lib/tenant/admin-booking-tenant";
import { getCancellationPolicy } from "@/lib/bookings/cancellation-policy";
import {
  settleBookingCancellation,
  type BookingFinancialSnapshot,
} from "@/lib/bookings/settle-booking-cancellation";
import { describeCancellationRefund } from "@/lib/bookings/refund-processing";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

const BOOKING_CANCEL_SELECT =
  "id, status, customer_id, booking_number, tenant_id, provider_id, location_type, subtotal, discount_amount, tax_amount, service_fee_amount, travel_fee, tip_amount, total_amount, total_paid, total_refunded, wallet_amount, gift_card_amount, currency, loyalty_points_used, loyalty_points_redeemed, loyalty_points_earned";

/**
 * POST /api/admin/bookings/[id]/cancel
 *
 * Cancel a booking. Superadmin only. Audit logged.
 * Settles finances like a provider cancel: full wallet refund, zero customer fee.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_PROVIDERS_OPERATIONS, request);
    if (!user) throw new Error("Authentication required");
    const { id } = await params;
    const supabase = getSupabaseAdmin();
    if (!supabase) throw new Error("Admin client unavailable");
    const body = await request.json();
    const tenantId = await resolveAdminApiTenantId(request);

    const loaded = await fetchBookingInAdminTenant(
      supabase,
      id,
      tenantId,
      BOOKING_CANCEL_SELECT
    );
    if ("error" in loaded) return loaded.error;

    type BookingRow = BookingFinancialSnapshot & {
      status?: string;
      location_type?: string | null;
      currency?: string | null;
    };
    const bookingRow = loaded.booking as unknown as BookingRow;
    if (bookingRow.status === "cancelled") {
      return errorResponse("Booking is already cancelled", "INVALID_STATE", 400);
    }

    const bookingTotal = Number(bookingRow.total_amount ?? 0);
    const locType = (bookingRow.location_type as "at_salon" | "at_home") || "at_salon";
    const policy = await getCancellationPolicy(supabase, bookingRow.provider_id, locType);
    const tenantRegion = bookingRow.tenant_id
      ? await getTenantRegionConfig(bookingRow.tenant_id)
      : null;
    const currency =
      bookingRow.currency || tenantRegion?.defaultCurrency || LAST_RESORT_CURRENCY;

    const financialSnapshot: BookingFinancialSnapshot = {
      id,
      provider_id: bookingRow.provider_id,
      customer_id: bookingRow.customer_id,
      booking_number: bookingRow.booking_number,
      tenant_id: bookingRow.tenant_id,
      subtotal: bookingRow.subtotal,
      discount_amount: bookingRow.discount_amount,
      tax_amount: bookingRow.tax_amount,
      service_fee_amount: bookingRow.service_fee_amount,
      travel_fee: bookingRow.travel_fee,
      tip_amount: bookingRow.tip_amount,
      total_amount: bookingTotal,
      total_paid: bookingRow.total_paid,
      total_refunded: bookingRow.total_refunded,
      wallet_amount: bookingRow.wallet_amount,
      gift_card_amount: bookingRow.gift_card_amount,
      loyalty_points_used: bookingRow.loyalty_points_used,
      loyalty_points_redeemed: bookingRow.loyalty_points_redeemed,
      loyalty_points_earned: bookingRow.loyalty_points_earned,
    };

    const { data: updatedBooking, error: updateError } = await supabase
      .from("bookings")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
        cancellation_reason: body.reason || null,
        cancelled_at: new Date().toISOString(),
        cancelled_by: user.id,
        cancellation_fee: 0,
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError || !updatedBooking) {
      return handleApiError(updateError, "Failed to cancel booking");
    }

    let settlementWalletRefund = 0;
    try {
      const settlement = await settleBookingCancellation({
        booking: financialSnapshot,
        cancelledBy: "admin",
        currency,
        policy,
        refundBookingTotal: bookingTotal,
      });
      settlementWalletRefund = settlement.walletRefundAmount;
    } catch (settleErr) {
      console.error("[admin cancel] finance settlement failed:", settleErr);
    }

    try {
      const { notifyBookingCancelled } = await import("@/lib/notifications/notification-service");
      const refundInfo =
        typeof body.refund_info === "string" && body.refund_info.trim()
          ? body.refund_info.trim()
          : policy
            ? describeCancellationRefund(policy, false, settlementWalletRefund, bookingTotal, currency)
            : "This booking was cancelled by our team. A full refund has been credited to your Beautonomi wallet when payment was collected.";
      await notifyBookingCancelled(id, "system", refundInfo);
    } catch (notifError) {
      console.error("Error sending notification:", notifError);
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: (user as { role?: string })?.role ?? "superadmin",
      action: "admin.booking.cancel",
      entity_type: "booking",
      entity_id: id,
      metadata: { reason: body.reason ?? null, booking_number: bookingRow.booking_number },
    });

    try {
      const { matchWaitlistOnCancellation } = await import("@/lib/waitlist/matching");
      await matchWaitlistOnCancellation(supabase, id);
    } catch (waitlistErr) {
      console.error("[admin cancel] waitlist matching failed:", waitlistErr);
    }

    return successResponse(updatedBooking);
  } catch (error) {
    return handleApiError(error, "Failed to cancel booking");
  }
}
