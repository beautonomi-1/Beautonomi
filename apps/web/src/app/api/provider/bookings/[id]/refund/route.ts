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
import {
  computeInPersonRefundableCap,
  fetchBookingPaymentsForRefundCap,
  fetchCompletedInPersonRefundsTotal,
} from "@/lib/bookings/booking-refund-limits";
import {
  cashRefundConfirmationDeadline,
  finalizeCashRefund,
  notifyCustomerCashRefundConfirmation,
} from "@/lib/bookings/cash-refund-confirmation";
import { getTenantLocaleTagFromRegionConfig } from "@/lib/locale/tenant-locale";
import { loadBookingRefundCoverage } from "@/lib/admin/booking-refund-coverage";
import { syncPaymentTransactionRefundState } from "@/lib/finance/sync-payment-transaction-refund";

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
    let refundMethod: "store_credit" | "cash" | "original";
    if (rawMethod === "cash" || rawMethod === "in_person" || rawMethod === "in-person") {
      refundMethod = "cash";
    } else if (
      rawMethod === "original" ||
      rawMethod === "terminal" ||
      rawMethod === "card" ||
      rawMethod === "paycloud"
    ) {
      refundMethod = "original";
    } else if (rawMethod === "" || rawMethod === "store_credit" || rawMethod === "wallet") {
      refundMethod = "store_credit";
    } else {
      return errorResponse(
        "refund_method must be 'store_credit', 'cash', or 'original' (card machine reversal)",
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
        location_id,
        loyalty_points_used,
        loyalty_points_redeemed,
        gift_card_amount
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

    const bookingPayments = await fetchBookingPaymentsForRefundCap(
      supabaseAdmin,
      bookingId,
      (booking as { tenant_id?: string | null }).tenant_id,
    );
    const completedInPersonRefunds = await fetchCompletedInPersonRefundsTotal(supabaseAdmin, bookingId);
    const inPersonCap = computeInPersonRefundableCap(bookingPayments, completedInPersonRefunds);

    if (refundMethod === "cash" && amount > inPersonCap) {
      return errorResponse(
        `Cash refunds are limited to ${formatMoney(inPersonCap)} collected in person on this booking. Amounts paid online must be refunded as wallet credit.`,
        "CASH_REFUND_CAP_EXCEEDED",
        400,
      );
    }

    if (refundMethod === "original" && amount > inPersonCap) {
      return errorResponse(
        `Card machine refunds are limited to ${formatMoney(inPersonCap)} collected on a terminal for this booking. Online portions should be refunded as wallet credit.`,
        "TERMINAL_REFUND_CAP_EXCEEDED",
        400,
      );
    }

    const linkedPaymentId =
      typeof body?.payment_id === "string" && body.payment_id.trim()
        ? body.payment_id.trim()
        : typeof body?.booking_payment_id === "string" && body.booking_payment_id.trim()
          ? body.booking_payment_id.trim()
          : null;

    if (refundMethod === "original" && linkedPaymentId) {
      const linked = bookingPayments.find((p) => String((p as { id?: string }).id ?? "") === linkedPaymentId);
      const provider = String(linked?.payment_provider ?? "").toLowerCase();
      if (!linked || (provider !== "paycloud" && provider !== "yoco")) {
        return errorResponse(
          "Select a card machine payment to reverse to the customer's card.",
          "INVALID_PAYMENT_FOR_TERMINAL_REFUND",
          400,
        );
      }
    }

    const requiresCustomerConfirmation = refundMethod === "cash" && !!booking.customer_id;
    const recordOnly =
      body?.record_only === true ||
      body?.record_only === "true" ||
      body?.record_only === 1;

    // Terminal reverse: send REFUND to PayCloud. Settlement writes booking_refunds
    // via webhook/reconcile — do not insert a completed booking_refund here or the
    // customer is told the money is returning while nothing hits the machine.
    if (refundMethod === "original" && !recordOnly) {
      const { data: pcPayments } = await supabaseAdmin
        .from("provider_paycloud_payments")
        .select("id, amount, tip_amount, cashback_amount, terminal_id, status, trans_type, metadata")
        .eq("provider_id", providerId)
        .eq("booking_id", bookingId)
        .eq("status", "successful")
        .order("created_at", { ascending: false })
        .limit(10);

      const salePayment = (pcPayments ?? []).find((p) => {
        const tt = Number(p.trans_type ?? 1);
        return tt === 1 || tt === 11;
      });

      if (!salePayment) {
        return errorResponse(
          "No card machine payment found to reverse on this booking. Use wallet credit, or complete the refund on the machine and record it as a card refund.",
          "NO_TERMINAL_PAYMENT",
          400,
        );
      }

      const { initiatePaycloudRefund } = await import("@/lib/payments/initiate-paycloud-refund");
      const { getPaycloudNotifyUrl } = await import("@/lib/payments/paycloud-credentials");
      const initiate = await initiatePaycloudRefund({
        supabase: supabaseAdmin,
        providerId,
        paymentId: salePayment.id,
        amount,
        processedBy: user.id,
        notifyUrl: getPaycloudNotifyUrl(request),
        terminalId: salePayment.terminal_id,
      });

      if (initiate.ok === false) {
        return errorResponse(
          initiate.message ||
            "Could not start the card machine refund. Complete it on the machine, then record it as a card refund.",
          initiate.code || "TERMINAL_REFUND_FAILED",
          initiate.status >= 400 ? initiate.status : 400,
        );
      }

      return successResponse({
        refund: null,
        refund_method: "original",
        paycloud_refund: initiate.refundPayment,
        pending_terminal: true,
        message: `Refund of ${formatMoney(amount)} sent to the card machine — follow the prompts. The booking updates when the machine confirms.`,
        fully_refunded: false,
      });
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
        : refundMethod === "original"
          ? "Provider refund – recorded after card machine reversal"
          : "Provider refund – credited to customer wallet";
    const { data: refund, error: refundError } = await supabaseAdmin
      .from("booking_refunds")
      .insert({
        booking_id: bookingId,
        payment_id: linkedPaymentId,
        amount,
        reason,
        refund_method: refundMethod,
        status: "pending",
        notes: notes || defaultNotes,
        created_by: user.id,
        customer_confirmation_required: requiresCustomerConfirmation,
        confirmation_deadline_at: requiresCustomerConfirmation
          ? cashRefundConfirmationDeadline()
          : null,
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
        p_idempotency_key: `provider_booking_refund:${refundId}`,
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

    if (requiresCustomerConfirmation) {
      const { data: providerRow } = await supabaseAdmin
        .from("providers")
        .select("business_name")
        .eq("id", providerId)
        .maybeSingle();
      const providerName =
        (providerRow as { business_name?: string } | null)?.business_name ?? "Your provider";
      const bookingRef =
        booking.ref_number || booking.booking_number || bookingId.slice(0, 8).toUpperCase();

      try {
        await notifyCustomerCashRefundConfirmation({
          customerId: booking.customer_id!,
          bookingId,
          bookingNumber: String(bookingRef),
          refundId,
          amountFormatted: formatMoney(amount),
          providerName,
          tenantId: (booking as { tenant_id?: string | null }).tenant_id,
        });
      } catch (notifErr) {
        console.warn("Failed to send cash refund confirmation request:", notifErr);
      }

      try {
        await supabaseAdmin.from("booking_events").insert({
          booking_id: bookingId,
          event_type: "refund_pending_confirmation",
          event_data: { refund_id: refundId, amount, reason, refund_method: refundMethod },
          created_by: user.id,
        });
      } catch (eventErr) {
        console.warn("Failed to create pending refund booking event:", eventErr);
      }

      return successResponse({
        refund,
        refund_method: refundMethod,
        pending_customer_confirmation: true,
        message: `Cash refund of ${formatMoney(amount)} recorded — awaiting customer confirmation`,
        fully_refunded: false,
      });
    }

    if (refundMethod === "cash") {
      const finalizeResult = await finalizeCashRefund(supabaseAdmin, refundId, bookingId, user.id);
      if (finalizeResult.error) {
        return errorResponse(finalizeResult.error, "FINALIZE_ERROR", 500);
      }
    } else if (refundMethod === "original") {
      const { error: finalizeErr } = await supabaseAdmin
        .from("booking_refunds")
        .update({ status: "completed" })
        .eq("id", refundId);
      if (finalizeErr) {
        return errorResponse("Failed to finalise card refund record.", "FINALIZE_ERROR", 500);
      }
    } else {
      // Wallet credited successfully — finalise the refund. The status flip
      // to `completed` triggers (a) the finance_transactions reversal row
      // via 490 and (b) the booking.payment_status recalculation via 126.
      const { error: finalizeErr } = await supabaseAdmin
        .from("booking_refunds")
        .update({ status: "completed" })
        .eq("id", refundId);

      if (finalizeErr) {
        console.error("Refund finalize failed after wallet credit:", finalizeErr);
        return errorResponse(
          "Refund credited to wallet but failed to finalise; please re-trigger.",
          "FINALIZE_ERROR",
          500,
        );
      }

      try {
        const coverage = await loadBookingRefundCoverage(supabaseAdmin, bookingId);
        await syncPaymentTransactionRefundState({
          supabase: supabaseAdmin,
          bookingId,
          cumulativeRefundAmount: coverage.walletCreditedTotal,
          reason,
          actorUserId: user.id,
        });
      } catch (syncErr) {
        console.warn("Failed to sync payment transaction after provider wallet refund:", syncErr);
      }
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
      refundMethod === "cash"
        ? "Refund processed"
        : refundMethod === "original"
          ? "Refund to your card"
          : "Refund added to wallet";
    const notifyMessage =
      refundMethod === "cash"
        ? `A refund of ${formatMoney(amount)} for booking ${bookingRef} has been returned to you in person.`
        : refundMethod === "original"
          ? `A refund of ${formatMoney(amount)} for booking ${bookingRef} is on its way back to your card. It may take a few days to appear on your statement.`
          : `A refund of ${formatMoney(amount)} for booking ${bookingRef} has been added to your wallet. Use it for your next booking or request a payout.`;
    const notifyUrl =
      refundMethod === "cash"
        ? `/account-settings/bookings/${bookingId}`
        : refundMethod === "original"
          ? `/account-settings/bookings/${bookingId}`
          : "/account-settings/wallet";
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

    if (isFullyRefunded) {
      try {
        const pointsToRefund = Number(
          (booking as { loyalty_points_used?: number | null }).loyalty_points_used ??
            (booking as { loyalty_points_redeemed?: number | null }).loyalty_points_redeemed ??
            0,
        );
        if (pointsToRefund > 0 && booking.customer_id) {
          const { refundRedeemedLoyaltyPoints } = await import("@/lib/loyalty/refund-redeemed-points");
          await refundRedeemedLoyaltyPoints(supabaseAdmin, {
            bookingId,
            customerId: booking.customer_id,
            pointsRedeemed: pointsToRefund,
            reason: "provider_refund",
          });
        }
      } catch (loyaltyErr) {
        console.warn("Failed to restore loyalty points on full refund:", loyaltyErr);
      }

      const giftCardAmount = Number((booking as { gift_card_amount?: number | null }).gift_card_amount ?? 0);
      if (giftCardAmount > 0) {
        try {
          await (supabaseAdmin.rpc as any)("void_gift_card_redemption", {
            p_booking_id: bookingId,
          });
        } catch (gcErr) {
          console.warn("Gift card void on full provider refund failed:", gcErr);
        }
      }
    }

    return successResponse({
      refund,
      refund_method: refundMethod,
      message:
        refundMethod === "cash"
          ? `Refund of ${formatMoney(amount)} recorded as returned in person`
          : refundMethod === "original"
            ? `Refund of ${formatMoney(amount)} recorded as returned to the customer's card`
            : `Refund of ${formatMoney(amount)} added to customer wallet`,
      fully_refunded: isFullyRefunded,
    });
  } catch (error) {
    return handleApiError(error, "Failed to process refund");
  }
}
