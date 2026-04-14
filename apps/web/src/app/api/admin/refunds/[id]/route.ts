import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { unauthorizedResponse } from "@/lib/auth/requireRole";
import { requireAdminSection, successResponse, errorResponse, handleApiError, notFoundResponse } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import { writeAuditLog } from "@/lib/audit/audit";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { fetchBookingInAdminTenant } from "@/lib/tenant/admin-booking-tenant";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { z } from "zod";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";
import { enforcePeriodLock } from "@/lib/finance/period-lock";

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
    const { user } = await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    if (!user) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
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
        booking:bookings!inner(
          id,
          booking_number,
          status,
          total_amount,
          customer_id,
          provider_id,
          tenant_id,
          customer:users!bookings_customer_id_fkey(id, full_name, email),
          provider:providers!bookings_provider_id_fkey(id, business_name)
        ),
        refunded_by_user:users!payment_transactions_refunded_by_fkey(id, full_name, email)
      `)
      .eq("id", id)
      .eq("booking.tenant_id", tenantId)
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
    const { user } = await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    if (!user) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
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

    // Only allow refunding successfully charged transactions
    if (transaction.status !== "success") {
      const statusMsg = transaction.status === "refunded" || transaction.status === "partially_refunded"
        ? "Transaction already refunded"
        : `Cannot refund a transaction with status "${transaction.status}"`;
      return errorResponse(statusMsg, "INVALID_STATUS", 400);
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

    const loaded = await fetchBookingInAdminTenant(
      supabase,
      transaction.booking_id,
      tenantId,
      "id, customer_id, booking_number, currency, tenant_id, provider_id, gift_card_amount"
    );
    if ("error" in loaded) return loaded.error;

    const bookingRow = loaded.booking as {
      customer_id: string;
      booking_number: string;
      currency?: string;
      tenant_id?: string | null;
      provider_id?: string | null;
      gift_card_amount?: number | null;
    };
    const effectiveTenantId = bookingRow.tenant_id ?? tenantId;
    const tenantRegion = effectiveTenantId ? await getTenantRegionConfig(effectiveTenantId) : null;
    const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;

    const customerId = bookingRow.customer_id;
    const bookingNumber = bookingRow.booking_number;
    const currency = bookingRow.currency || lastResortCurrency;
    const providerId = bookingRow.provider_id ?? null;

    const financeTenantId = await resolveTenantIdForFinanceLedger(supabase, {
      tenant_id: bookingRow.tenant_id ?? tenantId,
      provider_id: providerId,
    });

    // Period lock guard — prevent backdated writes into closed accounting periods
    const lockGuard = await enforcePeriodLock(supabase, financeTenantId, new Date().toISOString());
    if (lockGuard) return lockGuard;

    const rpc = supabase.rpc.bind(supabase) as unknown as (name: string, args: Record<string, unknown>) => Promise<{ error: unknown }>;
    const { error: walletError } = await rpc("wallet_credit_admin", {
      p_user_id: customerId,
      p_amount: refund_amount,
      p_currency: currency,
      p_description: `Refund for booking ${bookingNumber}: ${refund_reason}`,
      p_reference_id: id,
      p_reference_type: "refund",
      p_tenant_id: financeTenantId,
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

    const updateData: Record<string, unknown> = {
      refund_amount,
      refund_reason,
      refund_reference: refundReference,
      refunded_at: new Date().toISOString(),
      refunded_by: user.id,
      status: isFullRefund ? "refunded" : "partially_refunded",
    };

    const { data: updatedTransaction, error } = await supabase
      .from("payment_transactions")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    await supabase.from("booking_refunds").insert({
      booking_id: transaction.booking_id,
      amount: refund_amount,
      reason: refund_reason,
      refund_method: "store_credit",
      status: "completed",
      created_by: user.id,
    });

    // Negative amounts for refunds — consistent with refund-processing.ts,
    // admin/bookings/[id]/refund, and provider/bookings/[id]/refund.
    // getAvailablePayoutBalance reads net for refund rows; negative net claws back earnings.
    await supabase.from("finance_transactions").insert({
      tenant_id: financeTenantId,
      booking_id: transaction.booking_id,
      provider_id: providerId,
      transaction_type: "refund",
      amount: -refund_amount,
      fees: 0,
      commission: 0,
      net: -refund_amount,
      description: `Admin refund for booking ${bookingNumber}: ${refund_reason}`,
      created_at: new Date().toISOString(),
    });

    // Restore gift card balance if this is a full refund and the booking used a gift card
    let giftCardRestored = false;
    const giftCardAmount = Number(bookingRow.gift_card_amount ?? 0);
    if (isFullRefund && giftCardAmount > 0) {
      try {
        const rpcVoid = supabase.rpc.bind(supabase) as unknown as (name: string, args: Record<string, unknown>) => Promise<{ error: unknown }>;
        const { error: gcError } = await rpcVoid("void_gift_card_redemption", {
          p_booking_id: transaction.booking_id,
        });
        if (gcError) {
          console.warn("Gift card restoration failed:", gcError);
        } else {
          giftCardRestored = true;
        }
      } catch (gcErr) {
        console.warn("Gift card restoration error:", gcErr);
      }
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: "admin.refund.process",
      entity_type: "payment_transaction",
      entity_id: id,
      metadata: { refund_amount, refund_reason, notes, wallet_credit: true, gift_card_restored: giftCardRestored },
    });

    // 4. Notify customer
    try {
      const { sendToUser } = await import("@/lib/notifications/onesignal");
      await sendToUser(
        customerId,
        {
          title: "Refund added to wallet",
          message: `A refund of ${currency} ${refund_amount.toFixed(2)} for booking ${bookingNumber} has been added to your wallet. Use it for your next booking or request a payout.`,
          data: { type: "refund_processed", booking_id: transaction.booking_id, refund_reference: refundReference },
          url: "/account-settings/wallet",
        },
        ["push"],
        { appType: "customer" }
      );
    } catch (notifErr) {
      console.error("Refund notification failed:", notifErr);
    }

    // Check if refund pushed provider balance negative (post-payout refund risk)
    let providerBalanceWarning: string | null = null;
    if (providerId) {
      try {
        const { getAvailablePayoutBalance } = await import("@/lib/provider/available-payout-balance");
        const { rawBalance } = await getAvailablePayoutBalance(supabase, providerId, {
          tenantId: effectiveTenantId,
        });
        if (rawBalance < -0.01) {
          providerBalanceWarning = `Provider balance is now negative (${rawBalance.toFixed(2)}). This refund was issued after a payout. Consider clawback from future earnings.`;
        }
      } catch (balErr) {
        console.warn("Failed to check provider balance after refund:", balErr);
      }
    }

    return successResponse({
      ...(updatedTransaction as Record<string, unknown>),
      ...(providerBalanceWarning ? { provider_balance_warning: providerBalanceWarning } : {}),
    });
  } catch (error) {
    return handleApiError(error, "Failed to process refund");
  }
}
