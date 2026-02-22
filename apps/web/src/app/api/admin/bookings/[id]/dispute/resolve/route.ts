import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit/audit";

const resolveDisputeSchema = z.object({
  resolution: z.enum(["refund_full", "refund_partial", "deny"]),
  refund_amount: z.number().min(0).optional(),
  notes: z.string().optional().nullable(),
});

/**
 * POST /api/admin/bookings/[id]/dispute/resolve
 * 
 * Resolve a booking dispute
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const { id } = await params;
    const supabase = await getSupabaseServer();
    const body = await request.json();

    // Validate request body
    const validationResult = resolveDisputeSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Validation failed",
            code: "VALIDATION_ERROR",
            details: validationResult.error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          },
        },
        { status: 400 }
      );
    }

    // Get dispute
    const { data: dispute } = await supabase
      .from("booking_disputes")
      .select("*")
      .eq("booking_id", id)
      .eq("status", "open")
      .single();

    if (!dispute) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "No open dispute found for this booking",
            code: "NO_DISPUTE",
          },
        },
        { status: 404 }
      );
    }

    // Get booking
    const { data: booking } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", id)
      .single();

    if (!booking) {
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

    const { resolution, refund_amount, notes } = validationResult.data;
    const bookingData = booking as any;

    // Handle refunds
    if (resolution === "refund_full" || resolution === "refund_partial") {
      const refundAmt =
        resolution === "refund_full"
          ? bookingData.total_amount
          : refund_amount || 0;

      if (refundAmt > bookingData.total_amount) {
        return NextResponse.json(
          {
            data: null,
            error: {
              message: "Refund amount cannot exceed booking total",
              code: "INVALID_REFUND_AMOUNT",
            },
          },
          { status: 400 }
        );
      }

      // Process refund via Paystack for successful payment transaction
      const { data: tx } = await (supabase
        .from("payment_transactions") as any)
        .select("*")
        .eq("booking_id", id)
        .eq("status", "success")
        .eq("provider", "paystack")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!tx) {
        return NextResponse.json(
          {
            data: null,
            error: {
              message: "No successful Paystack transaction found to refund",
              code: "NO_TRANSACTION",
            },
          },
          { status: 400 }
        );
      }

      const txData = tx as any;

      // Paystack refund API call (mirrors /api/admin/payments/[txId]/refund)
      const { getPaystackSecretKey } = await import("@/lib/payments/paystack-server");
      const paystackSecretKey = await getPaystackSecretKey();

      const refundPayload: any = { transaction: txData.reference };
      if (refundAmt < Number(txData.amount || 0)) {
        refundPayload.amount = Math.round(refundAmt * 100);
      }

      const paystackResponse = await fetch(`https://api.paystack.co/refund`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${paystackSecretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(refundPayload),
      });

      if (!paystackResponse.ok) {
        const errorData = await paystackResponse.json().catch(() => ({}));
        console.error("Paystack refund error:", errorData);
        return NextResponse.json(
          {
            data: null,
            error: {
              message: (errorData as any)?.message || "Failed to process refund",
              code: "PAYSTACK_ERROR",
            },
          },
          { status: 500 }
        );
      }

      const paystackRefundData = await paystackResponse.json();
      const refundReference = paystackRefundData.data?.reference || `refund_${txData.id}_${Date.now()}`;

      const isFullRefund = refundAmt >= Number(txData.amount || 0);
      const newTransactionStatus = isFullRefund ? "refunded" : "partially_refunded";
      const newBookingPaymentStatus = isFullRefund ? "refunded" : "partially_refunded";

      // Update original transaction to refunded status + refund info
      await (supabase
        .from("payment_transactions") as any)
        .update({
          status: newTransactionStatus,
          refund_amount: refundAmt,
          refund_reference: refundReference,
          refund_reason: "booking_dispute",
          refunded_at: new Date().toISOString(),
          refunded_by: auth.user.id,
        })
        .eq("id", txData.id);

      // Create refund transaction record
      await (supabase
        .from("payment_transactions") as any)
        .insert({
          booking_id: id,
          reference: refundReference,
          amount: -refundAmt,
          fees: 0,
          net_amount: -refundAmt,
          status: "success",
          provider: "paystack",
          transaction_type: "refund",
          metadata: {
            original_transaction_id: txData.id,
            original_reference: txData.reference,
            resolution,
            dispute_id: (dispute as any).id,
          },
          created_at: new Date().toISOString(),
        });

      // Update booking payment status
      await (supabase
        .from("bookings") as any)
        .update({ payment_status: newBookingPaymentStatus })
        .eq("id", id);
    }

    // Update dispute
    const { data: updatedDispute, error: disputeError } = await (supabase
      .from("booking_disputes") as any)
      .update({
        status: "resolved",
        resolution,
        refund_amount: resolution.includes("refund") ? (refund_amount || bookingData.total_amount) : null,
        resolved_at: new Date().toISOString(),
        resolved_by: auth.user.id,
        notes: notes || null,
      })
      .eq("id", (dispute as any).id)
      .select()
      .single();

    if (disputeError || !updatedDispute) {
      console.error("Error resolving dispute:", disputeError);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to resolve dispute",
            code: "UPDATE_ERROR",
          },
        },
        { status: 500 }
      );
    }

    // Update booking status
    const newBookingStatus =
      resolution === "refund_full" ? "cancelled" : bookingData.status;
    await (supabase
      .from("bookings") as any)
      .update({ status: newBookingStatus })
      .eq("id", id);

    await writeAuditLog({
      actor_user_id: auth.user.id,
      actor_role: (auth.user as any).role || "superadmin",
      action: "admin.dispute.resolve",
      entity_type: "booking",
      entity_id: id,
      metadata: {
        dispute_id: (dispute as any).id,
        resolution,
        refund_amount: resolution.includes("refund") ? (refund_amount || bookingData.total_amount) : null,
        notes: notes || null,
      },
    });

    // Send OneSignal notifications
    try {
      const { sendToUser } = await import("@/lib/notifications/onesignal");
      
      const resolutionMessage =
        resolution === "refund_full"
          ? "Your dispute has been resolved with a full refund."
          : resolution === "refund_partial"
          ? `Your dispute has been resolved with a partial refund of ZAR ${refund_amount}.`
          : "Your dispute has been reviewed and the decision is in favor of the provider.";

      // Notify customer
      await sendToUser(bookingData.customer_id, {
        title: "Dispute Resolved",
        message: resolutionMessage,
        data: {
          type: "dispute_resolved",
          booking_id: id,
          resolution,
        },
        url: `/account-settings/bookings/${id}`,
      });

      // Notify provider
      const { data: providerRow } = await supabase
        .from("providers")
        .select("user_id")
        .eq("id", bookingData.provider_id)
        .single();

      const providerUserId = (providerRow as any)?.user_id;
      if (providerUserId) {
        await sendToUser(providerUserId, {
          title: "Dispute Resolved",
          message: `A dispute for booking ${bookingData.booking_number} has been resolved.`,
          data: {
            type: "dispute_resolved",
            booking_id: id,
            resolution,
          },
          url: `/provider/bookings/${id}`,
        });
      }
    } catch (notifError) {
      console.error("Error sending notifications:", notifError);
      // Don't fail the request if notifications fail
    }

    return NextResponse.json({
      data: updatedDispute,
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/bookings/[id]/dispute/resolve:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to resolve dispute",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
