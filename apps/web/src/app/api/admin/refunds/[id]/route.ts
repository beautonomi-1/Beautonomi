import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { successResponse, errorResponse, handleApiError, notFoundResponse } from "@/lib/supabase/api-helpers";
import { writeAuditLog } from "@/lib/audit/audit";
import { z } from "zod";

const processRefundSchema = z.object({
  refund_amount: z.number().positive(),
  refund_reason: z.string().min(1),
  notes: z.string().optional().nullable(),
});

/**
 * GET /api/admin/refunds/[id]
 * 
 * Get a single refund by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = getSupabaseAdmin();
    const { id } = await params;

    const { data: refund, error } = await supabase
      .from("payment_transactions")
      .select(`
        id,
        booking_id,
        transaction_type,
        amount,
        refund_amount,
        refund_reference,
        refund_reason,
        refunded_at,
        refunded_by,
        status,
        created_at,
        booking:bookings(
          id,
          booking_number,
          status,
          total_amount,
          customer_id,
          provider_id,
          customer:users!bookings_customer_id_fkey(id, full_name, email),
          provider:providers!bookings_provider_id_fkey(id, business_name)
        ),
        refunded_by_user:users!payment_transactions_refunded_by_fkey(id, full_name, email)
      `)
      .eq("id", id)
      .single();

    if (error || !refund) {
      return notFoundResponse("Refund not found");
    }

    return successResponse(refund);
  } catch (error) {
    return handleApiError(error, "Failed to fetch refund");
  }
}

/**
 * POST /api/admin/refunds/[id]
 *
 * Process a refund: always credits the customer's wallet (they can request payout
 * or use the balance for the next booking). Updates payment_transactions and
 * booking_refunds so totals stay in sync.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = getSupabaseAdmin();
    const { id } = await params;
    const body = await request.json();

    const validationResult = processRefundSchema.safeParse(body);
    if (!validationResult.success) {
      return errorResponse(
        "Validation failed",
        "VALIDATION_ERROR",
        400
      );
    }

    const { data: transaction } = await supabase
      .from("payment_transactions")
      .select("id, booking_id, amount, status, transaction_type")
      .eq("id", id)
      .single();

    if (!transaction) {
      return notFoundResponse("Transaction not found");
    }

    if (transaction.status === "refunded" || transaction.status === "partially_refunded") {
      return errorResponse(
        "Transaction already refunded",
        "ALREADY_REFUNDED",
        400
      );
    }

    const { refund_amount, refund_reason, notes } = validationResult.data;
    const txnAmount = parseFloat(transaction.amount || "0");
    if (refund_amount > txnAmount) {
      return errorResponse(
        "Refund amount cannot exceed transaction amount",
        "INVALID_AMOUNT",
        400
      );
    }

    const { data: booking } = await supabase
      .from("bookings")
      .select("id, customer_id, booking_number, currency")
      .eq("id", transaction.booking_id)
      .single();

    if (!booking) {
      return notFoundResponse("Booking not found");
    }

    const customerId = (booking as { customer_id: string }).customer_id;
    const bookingNumber = (booking as { booking_number: string }).booking_number;
    const currency = (booking as { currency?: string }).currency || "ZAR";

    // 1. Credit customer wallet (refunds always go to wallet; they can request payout or use for next booking)
    const { error: walletError } = await (supabase.rpc as any)("wallet_credit_admin", {
      p_user_id: customerId,
      p_amount: refund_amount,
      p_currency: currency,
      p_description: `Refund for booking ${bookingNumber}: ${refund_reason}`,
      p_reference_id: id,
      p_reference_type: "refund",
    });

    if (walletError) {
      console.error("Wallet credit failed:", walletError);
      return errorResponse(
        "Failed to credit customer wallet",
        "WALLET_ERROR",
        500
      );
    }

    const refundReference = `wallet_refund_${id}_${Date.now()}`;
    const isFullRefund = refund_amount >= txnAmount;

    // 2. Update payment_transactions
    const updateData: any = {
      refund_amount,
      refund_reason,
      refund_reference: refundReference,
      refunded_at: new Date().toISOString(),
      refunded_by: auth.user.id,
      status: isFullRefund ? "refunded" : "partially_refunded",
    };

    const { data: updatedTransaction, error } = await supabase
      .from("payment_transactions")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    // 3. Record in booking_refunds so update_booking_payment_status trigger keeps totals in sync
    await (supabase.from("booking_refunds") as any).insert({
      booking_id: transaction.booking_id,
      amount: refund_amount,
      reason: refund_reason,
      refund_method: "store_credit",
      status: "completed",
      created_by: auth.user.id,
    });

    await writeAuditLog({
      actor_user_id: auth.user.id,
      actor_role: (auth.user as any).role || "superadmin",
      action: "admin.refund.process",
      entity_type: "payment_transaction",
      entity_id: id,
      metadata: { refund_amount, refund_reason, notes, wallet_credit: true },
    });

    // 4. Notify customer
    try {
      const { sendToUser } = await import("@/lib/notifications/onesignal");
      await sendToUser(customerId, {
        title: "Refund added to wallet",
        message: `A refund of ${currency} ${refund_amount.toFixed(2)} for booking ${bookingNumber} has been added to your wallet. Use it for your next booking or request a payout.`,
        data: { type: "refund_processed", booking_id: transaction.booking_id, refund_reference: refundReference },
        url: "/account-settings/wallet",
      });
    } catch (notifErr) {
      console.error("Refund notification failed:", notifErr);
    }

    return successResponse(updatedTransaction);
  } catch (error) {
    return handleApiError(error, "Failed to process refund");
  }
}
