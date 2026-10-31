import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError, errorResponse  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDERS_OPERATIONS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { fetchBookingInAdminTenant } from "@/lib/tenant/admin-booking-tenant";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { getTenantLocaleTagFromRegionConfig } from "@/lib/locale/tenant-locale";
import { issueAdminWalletRefund } from "@/lib/finance/issue-admin-wallet-refund";

/**
 * POST /api/admin/bookings/[id]/refund
 *
 * Process a refund for a booking. Refunds always credit the customer's wallet
 * (use for next booking). Uses booking_refunds so
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

    const { amount, reason, substitute_reason: substituteReason } = body as {
      amount?: number;
      reason?: string;
      substitute_reason?: string | null;
    };

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

    const { data: chargeRows } = await supabase
      .from("payment_transactions")
      .select("id, transaction_type, amount, refund_amount, created_at")
      .eq("booking_id", id)
      .in("status", ["success", "partially_refunded"])
      .in("transaction_type", ["charge", "additional_charge"])
      .order("created_at", { ascending: false });
    const charges = (chargeRows ?? []) as Array<{
      id: string;
      transaction_type?: string | null;
      amount?: unknown;
      refund_amount?: unknown;
    }>;
    const charge = charges.find((t) => t.transaction_type === "charge") ?? charges[0];

    const outcome = await issueAdminWalletRefund({
      supabase,
      tenantId: effectiveTenantId ?? tenantId,
      bookingId: id,
      amount,
      reason: reason || "Admin refund",
      actorUserId: user.id,
      actorRole: (user as { role?: string }).role || "superadmin",
      substituteReason: charge ? null : (substituteReason ?? null),
      ...(charge
        ? {
            transactionId: charge.id,
            originalChargeAmount: Math.max(0, Number(charge.amount ?? 0)),
            priorRefundAmount: Math.max(0, Number(charge.refund_amount ?? 0)),
          }
        : {
            bookingTenderMode: true,
            originalChargeAmount: totalCollected,
            priorRefundAmount: Number(b.total_refunded ?? 0),
          }),
    });

    if (outcome.success === false) {
      return errorResponse(outcome.error, outcome.code, outcome.httpStatus);
    }

    const refundId = outcome.refundId;

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

    return successResponse({
      id: refundId,
      booking_id: id,
      amount: outcome.amount,
      ...(outcome.providerBalanceWarning
        ? { provider_balance_warning: outcome.providerBalanceWarning }
        : {}),
    });
  } catch (error) {
    return handleApiError(error, "Failed to process refund");
  }
}
