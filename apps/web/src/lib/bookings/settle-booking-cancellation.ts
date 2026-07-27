/**
 * Shared finance settlement for booking cancellations and no-shows.
 * Ensures wallet refunds, ledger clawbacks (via booking_refunds trigger),
 * idempotent cancellation_fee rows, loyalty, and gift-card voids stay consistent.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";
import type { CancellationPolicy } from "@/lib/bookings/cancellation-policy";
import {
  computeInPersonRefundableCap,
  fetchBookingPaymentsForRefundCap,
  fetchCompletedInPersonRefundsTotal,
} from "@/lib/bookings/booking-refund-limits";
import {
  computeCancellationRefundAmount,
  processBookingRefund,
  roundCurrency2,
  type RefundResult,
} from "@/lib/bookings/refund-processing";

export type CancellationSettledBy =
  | "customer"
  | "provider"
  | "portal"
  | "admin"
  | "no_show";

export interface BookingFinancialSnapshot {
  id: string;
  provider_id: string;
  customer_id?: string | null;
  booking_number?: string | null;
  tenant_id?: string | null;
  subtotal?: number | null;
  discount_amount?: number | null;
  tax_amount?: number | null;
  service_fee_amount?: number | null;
  travel_fee?: number | null;
  tip_amount?: number | null;
  total_amount?: number | null;
  total_paid?: number | null;
  total_refunded?: number | null;
  wallet_amount?: number | null;
  gift_card_amount?: number | null;
  loyalty_points_used?: number | null;
  loyalty_points_redeemed?: number | null;
  loyalty_points_earned?: number | null;
}

export interface SettleBookingCancellationParams {
  booking: BookingFinancialSnapshot;
  cancelledBy: CancellationSettledBy;
  currency: string;
  policy: CancellationPolicy | null;
  isLateCancellation?: boolean;
  /** Explicit fee override; when omitted, computed from policy + cancelledBy. */
  explicitCancellationFee?: number | null;
  /** Refund gross total basis — use pre-fee-adjustment booking total. */
  refundBookingTotal?: number;
  /** Cap wallet credit to collected funds. */
  maxWalletCredit?: number;
  /** When true, void gift card redemption after a full refund. */
  voidGiftCardOnFullRefund?: boolean;
  /** Provider at till: reverse on card machine vs wallet credit for non-terminal portion. */
  refundRail?: "terminal" | "wallet";
}

export interface SettleBookingCancellationResult {
  cancellationFeeApplied: number;
  policyRefundAmount: number;
  walletRefundAmount: number;
  terminalRefundDue: number;
  refundResult: RefundResult;
  cancellationFeeLedgerPosted: boolean;
  loyaltyRedeemedRestored: boolean;
  loyaltyEarnClawedBack: boolean;
  giftCardVoidAttempted: boolean;
  refundRail?: "terminal" | "wallet";
}

export function computeEffectiveCollectedAmount(booking: BookingFinancialSnapshot): number {
  const totalPaid = roundCurrency2(Math.max(0, Number(booking.total_paid ?? 0)));
  const walletCollected = roundCurrency2(Math.max(0, Number(booking.wallet_amount ?? 0)));
  const giftCardCollected = roundCurrency2(Math.max(0, Number(booking.gift_card_amount ?? 0)));
  return roundCurrency2(
    Math.max(
      0,
      Math.max(totalPaid, walletCollected + giftCardCollected) -
        Number(booking.total_refunded ?? 0),
    ),
  );
}

export function computeReconciledCancellationAmounts(
  params: SettleBookingCancellationParams,
): {
  cancellationFeeApplied: number;
  policyRefundAmount: number;
  walletRefundAmount: number;
  isLate: boolean;
} {
  const bookingTotal = Number(params.refundBookingTotal ?? params.booking.total_amount ?? 0);
  const effectiveCollected =
    params.maxWalletCredit ?? computeEffectiveCollectedAmount(params.booking);
  const { cancellationFeeApplied: theoreticalFee, policyRefundAmount, isLate } =
    computeCancellationFeeForSettlement(params);

  // Mirror settleBookingCancellation: when a full refund will void the gift
  // card, exclude that leg from the wallet credit so the customer is not
  // refunded twice for the same money.
  const giftCardCollected = roundCurrency2(
    Math.max(0, Number(params.booking.gift_card_amount ?? 0)),
  );
  const willVoidGiftCard =
    params.voidGiftCardOnFullRefund !== false &&
    giftCardCollected > 0 &&
    policyRefundAmount + 0.01 >= bookingTotal;
  const refundableWithoutGift = roundCurrency2(
    Math.max(0, effectiveCollected - (willVoidGiftCard ? giftCardCollected : 0)),
  );

  const walletRefundAmount = roundCurrency2(
    Math.min(policyRefundAmount, refundableWithoutGift),
  );
  const cancellationFeeApplied = roundCurrency2(
    Math.max(
      0,
      Math.min(
        theoreticalFee,
        effectiveCollected -
          walletRefundAmount -
          (willVoidGiftCard ? giftCardCollected : 0),
      ),
    ),
  );
  return { cancellationFeeApplied, policyRefundAmount, walletRefundAmount, isLate };
}

export function computeCancellationFeeForSettlement(
  params: SettleBookingCancellationParams,
): { cancellationFeeApplied: number; policyRefundAmount: number; isLate: boolean } {
  const bookingTotal = Number(params.refundBookingTotal ?? params.booking.total_amount ?? 0);
  const isLate = params.isLateCancellation === true;

  if (params.cancelledBy === "provider" || params.cancelledBy === "admin") {
    const explicit = params.explicitCancellationFee;
    if (explicit != null && Number.isFinite(Number(explicit))) {
      const fee = roundCurrency2(Math.max(0, Number(explicit)));
      return {
        cancellationFeeApplied: fee,
        policyRefundAmount: roundCurrency2(Math.max(0, bookingTotal - fee)),
        isLate,
      };
    }
    return { cancellationFeeApplied: 0, policyRefundAmount: bookingTotal, isLate: false };
  }

  if (params.cancelledBy === "no_show") {
    const fee = roundCurrency2(Math.max(0, Number(params.explicitCancellationFee ?? 0)));
    return {
      cancellationFeeApplied: fee,
      policyRefundAmount: roundCurrency2(Math.max(0, bookingTotal - fee)),
      isLate: false,
    };
  }

  if (!params.policy) {
    return { cancellationFeeApplied: 0, policyRefundAmount: bookingTotal, isLate };
  }

  const policyRefundAmount = computeCancellationRefundAmount(bookingTotal, params.policy, isLate);
  const cancellationFeeApplied = roundCurrency2(Math.max(0, bookingTotal - policyRefundAmount));
  return { cancellationFeeApplied, policyRefundAmount, isLate };
}

export async function insertCancellationFeeLedgerIdempotent(
  admin: SupabaseClient,
  params: {
    bookingId: string;
    providerId: string;
    tenantId?: string | null;
    amount: number;
    description: string;
  },
): Promise<boolean> {
  if (params.amount <= 0) return false;

  const { data: existing } = await admin
    .from("finance_transactions")
    .select("id")
    .eq("booking_id", params.bookingId)
    .eq("transaction_type", "cancellation_fee")
    .maybeSingle();

  if (existing) return false;

  const financeTenantId = await resolveTenantIdForFinanceLedger(admin, {
    tenant_id: params.tenantId ?? null,
    provider_id: params.providerId,
  });

  const { error } = await admin.from("finance_transactions").insert({
    tenant_id: financeTenantId,
    booking_id: params.bookingId,
    provider_id: params.providerId,
    transaction_type: "cancellation_fee",
    amount: params.amount,
    fees: 0,
    commission: 0,
    net: params.amount,
    description: params.description,
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.error("[settleBookingCancellation] cancellation_fee insert failed:", error);
    return false;
  }
  return true;
}

async function restoreRedeemedLoyalty(
  admin: SupabaseClient,
  booking: BookingFinancialSnapshot,
  reason: string,
): Promise<boolean> {
  const customerId = booking.customer_id;
  const pointsToRefund = Number(
    booking.loyalty_points_used ?? booking.loyalty_points_redeemed ?? 0,
  );
  if (pointsToRefund <= 0 || !customerId) return false;
  try {
    const { refundRedeemedLoyaltyPoints } = await import("@/lib/loyalty/refund-redeemed-points");
    await refundRedeemedLoyaltyPoints(admin, {
      bookingId: booking.id,
      customerId,
      pointsRedeemed: pointsToRefund,
      reason,
    });
    return true;
  } catch (err) {
    console.error("[settleBookingCancellation] loyalty redeem restore failed:", err);
    return false;
  }
}

async function clawBackEarnedLoyalty(
  admin: SupabaseClient,
  booking: BookingFinancialSnapshot,
): Promise<boolean> {
  const customerId = booking.customer_id;
  const loyaltyPointsEarned = Number(booking.loyalty_points_earned ?? 0);
  if (loyaltyPointsEarned <= 0 || !customerId) return false;

  try {
    const { data: existingClaw } = await admin
      .from("loyalty_points_ledger")
      .select("id")
      .eq("booking_id", booking.id)
      .eq("customer_id", customerId)
      .contains("metadata", { source: "booking_cancel_earn_clawback" })
      .maybeSingle();

    if (existingClaw) return false;

    const { error: clawErr } = await (admin.rpc as any)("append_loyalty_ledger_entry", {
      p_customer_id: customerId,
      p_transaction_type: "adjusted",
      p_points_amount: -loyaltyPointsEarned,
      p_booking_id: booking.id,
      p_description: `Points reversed for cancelled booking ${booking.booking_number || booking.id}`,
      p_metadata: { source: "booking_cancel_earn_clawback" },
      p_expires_at: null,
    });
    if (clawErr) {
      console.error("[settleBookingCancellation] loyalty earn clawback failed:", clawErr);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[settleBookingCancellation] loyalty earn clawback failed:", err);
    return false;
  }
}

async function maybeVoidGiftCardRedemption(
  admin: SupabaseClient,
  bookingId: string,
  policyRefundAmount: number,
  bookingTotal: number,
): Promise<boolean> {
  if (policyRefundAmount + 0.01 < bookingTotal) return false;
  try {
    const { error } = await (admin.rpc as any)("void_gift_card_redemption", {
      p_booking_id: bookingId,
    });
    if (error) {
      console.warn("[settleBookingCancellation] void_gift_card_redemption:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[settleBookingCancellation] void_gift_card_redemption:", err);
    return false;
  }
}

/**
 * Run post-status-change finance settlement for a cancelled or no-show booking.
 */
export async function settleBookingCancellation(
  params: SettleBookingCancellationParams,
): Promise<SettleBookingCancellationResult> {
  const admin = getSupabaseAdmin();
  const booking = params.booking;
  const bookingId = booking.id;
  const bookingTotal = Number(params.refundBookingTotal ?? booking.total_amount ?? 0);
  const effectiveCollected =
    params.maxWalletCredit ?? computeEffectiveCollectedAmount(booking);

  const { cancellationFeeApplied: theoreticalFee, policyRefundAmount, isLate } =
    computeCancellationFeeForSettlement(params);

  // On a full refund we also void the gift-card redemption (restoring balance
  // on the card). That gift leg must NOT also be credited to the wallet, or
  // the customer is refunded twice for the same money.
  const giftCardCollected = roundCurrency2(Math.max(0, Number(booking.gift_card_amount ?? 0)));
  const willVoidGiftCard =
    params.voidGiftCardOnFullRefund !== false &&
    giftCardCollected > 0 &&
    policyRefundAmount + 0.01 >= bookingTotal;
  const refundableWithoutGift = roundCurrency2(
    Math.max(0, effectiveCollected - (willVoidGiftCard ? giftCardCollected : 0)),
  );

  const walletRefundTarget = roundCurrency2(
    Math.min(policyRefundAmount, refundableWithoutGift),
  );

  let terminalRefundDue = 0;
  let walletCreditTarget = walletRefundTarget;
  const wantsTerminalRail =
    params.refundRail === "terminal" &&
    (params.cancelledBy === "provider" || params.cancelledBy === "no_show");

  if (wantsTerminalRail && walletRefundTarget > 0) {
    const bookingPayments = await fetchBookingPaymentsForRefundCap(
      admin,
      bookingId,
      booking.tenant_id,
    );
    const completedInPersonRefunds = await fetchCompletedInPersonRefundsTotal(admin, bookingId);
    const inPersonCap = computeInPersonRefundableCap(bookingPayments, completedInPersonRefunds);
    const candidateTerminal = roundCurrency2(Math.min(walletRefundTarget, inPersonCap));

    // Split wallet vs terminal when a PayCloud capture exists. The caller must
    // initiate the terminal reverse (or credit the terminal portion to wallet on failure).
    if (candidateTerminal > 0.01) {
      const { data: pcSale } = await admin
        .from("provider_paycloud_payments")
        .select("id")
        .eq("provider_id", booking.provider_id)
        .eq("booking_id", bookingId)
        .eq("status", "successful")
        .in("trans_type", [1, 11])
        .limit(1)
        .maybeSingle();
      if (pcSale?.id) {
        terminalRefundDue = candidateTerminal;
        walletCreditTarget = roundCurrency2(Math.max(0, walletRefundTarget - terminalRefundDue));
      }
    }
  }

  // Fee retained must reconcile with collected funds (deposit-only bookings).
  // Use the pre-gift-void collected amount so the retained fee still covers the
  // full non-refunded portion of what was actually taken.
  const cancellationFeeApplied = roundCurrency2(
    Math.max(0, Math.min(theoreticalFee, effectiveCollected - walletRefundTarget - (willVoidGiftCard ? giftCardCollected : 0))),
  );

  let refundResult: RefundResult = { success: true, amount: 0 };

  // The settlement-computed `walletRefundTarget` (= policyRefundAmount capped at
  // collected) is authoritative: it already nets out the retained fee
  // (cancellation_fee / no-show fee). We cap processBookingRefund at this target
  // — NOT raw collected — so the customer refund + retained fee always reconciles
  // to collected. Capping at raw collected would, for a no-show or fee scenario,
  // post a full refund while ALSO retaining the fee (double-credit).
  if (params.cancelledBy === "no_show" && walletRefundTarget > 0) {
    const noShowRefundPolicy: CancellationPolicy = {
      id: "no_show_settlement",
      provider_id: booking.provider_id,
      location_type: null,
      hours_before_cutoff: 0,
      grace_window_minutes: 0,
      policy_text: "No-show settlement",
      late_cancellation_type: "full_refund",
      is_active: true,
      refund_percentage: 100,
      fee_amount: 0,
      fee_type: "fixed",
    };
    refundResult = await processBookingRefund(
      bookingId,
      bookingTotal,
      params.currency,
      noShowRefundPolicy,
      { isLateCancellation: false, maxWalletCredit: walletCreditTarget },
    );
  } else if (params.policy && walletRefundTarget > 0) {
    refundResult = await processBookingRefund(
      bookingId,
      bookingTotal,
      params.currency,
      params.policy,
      {
        isLateCancellation:
          params.cancelledBy === "provider" || params.cancelledBy === "admin"
            ? false
            : isLate,
        maxWalletCredit: walletCreditTarget,
      },
    );
  } else if (
    (params.cancelledBy === "provider" || params.cancelledBy === "admin") &&
    walletRefundTarget > 0
  ) {
    const fullRefundPolicy: CancellationPolicy = {
      id: "provider_cancel_full",
      provider_id: booking.provider_id,
      location_type: null,
      hours_before_cutoff: 0,
      grace_window_minutes: 0,
      policy_text: "Provider cancellation",
      late_cancellation_type: "full_refund",
      is_active: true,
      refund_percentage: 100,
      fee_amount: 0,
      fee_type: "fixed",
    };
    refundResult = await processBookingRefund(
      bookingId,
      bookingTotal,
      params.currency,
      fullRefundPolicy,
      { isLateCancellation: false, maxWalletCredit: walletCreditTarget },
    );
  }

  const feeDescription =
    params.cancelledBy === "no_show"
      ? `No-show fee for booking ${booking.booking_number || bookingId}`
      : `Cancellation fee for booking ${booking.booking_number || bookingId} — provider-retained (${params.cancelledBy}${isLate ? ", late" : ""})`;

  const cancellationFeeLedgerPosted = await insertCancellationFeeLedgerIdempotent(admin, {
    bookingId,
    providerId: booking.provider_id,
    tenantId: booking.tenant_id,
    amount: cancellationFeeApplied,
    description: feeDescription,
  });

  const loyaltyReason =
    params.cancelledBy === "provider"
      ? "provider_cancel"
      : params.cancelledBy === "admin"
        ? "admin_cancel"
      : params.cancelledBy === "no_show"
        ? "no_show"
        : `${params.cancelledBy}_cancel`;

  const loyaltyRedeemedRestored = await restoreRedeemedLoyalty(admin, booking, loyaltyReason);
  const loyaltyEarnClawedBack =
    params.cancelledBy === "provider" ||
    params.cancelledBy === "admin" ||
    params.cancelledBy === "no_show" ||
    params.cancelledBy === "customer" ||
    params.cancelledBy === "portal"
      ? await clawBackEarnedLoyalty(admin, booking)
      : false;

  const giftCardVoidAttempted =
    params.voidGiftCardOnFullRefund !== false
      ? await maybeVoidGiftCardRedemption(admin, bookingId, policyRefundAmount, bookingTotal)
      : false;

  return {
    cancellationFeeApplied,
    policyRefundAmount,
    walletRefundAmount: walletCreditTarget,
    terminalRefundDue,
    refundResult,
    cancellationFeeLedgerPosted,
    loyaltyRedeemedRestored,
    loyaltyEarnClawedBack,
    giftCardVoidAttempted,
    refundRail: params.refundRail,
  };
}

const BOOKING_FINANCIAL_SELECT =
  "id, provider_id, customer_id, booking_number, tenant_id, location_type, subtotal, discount_amount, tax_amount, service_fee_amount, travel_fee, tip_amount, total_amount, total_paid, total_refunded, wallet_amount, gift_card_amount, currency, loyalty_points_used, loyalty_points_redeemed, loyalty_points_earned";

/** Load booking row and run finance settlement (for group cancel / participant removal). */
export async function settleBookingFinanceById(
  admin: SupabaseClient,
  bookingId: string,
  cancelledBy: CancellationSettledBy,
  options?: {
    explicitCancellationFee?: number | null;
    isLateCancellation?: boolean;
    policy?: CancellationPolicy | null;
  },
): Promise<SettleBookingCancellationResult | null> {
  const { data: row, error } = await admin
    .from("bookings")
    .select(BOOKING_FINANCIAL_SELECT)
    .eq("id", bookingId)
    .maybeSingle();

  if (error || !row) {
    console.error("[settleBookingFinanceById] booking lookup failed:", error);
    return null;
  }

  const b = row as BookingFinancialSnapshot & {
    location_type?: string | null;
    currency?: string | null;
  };
  const { getCancellationPolicy } = await import("@/lib/bookings/cancellation-policy");
  const { getTenantRegionConfig } = await import("@/lib/regions/config");
  const { LAST_RESORT_CURRENCY } = await import("@/lib/regions/last-resort-currency");

  const locType = (b.location_type as "at_salon" | "at_home") || "at_salon";
  const policy =
    options?.policy !== undefined
      ? options.policy
      : await getCancellationPolicy(admin, b.provider_id, locType);
  const tenantRegion = b.tenant_id ? await getTenantRegionConfig(b.tenant_id) : null;
  const currency = b.currency || tenantRegion?.defaultCurrency || LAST_RESORT_CURRENCY;
  const grossTotal = Number(b.total_amount ?? 0);

  return settleBookingCancellation({
    booking: { ...b, total_amount: grossTotal },
    cancelledBy,
    currency,
    policy,
    isLateCancellation: options?.isLateCancellation,
    explicitCancellationFee: options?.explicitCancellationFee,
    refundBookingTotal: grossTotal,
  });
}

/**
 * No-show settlement: post configured no-show fee and refund remainder.
 */
export async function settleBookingNoShow(params: {
  booking: BookingFinancialSnapshot;
  currency: string;
  noShowFeeEnabled: boolean;
  noShowFeeAmount: number;
  policy: CancellationPolicy | null;
}): Promise<SettleBookingCancellationResult> {
  const bookingTotal = Number(params.booking.total_amount ?? 0);
  const collected = computeEffectiveCollectedAmount(params.booking);
  const noShowFee = params.noShowFeeEnabled
    ? roundCurrency2(Math.min(Math.max(0, params.noShowFeeAmount), bookingTotal, collected))
    : 0;
  const refundTotal = roundCurrency2(Math.max(0, bookingTotal - noShowFee));

  return settleBookingCancellation({
    booking: params.booking,
    cancelledBy: "no_show",
    currency: params.currency,
    policy: params.policy,
    explicitCancellationFee: noShowFee,
    refundBookingTotal: bookingTotal,
  });
}
