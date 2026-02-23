import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit/audit";

const refundSchema = z.object({
  amount: z.number().min(0.01).optional(), // If not provided, full refund
  reason: z.string().min(1, "Refund reason is required"),
});

/**
 * POST /api/admin/payments/[txId]/refund
 *
 * Process a refund for a payment transaction. Refunds always credit the
 * customer's wallet (use for next booking or request payout); we do not call
 * Paystack so the same flow works for Paystack, wallet, or other payment methods.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ txId: string }> }
) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const { txId } = await params;
    const supabase = getSupabaseAdmin();
    const body = await request.json();

    const validationResult = refundSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Validation failed",
            code: "VALIDATION_ERROR",
            details: validationResult.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
          },
        },
        { status: 400 }
      );
    }

    const { data: transaction } = await supabase
      .from("payment_transactions")
      .select("*")
      .eq("id", txId)
      .eq("status", "success")
      .single();

    if (!transaction) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Transaction not found or not eligible for refund",
            code: "NOT_FOUND",
          },
        },
        { status: 404 }
      );
    }

    const txData = transaction as any;

    if (txData.status === "refunded" || txData.status === "partially_refunded") {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Transaction already refunded",
            code: "ALREADY_REFUNDED",
          },
        },
        { status: 400 }
      );
    }

    const { data: booking } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", txData.booking_id)
      .single();

    if (!booking) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Booking not found",
            code: "BOOKING_NOT_FOUND",
          },
        },
        { status: 404 }
      );
    }

    const bookingData = booking as any;
    const refundAmount = validationResult.data.amount ?? Number(txData.amount);
    const { reason } = validationResult.data;

    if (refundAmount > Number(txData.amount)) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Refund amount cannot exceed transaction amount",
            code: "INVALID_REFUND_AMOUNT",
          },
        },
        { status: 400 }
      );
    }

    // Credit customer wallet (refunds always go to wallet)
    const { error: walletError } = await (supabase.rpc as any)("wallet_credit_admin", {
      p_user_id: bookingData.customer_id,
      p_amount: refundAmount,
      p_currency: bookingData.currency || "ZAR",
      p_description: `Refund for booking ${bookingData.booking_number}: ${reason}`,
      p_reference_id: txId,
      p_reference_type: "refund",
    });

    if (walletError) {
      console.error("Wallet credit failed:", walletError);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to credit customer wallet",
            code: "WALLET_ERROR",
          },
        },
        { status: 500 }
      );
    }

    const refundReference = `wallet_refund_${txId}_${Date.now()}`;
    const isFullRefund = refundAmount >= Number(txData.amount);
    const newTransactionStatus = isFullRefund ? "refunded" : "partially_refunded";
    const newBookingPaymentStatus = isFullRefund ? "refunded" : "partially_refunded";

    // Update transaction status
    await (supabase
      .from("payment_transactions") as any)
      .update({
        status: newTransactionStatus,
        refund_amount: refundAmount,
        refund_reference: refundReference,
        refund_reason: reason,
        refunded_at: new Date().toISOString(),
        refunded_by: auth.user.id,
      })
      .eq("id", txId);

    // Update booking payment status
    await (supabase
      .from("bookings") as any)
      .update({
        payment_status: newBookingPaymentStatus,
      })
      .eq("id", txData.booking_id);

    // Record in booking_refunds so update_booking_payment_status keeps totals in sync
    await (supabase.from("booking_refunds") as any).insert({
      booking_id: txData.booking_id,
      amount: refundAmount,
      reason,
      refund_method: "store_credit",
      status: "completed",
      created_by: auth.user.id,
    });

    // Create refund transaction record (ledger)
    await (supabase
      .from("payment_transactions") as any)
      .insert({
        booking_id: txData.booking_id,
        reference: refundReference,
        amount: -refundAmount,
        fees: 0,
        net_amount: -refundAmount,
        status: "success",
        provider: txData.provider || "wallet",
        transaction_type: "refund",
        metadata: {
          original_transaction_id: txId,
          original_reference: txData.reference,
          refund_reason: reason,
        },
        created_at: new Date().toISOString(),
      });

    // Create finance ledger entry for refund
    await (supabase
      .from("finance_transactions") as any)
      .insert({
        booking_id: txData.booking_id,
        transaction_type: "refund",
        amount: -refundAmount,
        fees: 0,
        commission: 0,
        net: -refundAmount,
        description: `Refund for booking ${bookingData.booking_number}: ${reason}`,
        created_at: new Date().toISOString(),
      });

    // Audit log
    await writeAuditLog({
      actor_user_id: auth.user.id,
      actor_role: (auth.user as any).role || "superadmin",
      action: "admin.refund",
      entity_type: "payment_transaction",
      entity_id: txData.id,
      metadata: {
        booking_id: txData.booking_id,
        refund_amount: refundAmount,
        reason,
        refund_reference: refundReference,
        full_refund: isFullRefund,
      },
    });

    // Notifications (customer + provider owner)
    try {
      const { sendToUser } = await import("@/lib/notifications/onesignal");
      await sendToUser(bookingData.customer_id, {
        title: "Refund added to wallet",
        message: `A refund of ${bookingData.currency || "ZAR"} ${refundAmount} for booking ${bookingData.booking_number} has been added to your wallet. Use it for your next booking or request a payout.`,
        data: {
          type: "refund_processed",
          booking_id: txData.booking_id,
          refund_reference: refundReference,
        },
        url: "/account-settings/wallet",
      });

      const { data: providerRow } = await supabase
        .from("providers")
        .select("user_id")
        .eq("id", bookingData.provider_id)
        .single();

      const providerUserId = (providerRow as any)?.user_id;
      if (providerUserId) {
        await sendToUser(providerUserId, {
          title: "Refund Processed",
          message: `A refund has been processed for booking ${bookingData.booking_number}.`,
          data: {
            type: "refund_processed_provider",
            booking_id: txData.booking_id,
            refund_reference: refundReference,
          },
          url: `/provider/bookings/${txData.booking_id}`,
        });
      }
    } catch (notifError) {
      console.error("Error sending refund notifications:", notifError);
    }

    return NextResponse.json({
      data: {
        refund_id: refundReference,
        amount: refundAmount,
        status: newTransactionStatus,
        message: isFullRefund ? "Full refund processed" : "Partial refund processed",
      },
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/payments/[txId]/refund:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to process refund",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
