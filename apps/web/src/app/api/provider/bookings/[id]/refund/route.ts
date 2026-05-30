import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { assertProviderUserCanAccessBookingBranch } from "@/lib/provider-booking/booking-branch-access";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { bookingTenantMismatchResponse } from "@/lib/tenant/provider-matches-host";
import { getTenantLocaleTagFromRegionConfig } from "@/lib/locale/tenant-locale";

/**
 * POST /api/provider/bookings/[id]/refund
 * 
 * Issue a refund for a booking
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check permission to process payments (refunds)
    const permissionCheck = await requirePermission('process_payments', request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;

    const supabase = await getSupabaseServer(request);
    const supabaseAdmin = getSupabaseAdmin();
    const hostTenantId = await resolveTenantIdWithZaFallback(request);
    const { id: bookingId } = await params;
    const body = await request.json();

    // Group payments/refunds are settled through participant bookings so wallet,
    // gift-card, and audit ledgers stay tied to the charged customer.
    if (bookingId.startsWith("group:")) {
      return errorResponse(
        "Group booking refunds must be issued from the individual participant bookings so wallet credits and audit trails stay accurate.",
        "GROUP_REFUND_UNSUPPORTED",
        400,
      );
    }

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Validate input
    const { 
      amount, 
      reason,
      notes 
    } = body;

    // §Refund-method 2026-05: provider-initiated bookings (walk-ins, cash/Yoco
    // takings) need an in-person refund — hand the money back at the desk —
    // instead of force-crediting a platform wallet the customer may not even
    // have an account for. `store_credit` keeps the original wallet behaviour;
    // `cash` records the refund for audit/ledger WITHOUT a wallet credit.
    const rawMethod =
      typeof body?.refund_method === "string" ? body.refund_method.trim().toLowerCase() : "";
    let refundMethod: "store_credit" | "cash";
    if (rawMethod === "cash" || rawMethod === "in_person" || rawMethod === "in-person") {
      refundMethod = "cash";
    } else if (rawMethod === "" || rawMethod === "store_credit" || rawMethod === "wallet") {
      refundMethod = "store_credit";
    } else {
      return errorResponse(
        "refund_method must be 'store_credit' or 'cash'",
        "VALIDATION_ERROR",
        400,
      );
    }

    if (!amount || amount <= 0) {
      return errorResponse(
        "Refund amount must be greater than 0",
        "VALIDATION_ERROR",
        400
      );
    }

    if (!reason) {
      return errorResponse(
        "Refund reason is required",
        "VALIDATION_ERROR",
        400
      );
    }

    // Verify booking exists and belongs to provider
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select(`
        id, 
        booking_number,
        ref_number,
        total_amount, 
        payment_status,
        provider_id, 
        customer_id,
        currency,
        tenant_id,
        location_id
      `)
      .eq("id", bookingId)
      .eq("provider_id", providerId)
      .single();

    if (bookingError || !booking) {
      return notFoundResponse("Booking not found");
    }

    const bookingMarketMismatch = bookingTenantMismatchResponse(
      hostTenantId,
      (booking as { tenant_id?: string | null }).tenant_id,
    );
    if (bookingMarketMismatch) return bookingMarketMismatch;

    const branchAccess = await assertProviderUserCanAccessBookingBranch(
      supabaseAdmin,
      user.id,
      user.role,
      providerId,
      (booking as { location_id?: string | null }).location_id ?? null
    );
    if (branchAccess.allowed === false) {
      return errorResponse(branchAccess.message, "FORBIDDEN", 403);
    }

    const bookingTenantId = (booking as { tenant_id?: string | null }).tenant_id;
    const tenantRegion = bookingTenantId ? await getTenantRegionConfig(bookingTenantId) : null;
    const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;
    const refundIntlLocale = getTenantLocaleTagFromRegionConfig(tenantRegion);
    const formatMoney = (amount: number) =>
      new Intl.NumberFormat(refundIntlLocale, {
        style: "currency",
        currency: lastResortCurrency,
      }).format(amount);

    // Check if booking is paid or partially paid (can refund both)
    if (booking.payment_status !== 'paid' && booking.payment_status !== 'partially_paid') {
      return errorResponse(
        "Can only refund paid or partially paid bookings",
        "INVALID_STATUS",
        400
      );
    }

    // Include wallet/gift coverage without double-counting newer synthetic
    // booking_payments rows that already feed total_paid.
    const { data: bookingData } = await supabase
      .from("bookings")
      .select("total_paid, total_refunded, wallet_amount, gift_card_amount")
      .eq("id", bookingId)
      .single();

    const totalPaid = bookingData?.total_paid || 0;
    const walletPaid = (bookingData as { wallet_amount?: number } | null)?.wallet_amount || 0;
    const giftPaid = (bookingData as { gift_card_amount?: number } | null)?.gift_card_amount || 0;
    const totalRefunded = bookingData?.total_refunded || 0;
    const totalCollectedAllSources = Math.max(totalPaid, walletPaid + giftPaid);
    const availableForRefund = totalCollectedAllSources - totalRefunded;

    // Validate refund amount
    if (amount > availableForRefund) {
      return errorResponse(
        `Refund amount (${formatMoney(amount)}) exceeds available refund amount (${formatMoney(availableForRefund)})`,
        "INVALID_AMOUNT",
        400
      );
    }

    const walletTenantId = await resolveTenantIdForFinanceLedger(supabaseAdmin, {
      tenant_id: (booking as { tenant_id?: string | null }).tenant_id,
      provider_id: (booking as { provider_id?: string | null }).provider_id ?? null,
    });

    // Wave 1.2 (audit 2026-04 final 100/100): money-safe ordering.
    //
    // Insert as `pending` first. The ledger trigger
    // `create_finance_ledger_from_booking_refund` (migration 490) only
    // posts to finance_transactions when status='completed', so the
    // ledger row will not exist if wallet credit fails. The booking
    // payment status trigger `update_booking_payment_status` only counts
    // `completed` refunds, so the booking is also untouched until success.
    const defaultNotes =
      refundMethod === "cash"
        ? "Provider refund – returned to customer in person"
        : "Provider refund – credited to customer wallet";
    const { data: refund, error: refundError } = await supabaseAdmin
      .from("booking_refunds")
      .insert({
        booking_id: bookingId,
        amount,
        reason,
        refund_method: refundMethod,
        status: "pending",
        notes: notes || defaultNotes,
        created_by: user.id,
      })
      .select()
      .single();

    if (refundError || !refund) {
      console.error("Error creating refund record:", refundError);
      return errorResponse("Failed to create refund record", "REFUND_ERROR", 500);
    }

    const refundId = (refund as { id: string }).id;

    // Move the money. For `store_credit` we credit the customer's wallet (the
    // only side-effect that can fail); if it fails we mark the refund `failed`
    // and return 5xx without ever flipping it to `completed`, so the ledger
    // trigger never fires. For `cash` (in-person) there is no wallet movement —
    // the provider hands the money back; we only record it for audit + ledger.
    if (refundMethod === "store_credit") {
      if (!booking.customer_id) {
        await supabaseAdmin
          .from("booking_refunds")
          .update({
            status: "failed",
            notes: "No customer account on this booking; use an in-person (cash) refund instead.",
          })
          .eq("id", refundId);
        return errorResponse(
          "This booking has no customer account to credit. Refund in person (cash) instead.",
          "NO_WALLET_CUSTOMER",
          400,
        );
      }
      const { error: walletError } = await (supabaseAdmin.rpc as any)("wallet_credit_admin", {
        p_user_id: booking.customer_id,
        p_amount: amount,
        p_currency: booking.currency || lastResortCurrency,
        p_description: `Refund for booking ${booking.booking_number || booking.ref_number || bookingId.slice(0, 8)}: ${reason}`,
        p_reference_id: bookingId,
        p_reference_type: "booking_refund",
        p_tenant_id: walletTenantId,
      });

      if (walletError) {
        console.error("Wallet credit failed; marking refund failed:", walletError);
        await supabaseAdmin
          .from("booking_refunds")
          .update({
            status: "failed",
            notes: `Wallet credit failed: ${walletError.message}`,
          })
          .eq("id", refundId);
        return errorResponse(
          "Failed to credit customer wallet. Refund recorded as failed; please retry.",
          "WALLET_ERROR",
          500,
        );
      }
    }

    // Wallet credited successfully — finalise the refund. The status flip
    // to `completed` triggers (a) the finance_transactions reversal row
    // via 490 and (b) the booking.payment_status recalculation via 126.
    const { error: finalizeErr } = await supabaseAdmin
      .from("booking_refunds")
      .update({ status: "completed" })
      .eq("id", refundId);

    if (finalizeErr) {
      // Wallet was credited but we couldn't finalise. Surface a 500 so
      // ops can re-finalise with a manual UPDATE; the wallet credit is
      // idempotent on `p_reference_id` so a retry will not double-pay.
      console.error("Refund finalize failed after wallet credit:", finalizeErr);
      return errorResponse(
        "Refund credited to wallet but failed to finalise; please re-trigger.",
        "FINALIZE_ERROR",
        500,
      );
    }

    // Record booking event for audit trail
    try {
      await supabaseAdmin.from("booking_events").insert({
        booking_id: bookingId,
        event_type: "refunded",
        event_data: {
          refund_id: refundId,
          amount,
          reason,
          refund_method: refundMethod,
        },
        created_by: user.id,
      });
    } catch (eventErr) {
      console.warn("Failed to create refund booking event:", eventErr);
    }

    // Keep full-refund detection aligned with the same all-source coverage cap.
    const newTotalRefunded = totalRefunded + amount;
    const isFullyRefunded = newTotalRefunded >= totalCollectedAllSources;

    // Notify the customer. Wallet refunds point at the wallet; in-person (cash)
    // refunds just confirm the money was returned at the salon. Skip entirely
    // when there is no customer account (walk-in cash refund with null customer).
    const bookingRef = booking.ref_number || booking.booking_number || bookingId.slice(0, 8).toUpperCase();
    const notifyTitle =
      refundMethod === "cash" ? "Refund processed" : "Refund added to wallet";
    const notifyMessage =
      refundMethod === "cash"
        ? `A refund of ${formatMoney(amount)} for booking ${bookingRef} has been returned to you in person.`
        : `A refund of ${formatMoney(amount)} for booking ${bookingRef} has been added to your wallet. Use it for your next booking or request a payout.`;
    const notifyUrl =
      refundMethod === "cash" ? `/account-settings/bookings/${bookingId}` : "/account-settings/wallet";
    if (booking.customer_id) {
      try {
        const { insertNotification } = await import("@/lib/notifications/insert-notification");
        await insertNotification({
          user_id: booking.customer_id,
          type: "refund_processed",
          title: notifyTitle,
          message: notifyMessage,
          data: {
            booking_id: bookingId,
            booking_ref: bookingRef,
            refund_id: (refund as { id: string }).id,
            amount,
            reason,
            refund_method: refundMethod,
          },
          action_url: notifyUrl,
        });

        const { sendToUser } = await import("@/lib/notifications/onesignal");
        await sendToUser(
          booking.customer_id,
          {
            title: notifyTitle,
            message: notifyMessage,
            data: { type: "refund_processed", booking_id: bookingId, refund_id: (refund as { id: string }).id },
            url: notifyUrl,
          },
          ["push"],
          { appType: "customer" }
        );
      } catch (notifError) {
        console.warn("Failed to create refund notification:", notifError);
      }
    }

    return successResponse({ 
      refund,
      refund_method: refundMethod,
      message:
        refundMethod === "cash"
          ? `Refund of ${formatMoney(amount)} recorded as returned in person`
          : `Refund of ${formatMoney(amount)} added to customer wallet`,
      fully_refunded: isFullyRefunded,
    });
  } catch (error) {
    return handleApiError(error, "Failed to process refund");
  }
}
