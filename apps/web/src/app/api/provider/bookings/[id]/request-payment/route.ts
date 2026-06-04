import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { assertProviderUserCanAccessBookingBranch } from "@/lib/provider-booking/booking-branch-access";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { z } from "zod";
import type { Booking, AdditionalCharge } from "@/types/beautonomi";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { resourceTenantMatchesHostTenant } from "@/lib/bookings/resolve-payment-tenant";
import { computeBookingOutstandingDisplay } from "@/lib/bookings/display-invariants";

const requestPaymentSchema = z.object({
  description: z.string().min(1, "Description is required"),
  amount: z.number().positive("Amount must be positive"),
});

/**
 * POST /api/provider/bookings/[id]/request-payment
 * 
 * Request additional payment from customer during/after service
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const permissionCheck = await requirePermission("process_payments", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;

    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const tenantRegion = await getTenantRegionConfig(tenantId);
    const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;
    const { id } = await params;
    const body = await request.json();

    const validationResult = requestPaymentSchema.safeParse(body);
    if (!validationResult.success) {
      return errorResponse(
        "Validation failed",
        "VALIDATION_ERROR",
        400,
        validationResult.error.issues
      );
    }

    const { description, amount } = validationResult.data;

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Get booking
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", id)
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

    const supabaseAdminReq = getSupabaseAdmin();
    const branchAccess = await assertProviderUserCanAccessBookingBranch(
      supabaseAdminReq,
      user.id,
      user.role,
      providerId,
      (booking as { location_id?: string | null }).location_id ?? null
    );
    if (branchAccess.allowed === false) {
      return errorResponse(branchAccess.message, "FORBIDDEN", 403);
    }

    const bookingData = booking as any;

    // Allow confirmed bookings too: a confirmed booking (e.g. a custom offer paid
    // online, which starts as 'confirmed') can legitimately accrue an extra charge
    // before the provider marks the service started.
    if (!["confirmed", "in_progress", "completed"].includes(bookingData.status)) {
      return errorResponse("Can only request additional payment for confirmed, in-progress, or completed bookings", "INVALID_STATUS", 400);
    }

    // Create additional charge row (real table)
    const { data: chargeRow, error: chargeError } = await (supabase
      .from("additional_charges") as any)
      .insert({
        booking_id: id,
        description,
        amount,
        currency: bookingData.currency || lastResortCurrency,
        status: "pending",
        requested_by: user.id,
        requested_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (chargeError || !chargeRow) {
      throw chargeError || new Error("Failed to create additional charge");
    }

    const newCharge = chargeRow as AdditionalCharge;
    const { data: chargesForOutstanding } = await (supabase
      .from("additional_charges") as any)
      .select("amount, status")
      .eq("booking_id", id);
    const unpaidAdditionalCharges = ((chargesForOutstanding as Array<{ amount?: number; status?: string }> | null) ?? [])
      .filter((charge) => charge.status !== "paid" && charge.status !== "rejected")
      .reduce((sum, charge) => sum + Number(charge.amount || 0), 0);
    const remainingBalance = computeBookingOutstandingDisplay({
      totalAmount: Number(bookingData.total_amount ?? 0),
      totalPaid: Number(bookingData.total_paid ?? 0),
      totalRefunded: Number(bookingData.total_refunded ?? 0),
      walletAmount: Number(bookingData.wallet_amount ?? 0),
      giftCardAmount: Number(bookingData.gift_card_amount ?? 0),
      unpaidAdditionalCharges,
      paymentStatus: bookingData.payment_status,
    });

    // Create booking event
    const { error: eventError } = await supabase
      .from("booking_events")
      .insert({
        booking_id: id,
        event_type: "additional_payment_requested",
        event_data: {
          charge_id: newCharge.id,
          description,
          amount,
        },
        created_by: user.id,
      });
    if (eventError) {
      console.error("Failed to create booking event for additional charge:", eventError);
    }

    // In-app notification for the customer
    try {
      const { insertNotification } = await import("@/lib/notifications/insert-notification");
      const bookingRef = bookingData.booking_number || bookingData.ref_number || id.slice(0, 8).toUpperCase();
      await insertNotification({
        user_id: bookingData.customer_id,
        type: "payment_request",
        title: "Additional payment requested",
        message: `Your provider added an extra charge: ${newCharge.description || "Additional charge"} — ${newCharge.currency} ${Number(newCharge.amount).toFixed(2)}. Estimated balance due: ${newCharge.currency} ${remainingBalance.toFixed(2)}. Booking #${bookingRef}.`,
        data: {
          booking_id: id,
          charge_id: newCharge.id,
          amount: Number(newCharge.amount),
          description: newCharge.description,
        },
        action_url: `/account-settings/bookings/${id}`,
      });
    } catch (notifErr) {
      console.warn("Failed to insert in-app notification for additional charge:", notifErr);
    }

    // Push / email notification via OneSignal
    try {
      const { sendTemplateNotification } = await import("@/lib/notifications/onesignal");
      await sendTemplateNotification(
        "additional_charge_requested",
        [bookingData.customer_id],
        {
          charge_amount: `${newCharge.currency} ${Number(newCharge.amount).toFixed(2)}`,
          charge_description: newCharge.description || "Additional charge",
          remaining_balance: `${newCharge.currency} ${remainingBalance.toFixed(2)}`,
          booking_number: bookingData.booking_number || bookingData.ref_number || "",
          booking_id: id,
        },
        ["push", "email"],
        { appType: "customer", tenantId }
      );
    } catch (notifError) {
      console.error("Error sending additional payment request notification:", notifError);
    }

    // Fetch updated booking
    const { data: updatedBooking } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", id)
      .single();

    return successResponse({
      booking: updatedBooking as Booking,
      charge: newCharge,
      remaining_balance: remainingBalance,
      message: "Additional payment request created successfully",
    });
  } catch (error) {
    return handleApiError(error, "Failed to request additional payment");
  }
}
