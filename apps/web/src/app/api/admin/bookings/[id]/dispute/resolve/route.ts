import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection } from "@/lib/supabase/api-helpers";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit/audit";
import { ADMIN_SECTION_PROVIDERS_OPERATIONS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { fetchBookingInAdminTenant } from "@/lib/tenant/admin-booking-tenant";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";
import { getCollectedTotalForBooking } from "@/lib/finance/get-collected-total-for-booking";

const resolveDisputeSchema = z.object({
  resolution: z.enum(["refund_full", "refund_partial", "deny"]),
  refund_amount: z.number().min(0).optional(),
  notes: z.string().optional().nullable(),
});

type BookingRow = {
  customer_id: string;
  provider_id: string;
  total_amount: number;
  booking_number: string;
  currency?: string;
  status: string;
  tenant_id?: string | null;
};

type DisputeRow = { id: string };

type PaymentTxRow = { id: string; amount?: number | string };

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
    const { user } = await requireAdminSection(ADMIN_SECTION_PROVIDERS_OPERATIONS, request);

    const { id } = await params;
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { data: null, error: { message: "Database unavailable", code: "SERVER_ERROR" } },
        { status: 500 }
      );
    }
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

    const tenantId = await resolveAdminApiTenantId(request);
    const bookingLoad = await fetchBookingInAdminTenant(supabase, id, tenantId, "*");
    if ("error" in bookingLoad) {
      const st = bookingLoad.error.status;
      return NextResponse.json(
        {
          data: null,
          error: {
            message: st === 403 ? "Booking belongs to another market" : "Booking not found",
            code: st === 403 ? "TENANT_MISMATCH" : "NOT_FOUND",
          },
        },
        { status: st }
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

    const { resolution, refund_amount, notes } = validationResult.data;
    const bookingData = bookingLoad.booking as BookingRow;
    const effectiveTenantId = bookingData.tenant_id ?? tenantId;
    const tenantRegion = effectiveTenantId ? await getTenantRegionConfig(effectiveTenantId) : null;
    const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;

    // Handle refunds: always credit customer wallet (no Paystack call)
    if (resolution === "refund_full" || resolution === "refund_partial") {
      const collectedCap = await getCollectedTotalForBooking(supabase, id);
      const refundAmt =
        resolution === "refund_full"
          ? collectedCap
          : refund_amount || 0;

      if (refundAmt <= 0 || refundAmt > collectedCap) {
        return NextResponse.json(
          {
            data: null,
            error: {
              message: "Refund amount must be positive and cannot exceed collected amount minus prior refunds",
              code: "INVALID_REFUND_AMOUNT",
            },
          },
          { status: 400 }
        );
      }

      const disputeWalletTenantId = await resolveTenantIdForFinanceLedger(supabase, {
        tenant_id: bookingData.tenant_id ?? tenantId,
        provider_id: bookingData.provider_id,
      });

      const { data: pendingRefund, error: pendingRefundError } = await supabase
        .from("booking_refunds")
        .insert({
          booking_id: id,
          amount: refundAmt,
          reason: "Dispute resolution",
          refund_method: "store_credit",
          status: "pending",
          created_by: user.id,
        })
        .select("id")
        .single();

      if (pendingRefundError || !pendingRefund) {
        console.error("Failed to create pending dispute refund:", pendingRefundError);
        return NextResponse.json(
          {
            data: null,
            error: {
              message: "Failed to create refund record",
              code: "REFUND_CREATE_ERROR",
            },
          },
          { status: 500 },
        );
      }

      const disputeRefundId = (pendingRefund as { id: string }).id;

      const rpc = supabase.rpc as unknown as (name: string, args: Record<string, unknown>) => Promise<{ error: unknown }>;
      const { error: walletError } = await rpc("wallet_credit_admin", {
        p_user_id: bookingData.customer_id,
        p_amount: refundAmt,
        p_currency: bookingData.currency || lastResortCurrency,
        p_description: `Dispute resolution refund for booking ${bookingData.booking_number}`,
        p_reference_id: (dispute as DisputeRow).id,
        p_reference_type: "booking_dispute",
        p_tenant_id: disputeWalletTenantId,
        p_idempotency_key: `dispute_refund:${disputeRefundId}`,
      });

      if (walletError) {
        console.error("Wallet credit failed:", walletError);
        await supabase.from("booking_refunds").delete().eq("id", disputeRefundId);
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

      const refundReference = `dispute_refund_${(dispute as DisputeRow).id}_${Date.now()}`;

      // Optional: mark any success payment_transaction for this booking as refunded (ledger consistency)
      const { data: tx } = await supabase
        .from("payment_transactions")
        .select("id, amount")
        .eq("booking_id", id)
        .eq("status", "success")
        .neq("transaction_type", "refund")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (tx) {
        const txData = tx as PaymentTxRow;
        const isFullRefund = refundAmt >= Number(txData.amount ?? 0);
        await supabase
          .from("payment_transactions")
          .update({
            status: isFullRefund ? "refunded" : "partially_refunded",
            refund_amount: refundAmt,
            refund_reference: refundReference,
            refund_reason: "booking_dispute",
            refunded_at: new Date().toISOString(),
            refunded_by: user.id,
          })
          .eq("id", txData.id);
      }

      await supabase
        .from("booking_refunds")
        .update({ status: "completed" })
        .eq("id", disputeRefundId);

      // NOTE: finance_transactions row is written by trigger
      // `create_finance_ledger_from_booking_refund` (migration 490) via the
      // booking_refunds insert above. App-side insertion duplicates the ledger
      // (B1).
    }

    // Update dispute
    const { data: updatedDispute, error: disputeError } = await supabase
      .from("booking_disputes")
      .update({
        status: "resolved",
        resolution,
        refund_amount: resolution.includes("refund") ? (refund_amount ?? bookingData.total_amount) : null,
        resolved_at: new Date().toISOString(),
        resolved_by: user.id,
        notes: notes ?? null,
      })
      .eq("id", (dispute as DisputeRow).id)
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
    await supabase
      .from("bookings")
      .update({ status: newBookingStatus })
      .eq("id", id);

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: "admin.dispute.resolve",
      entity_type: "booking",
      entity_id: id,
      metadata: {
        dispute_id: (dispute as DisputeRow).id,
        resolution,
        refund_amount: resolution.includes("refund") ? (refund_amount || bookingData.total_amount) : null,
        notes: notes || null,
      },
    });

    // In-app rows + push via notification templates (customer + provider team)
    try {
      const { notifyDisputeResolved } = await import("@/lib/notifications/notification-service");

      const resolutionMessage =
        resolution === "refund_full"
          ? "Your dispute has been resolved with a full refund. The amount has been added to your wallet—use it for your next booking or request a payout."
          : resolution === "refund_partial"
          ? `Your dispute has been resolved with a partial refund of ${bookingData.currency || lastResortCurrency} ${refund_amount ?? 0}. The amount has been added to your wallet.`
          : "Your dispute has been reviewed and the decision is in favor of the provider.";

      await notifyDisputeResolved(
        id,
        resolutionMessage,
        resolution,
        (dispute as DisputeRow).id,
      );
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
