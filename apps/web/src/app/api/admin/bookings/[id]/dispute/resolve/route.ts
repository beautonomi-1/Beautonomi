import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
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
    const supabase = getSupabaseAdmin();
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

    // Handle refunds: always credit customer wallet (no Paystack call)
    if (resolution === "refund_full" || resolution === "refund_partial") {
      const refundAmt =
        resolution === "refund_full"
          ? bookingData.total_amount
          : refund_amount || 0;

      if (refundAmt <= 0 || refundAmt > bookingData.total_amount) {
        return NextResponse.json(
          {
            data: null,
            error: {
              message: "Refund amount must be positive and cannot exceed booking total",
              code: "INVALID_REFUND_AMOUNT",
            },
          },
          { status: 400 }
        );
      }

      // Credit customer wallet
      const { error: walletError } = await (supabase.rpc as any)("wallet_credit_admin", {
        p_user_id: bookingData.customer_id,
        p_amount: refundAmt,
        p_currency: bookingData.currency || "ZAR",
        p_description: `Dispute resolution refund for booking ${bookingData.booking_number}`,
        p_reference_id: (dispute as any).id,
        p_reference_type: "booking_dispute",
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

      const refundReference = `dispute_refund_${(dispute as any).id}_${Date.now()}`;
      const newBookingPaymentStatus = refundAmt >= bookingData.total_amount ? "refunded" : "partially_refunded";

      // Optional: mark any success payment_transaction for this booking as refunded (ledger consistency)
      const { data: tx } = await (supabase
        .from("payment_transactions") as any)
        .select("id, amount")
        .eq("booking_id", id)
        .eq("status", "success")
        .neq("transaction_type", "refund")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (tx) {
        const txData = tx as any;
        const isFullRefund = refundAmt >= Number(txData.amount || 0);
        await (supabase
          .from("payment_transactions") as any)
          .update({
            status: isFullRefund ? "refunded" : "partially_refunded",
            refund_amount: refundAmt,
            refund_reference: refundReference,
            refund_reason: "booking_dispute",
            refunded_at: new Date().toISOString(),
            refunded_by: auth.user.id,
          })
          .eq("id", txData.id);
      }

      // booking_refunds so update_booking_payment_status trigger keeps totals in sync
      await (supabase.from("booking_refunds") as any).insert({
        booking_id: id,
        amount: refundAmt,
        reason: "Dispute resolution",
        refund_method: "store_credit",
        status: "completed",
        created_by: auth.user.id,
      });

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
          ? "Your dispute has been resolved with a full refund. The amount has been added to your wallet—use it for your next booking or request a payout."
          : resolution === "refund_partial"
          ? `Your dispute has been resolved with a partial refund of ${bookingData.currency || "ZAR"} ${refund_amount ?? 0}. The amount has been added to your wallet.`
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
