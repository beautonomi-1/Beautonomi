import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection } from "@/lib/supabase/api-helpers";
import { unauthorizedResponse } from "@/lib/auth/requireRole";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit/audit";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { fetchBookingInAdminTenant } from "@/lib/tenant/admin-booking-tenant";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";
import { enforcePeriodLock } from "@/lib/finance/period-lock";
import { getCollectedTotalForBooking } from "@/lib/finance/get-collected-total-for-booking";

const refundSchema = z.object({
  amount: z.number().min(0.01).optional(), // If not provided, full refund
  reason: z.string().min(1, "Refund reason is required"),
});

type PaymentTransactionRow = {
  id: string;
  status: string;
  amount: number | string;
  booking_id: string;
  reference?: string;
  provider?: string;
};

type BookingRow = {
  customer_id: string;
  currency?: string;
  booking_number: string;
  provider_id: string;
  tenant_id?: string | null;
};

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
    const { user } = await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    if (!user) {
      return unauthorizedResponse("Authentication required");
    }

    const { txId } = await params;
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
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

    const txData = transaction as PaymentTransactionRow;

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

    const bookingLoad = await fetchBookingInAdminTenant(
      supabase,
      txData.booking_id,
      tenantId,
      "*"
    );
    if ("error" in bookingLoad) {
      const st = bookingLoad.error.status;
      return NextResponse.json(
        {
          data: null,
          error: {
            message: st === 403 ? "Booking belongs to another market" : "Booking not found",
            code: st === 403 ? "TENANT_MISMATCH" : "BOOKING_NOT_FOUND",
          },
        },
        { status: st }
      );
    }

    const bookingData = bookingLoad.booking as BookingRow;
    const effectiveTenantId = bookingData.tenant_id ?? tenantId;
    const tenantRegion = effectiveTenantId ? await getTenantRegionConfig(effectiveTenantId) : null;
    const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;
    const collectedCap = await getCollectedTotalForBooking(supabase, txData.booking_id);
    const maxRefundable = Math.min(Number(txData.amount), collectedCap);
    const requestedRefund = validationResult.data.amount ?? Number(txData.amount);
    if (requestedRefund > maxRefundable) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message:
              "Refund amount cannot exceed this transaction's amount or remaining collected total for the booking (after prior refunds)",
            code: "INVALID_REFUND_AMOUNT",
          },
        },
        { status: 400 }
      );
    }
    const refundAmount = requestedRefund;
    const { reason } = validationResult.data;

    const financeTenantId = await resolveTenantIdForFinanceLedger(supabase, {
      tenant_id: bookingData.tenant_id ?? tenantId,
      provider_id: bookingData.provider_id,
    });
    const lockGuard = await enforcePeriodLock(supabase, financeTenantId, new Date().toISOString());
    if (lockGuard) return lockGuard;

    // Credit customer wallet (refunds always go to wallet)
    const rpc = supabase.rpc as unknown as (name: string, args: Record<string, unknown>) => Promise<{ error: unknown }>;
    const { error: walletError } = await rpc("wallet_credit_admin", {
      p_user_id: bookingData.customer_id,
      p_amount: refundAmount,
      p_currency: bookingData.currency || lastResortCurrency,
      p_description: `Refund for booking ${bookingData.booking_number}: ${reason}`,
      p_reference_id: txId,
      p_reference_type: "refund",
      p_tenant_id: financeTenantId,
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

    // Update transaction status
    await supabase
      .from("payment_transactions")
      .update({
        status: newTransactionStatus,
        refund_amount: refundAmount,
        refund_reference: refundReference,
        refund_reason: reason,
        refunded_at: new Date().toISOString(),
        refunded_by: user.id,
      })
      .eq("id", txId);

    // Record in booking_refunds so update_booking_payment_status keeps totals in sync
    await supabase.from("booking_refunds").insert({
      booking_id: txData.booking_id,
      amount: refundAmount,
      reason,
      refund_method: "store_credit",
      status: "completed",
      created_by: user.id,
    });

    // Create refund transaction record (ledger)
    await supabase
      .from("payment_transactions")
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

    // NOTE: finance_transactions row is written by trigger
    // `create_finance_ledger_from_booking_refund` (migration 490) via the
    // booking_refunds insert above. App-side insertion here would duplicate the
    // ledger (B1).

    // Audit log
    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
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
      await sendToUser(
        bookingData.customer_id,
        {
          title: "Refund added to wallet",
          message: `A refund of ${bookingData.currency || lastResortCurrency} ${refundAmount} for booking ${bookingData.booking_number} has been added to your wallet. Use it for your next booking or request a payout.`,
          data: {
            type: "refund_processed",
            booking_id: txData.booking_id,
            refund_reference: refundReference,
          },
          url: "/account-settings/wallet",
        },
        ["push"],
        { appType: "customer" }
      );

      const { data: providerRow } = await supabase
        .from("providers")
        .select("user_id")
        .eq("id", bookingData.provider_id)
        .single();

      const providerUserId = (providerRow as { user_id?: string } | null)?.user_id;
      if (providerUserId) {
        await sendToUser(
          providerUserId,
          {
            title: "Refund Processed",
            message: `A refund has been processed for booking ${bookingData.booking_number}.`,
            data: {
              type: "refund_processed_provider",
              booking_id: txData.booking_id,
              refund_reference: refundReference,
            },
            url: `/provider/bookings/${txData.booking_id}`,
          },
          ["push"],
          { appType: "provider" }
        );
      }
    } catch (notifError) {
      console.error("Error sending refund notifications:", notifError);
    }

    void import("@/lib/integrations/slack/ops-triggers")
      .then(({ slackNotifyHighValueRefund }) =>
        slackNotifyHighValueRefund({
          tenantId,
          refundId: String(refundReference),
          bookingId: txData.booking_id,
          amountMajor: refundAmount,
          stage: "processed",
          actorUserId: user.id,
          reason,
        }),
      )
      .catch(() => undefined);

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
