import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { writeAuditLog } from "@/lib/audit/audit";

/**
 * POST /api/admin/bookings/[id]/refund
 *
 * Process a refund for a booking. Refunds always credit the customer's wallet
 * (use for next booking or request payout). Uses booking_refunds so
 * update_booking_payment_status trigger keeps totals in sync.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRoleInApi(["superadmin"], request);
    if (!auth) throw new Error("Authentication required");
    const { id } = await params;
    const supabase = getSupabaseAdmin();
    const body = await request.json();

    const { amount, reason } = body;

    if (!amount || amount <= 0) {
      return errorResponse("Invalid refund amount", "VALIDATION_ERROR", 400);
    }

    const { data: booking } = await supabase
      .from("bookings")
      .select("id, total_amount, total_paid, total_refunded, customer_id, booking_number, currency, payment_status")
      .eq("id", id)
      .single();

    if (!booking) {
      return notFoundResponse("Booking not found");
    }

    const b = booking as {
      total_amount: number;
      total_paid?: number;
      total_refunded?: number;
      payment_status?: string;
      customer_id: string;
      booking_number: string;
      currency?: string;
    };

    if (b.payment_status !== "paid" && b.payment_status !== "partially_paid") {
      return errorResponse("Can only refund paid or partially paid bookings", "INVALID_STATUS", 400);
    }

    const availableForRefund = (b.total_paid ?? 0) - (b.total_refunded ?? 0);
    if (amount > availableForRefund) {
      return errorResponse(
        `Refund amount exceeds available refund amount (R${availableForRefund.toFixed(2)})`,
        "VALIDATION_ERROR",
        400
      );
    }

    // 1. Credit customer wallet (refunds always go to wallet)
    const { error: walletError } = await (supabase.rpc as any)("wallet_credit_admin", {
      p_user_id: b.customer_id,
      p_amount: amount,
      p_currency: b.currency || "ZAR",
      p_description: `Refund for booking ${b.booking_number}: ${reason || "Admin refund"}`,
      p_reference_id: id,
      p_reference_type: "booking_refund",
    });

    if (walletError) {
      console.error("Wallet credit failed:", walletError);
      return errorResponse("Failed to credit customer wallet", "WALLET_ERROR", 500);
    }

    // 2. Create refund record in booking_refunds (triggers update_booking_payment_status)
    const { data: refund, error: refundError } = await supabase
      .from("booking_refunds")
      .insert({
        booking_id: id,
        amount,
        reason: reason || "Admin refund",
        refund_method: "store_credit",
        status: "completed",
        created_by: auth.user.id,
      })
      .select()
      .single();

    if (refundError || !refund) {
      return handleApiError(refundError, "Failed to create refund");
    }

    await writeAuditLog({
      actor_user_id: auth.user.id,
      actor_role: (auth.user as { role?: string }).role || "superadmin",
      action: "admin.refund.create",
      entity_type: "refund",
      entity_id: (refund as { id: string }).id,
      metadata: { booking_id: id, amount, reason, wallet_credit: true },
    });

    if (amount >= b.total_amount) {
      await supabase
        .from("bookings")
        .update({
          status: "cancelled",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
    }

    try {
      const { sendToUser } = await import("@/lib/notifications/onesignal");
      await sendToUser(b.customer_id, {
        title: "Refund added to wallet",
        message: `A refund of ${b.currency || "ZAR"} ${amount.toFixed(2)} for booking ${b.booking_number} has been added to your wallet. Use it for your next booking or request a payout.`,
        data: { type: "refund_processed", booking_id: id, refund_id: (refund as { id: string }).id },
        url: "/account-settings/wallet",
      });
    } catch (notifError) {
      console.error("Error sending notification:", notifError);
    }

    return successResponse(refund);
  } catch (error) {
    return handleApiError(error, "Failed to process refund");
  }
}
