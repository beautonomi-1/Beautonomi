import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError, errorResponse  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDERS_OPERATIONS } from "@/lib/admin-sections";
import { writeAuditLog } from "@/lib/audit/audit";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { fetchBookingInAdminTenant } from "@/lib/tenant/admin-booking-tenant";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";
import { getTenantLocaleTagFromRegionConfig } from "@/lib/locale/tenant-locale";
import { enforcePeriodLock } from "@/lib/finance/period-lock";

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
    const { user } = await requireAdminSection(ADMIN_SECTION_PROVIDERS_OPERATIONS, request);
    if (!user) throw new Error("Authentication required");
    const { id } = await params;
    const supabase = getSupabaseAdmin();
    if (!supabase) throw new Error("Admin client unavailable");
    const body = await request.json();

    const { amount, reason } = body;

    if (!amount || amount <= 0) {
      return errorResponse("Invalid refund amount", "VALIDATION_ERROR", 400);
    }

    const tenantId = await resolveAdminApiTenantId(request);
    const loaded = await fetchBookingInAdminTenant(
      supabase,
      id,
      tenantId,
      "id, total_amount, total_paid, total_refunded, customer_id, booking_number, currency, payment_status, tenant_id, provider_id, wallet_amount, gift_card_amount"
    );
    if ("error" in loaded) return loaded.error;

    const effectiveTenantId =
      (loaded.booking as { tenant_id?: string | null }).tenant_id ?? tenantId;
    const tenantRegion = effectiveTenantId ? await getTenantRegionConfig(effectiveTenantId) : null;
    const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;
    const adminRefundLocale = getTenantLocaleTagFromRegionConfig(tenantRegion);

    const b = loaded.booking as {
      total_amount: number;
      total_paid?: number;
      total_refunded?: number;
      payment_status?: string;
      customer_id: string;
      booking_number: string;
      currency?: string;
      provider_id?: string | null;
      wallet_amount?: number;
      gift_card_amount?: number;
    };

    if (b.payment_status !== "paid" && b.payment_status !== "partially_paid") {
      return errorResponse("Can only refund paid or partially paid bookings", "INVALID_STATUS", 400);
    }

    // Post-582 `total_paid` usually includes synthetic wallet/gift rows. Use the
    // larger coverage estimate so legacy rows still refund correctly without double-counting.
    const totalCollected = Math.max(
      Number(b.total_paid ?? 0),
      Number(b.wallet_amount ?? 0) + Number(b.gift_card_amount ?? 0),
    );
    const availableForRefund = totalCollected - (b.total_refunded ?? 0);
    if (amount > availableForRefund) {
      const displayCurrency = b.currency || lastResortCurrency;
      const fmtAvail = new Intl.NumberFormat(adminRefundLocale, {
        style: "currency",
        currency: displayCurrency,
      }).format(availableForRefund);
      return errorResponse(
        `Refund amount exceeds available refund amount (${fmtAvail})`,
        "VALIDATION_ERROR",
        400
      );
    }

    const financeTenantId = await resolveTenantIdForFinanceLedger(supabase, {
      tenant_id: (loaded.booking as { tenant_id?: string | null }).tenant_id ?? tenantId,
      provider_id: b.provider_id ?? null,
    });
    const lockGuard = await enforcePeriodLock(supabase, financeTenantId, new Date().toISOString());
    if (lockGuard) return lockGuard;

    // §Final-audit 2026-04: order matters.
    //   Previously: wallet credit → booking_refunds insert. If the
    //   refund row insert failed (RLS, schema drift, period lock), the
    //   wallet stayed credited with no matching refund / ledger record,
    //   and reconciliation silently drifted.
    //   Now: insert booking_refunds FIRST (status='pending'), then
    //   credit wallet, then flip refund to 'completed'. Trigger 490 keys
    //   on `source_refund_id`, so the ledger row only lands once the
    //   status reaches 'completed'. If the wallet credit fails, the
    //   `pending` refund is deleted — everything rolls back cleanly.
    const { data: refund, error: refundError } = await supabase
      .from("booking_refunds")
      .insert({
        booking_id: id,
        amount,
        reason: reason || "Admin refund",
        refund_method: "store_credit",
        status: "pending",
        created_by: user.id,
      })
      .select()
      .single();

    if (refundError || !refund) {
      return handleApiError(refundError, "Failed to create refund");
    }

    const refundId = (refund as { id: string }).id;

    const rpc = supabase.rpc.bind(supabase) as unknown as (name: string, args: Record<string, unknown>) => Promise<{ error: unknown }>;
    const { error: walletError } = await rpc("wallet_credit_admin", {
      p_user_id: b.customer_id,
      p_amount: amount,
      p_currency: b.currency || lastResortCurrency,
      p_description: `Refund for booking ${b.booking_number}: ${reason || "Admin refund"}`,
      p_reference_id: id,
      p_reference_type: "booking_refund",
      p_tenant_id: financeTenantId,
    });

    if (walletError) {
      console.error("Wallet credit failed; rolling back refund:", walletError);
      await supabase.from("booking_refunds").delete().eq("id", refundId);
      return errorResponse("Failed to credit customer wallet", "WALLET_ERROR", 500);
    }

    const { error: completeError } = await supabase
      .from("booking_refunds")
      .update({ status: "completed" })
      .eq("id", refundId);
    if (completeError) {
      console.error("Failed to flip refund to completed after wallet credit:", completeError);
      // Wallet is credited and refund row exists in 'pending' — a daily
      // reconciler should catch and complete this. Better than silently
      // treating as completed.
    }

    // NOTE: finance_transactions row is written by trigger
    // `create_finance_ledger_from_booking_refund` (migration 490) keyed by
    // `source_refund_id`. A manual app-side insert here was the B1 double-write
    // bug.

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: (user as { role?: string }).role || "superadmin",
      action: "admin.refund.create",
      entity_type: "refund",
      entity_id: refundId,
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

      try {
        const { matchWaitlistOnCancellation } = await import("@/lib/waitlist/matching");
        await matchWaitlistOnCancellation(supabase, id);
      } catch (waitlistErr) {
        console.error("[admin refund cancel] waitlist matching failed:", waitlistErr);
      }
    }

    try {
      const { sendToUser } = await import("@/lib/notifications/onesignal");
      await sendToUser(
        b.customer_id,
        {
          title: "Refund added to wallet",
          message: `A refund of ${b.currency || lastResortCurrency} ${amount.toFixed(2)} for booking ${b.booking_number} has been added to your wallet. Use it for your next booking or request a payout.`,
          data: { type: "refund_processed", booking_id: id, refund_id: (refund as { id: string }).id },
          url: "/account-settings/wallet",
        },
        ["push"],
        { appType: "customer" }
      );
    } catch (notifError) {
      console.error("Error sending notification:", notifError);
    }

    return successResponse(refund);
  } catch (error) {
    return handleApiError(error, "Failed to process refund");
  }
}
