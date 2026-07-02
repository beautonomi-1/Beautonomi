import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { assertProviderUserCanAccessBookingBranch } from "@/lib/provider-booking/booking-branch-access";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { resourceTenantMatchesHostTenant } from "@/lib/bookings/resolve-payment-tenant";
import { computeBookingOutstandingDisplay } from "@/lib/bookings/display-invariants";

/**
 * POST /api/provider/bookings/[id]/additional-charges/[chargeId]/notify
 *
 * Re-send the "please pay this additional charge" notification to the customer
 * for an existing pending/approved charge, without creating a duplicate charge
 * and without depending on the payment-link feature flag.
 *
 * This is the "Send to client" path: it nudges the customer to pay the charge
 * online (booking detail → additional-charge pay flow → Paystack), as opposed to
 * "Mark paid" which records an in-person/cash collection as a walk-in charge.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; chargeId: string }> }
) {
  try {
    const permissionCheck = await requirePermission("process_payments", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    if (!user) return notFoundResponse("User not found");

    const supabase = await getSupabaseServer(request);
    const supabaseAdmin = getSupabaseAdmin();
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const { id: bookingId, chargeId } = await params;

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select(
        "id, tenant_id, provider_id, customer_id, booking_number, ref_number, total_amount, total_paid, total_refunded, wallet_amount, gift_card_amount, payment_status, location_id, additional_charges(amount,status)"
      )
      .eq("id", bookingId)
      .eq("provider_id", providerId)
      .single();

    if (bookingError || !booking) {
      return notFoundResponse("Booking not found");
    }

    if (
      !resourceTenantMatchesHostTenant(
        tenantId,
        (booking as { tenant_id?: string | null }).tenant_id,
      )
    ) {
      return errorResponse(
        "This booking belongs to a different market. Use the provider site or app for the correct region.",
        "TENANT_MISMATCH",
        403,
      );
    }

    const branchAccess = await assertProviderUserCanAccessBookingBranch(
      supabaseAdmin,
      user.id,
      user.role,
      providerId,
      (booking as { location_id?: string | null }).location_id ?? null
    );
    if (branchAccess.allowed === false) {
      return errorResponse(branchAccess.message, "FORBIDDEN", 403);
    }

    const { data: charge, error: chargeError } = await supabase
      .from("additional_charges")
      .select("*")
      .eq("id", chargeId)
      .eq("booking_id", bookingId)
      .single();

    if (chargeError || !charge) {
      return notFoundResponse("Additional charge not found");
    }

    const chargeStatus = String((charge as { status?: string }).status || "").toLowerCase();
    if (chargeStatus === "paid") {
      return errorResponse("This charge has already been paid", "ALREADY_PAID", 400);
    }
    if (chargeStatus === "rejected") {
      return errorResponse("This charge has been rejected", "CHARGE_REJECTED", 400);
    }
    if (!["pending", "approved"].includes(chargeStatus)) {
      return errorResponse("This charge cannot be sent in its current status", "INVALID_STATUS", 400);
    }

    const bookingData = booking as Record<string, any>;
    const chargeData = charge as Record<string, any>;

    const unpaidAdditionalCharges = Array.isArray(bookingData.additional_charges)
      ? bookingData.additional_charges
          .filter((c: any) => c?.status !== "paid" && c?.status !== "rejected")
          .reduce((sum: number, c: any) => sum + Number(c?.amount || 0), 0)
      : 0;
    const remainingBalance = computeBookingOutstandingDisplay({
      totalAmount: Number(bookingData.total_amount ?? 0),
      totalPaid: Number(bookingData.total_paid ?? 0),
      totalRefunded: Number(bookingData.total_refunded ?? 0),
      walletAmount: Number(bookingData.wallet_amount ?? 0),
      giftCardAmount: Number(bookingData.gift_card_amount ?? 0),
      unpaidAdditionalCharges,
      paymentStatus: bookingData.payment_status,
    });

    const bookingRef =
      bookingData.booking_number || bookingData.ref_number || bookingId.slice(0, 8).toUpperCase();
    const currency = chargeData.currency || "";
    const chargeAmount = Number(chargeData.amount || 0);

    try {
      const { insertNotification } = await import("@/lib/notifications/insert-notification");
      await insertNotification({
        user_id: bookingData.customer_id,
        type: "payment_request",
        title: "Additional payment requested",
        message: `Your provider added an extra charge: ${chargeData.description || "Additional charge"} — ${currency} ${chargeAmount.toFixed(2)}. Estimated balance due: ${currency} ${remainingBalance.toFixed(2)}. Booking #${bookingRef}.`,
        data: {
          booking_id: bookingId,
          charge_id: chargeId,
          amount: chargeAmount,
          description: chargeData.description,
        },
        action_url: `/account-settings/bookings/${bookingId}`,
      });
    } catch (notifErr) {
      console.warn("Failed to insert in-app notification for additional charge:", notifErr);
    }

    try {
      const { sendTemplateNotification } = await import("@/lib/notifications/onesignal");
      await sendTemplateNotification(
        "additional_charge_requested",
        [bookingData.customer_id],
        {
          charge_amount: `${currency} ${chargeAmount.toFixed(2)}`,
          charge_description: chargeData.description || "Additional charge",
          remaining_balance: `${currency} ${remainingBalance.toFixed(2)}`,
          booking_number: bookingRef,
          booking_id: bookingId,
          charge_id: chargeId,
        },
        ["push", "email"],
        // In-app bell row inserted manually above; skip template auto-insert.
        { appType: "customer", tenantId, skipInApp: true }
      );
    } catch (notifError) {
      console.error("Error sending additional payment request notification:", notifError);
    }

    return successResponse({
      charge_id: chargeId,
      remaining_balance: remainingBalance,
      message: "Payment request sent to customer",
    });
  } catch (error) {
    return handleApiError(error, "Failed to notify customer of additional charge");
  }
}
