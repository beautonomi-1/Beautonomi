/**
 * Shared finance settlement for booking cancellations and no-shows.
 * Ensures wallet refunds, ledger clawbacks (via booking_refunds trigger),
 * idempotent cancellation_fee rows, loyalty, and gift-card voids stay consistent.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";
import { resolveLedgerCurrency } from "@/lib/ledger/resolve-ledger-currency";
import { postCancellationFeeShareLines } from "@/lib/payroll/cancellation-fee-share";
import { addMoney, subtractMoney } from "@beautonomi/utils";
import {
  GIFT_VALUE_STILL_DUE,
  bookingGiftVoidOutcome,
  giftValueStillDueAmount,
  giftValueStillDueMessage,
  refundableExcludingGiftStillDue,
  visitClosedForGiftReturn,
} from "@/lib/bookings/gift-value-still-due";
import type { CancellationPolicy } from "@/lib/bookings/cancellation-policy";
import {
  computeInPersonRefundableCap,
  fetchBookingPaymentsForRefundCap,
  fetchCompletedInPersonRefundsTotal,
} from "@/lib/bookings/booking-refund-limits";
import {
  ensureCancellationCashRefundObligation,
  sumNonTerminalInPersonCollected,
} from "@/lib/bookings/cancellation-cash-refund-obligation";
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
  status?: string | null;
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
  /**
   * Set only after `void_gift_card_redemption` actually restored the balance.
   * A captured redemption returns false from that RPC. Pass false so the gift
   * amount is credited to the wallet instead of disappearing.
   */
  giftCardRestored?: boolean | "unknown";
  /** Provider at till: reverse on card machine vs wallet credit for non-terminal portion. */
  refundRail?: "terminal" | "wallet";
}

export interface SettleBookingCancellationResult {
  cancellationFeeApplied: number;
  policyRefundAmount: number;
  walletRefundAmount: number;
  terminalRefundDue: number;
  /** Which rail owes `terminalRefundDue`. Yoco has no refund API: staff refund on the machine, then record it. */
  terminalRefundProvider?: "paycloud" | "yoco";
  refundResult: RefundResult;
  cancellationFeeLedgerPosted: boolean;
  loyaltyRedeemedRestored: boolean;
  loyaltyEarnClawedBack: boolean;
  /** True only when the void put the gift card balance back on the card. */
  giftCardVoidAttempted: boolean;
  giftCardRestored: boolean;
  /** True when a gift amount was kept out of the wallet because the void did not answer. */
  giftValueStillDue: boolean;
  /** A split-payment guest card refund did not finish. */
  guestShareRefundFailed: boolean;
  refundRail?: "terminal" | "wallet";
  /** Non-terminal in-person amount recorded (pending or completed cash refund row). */
  inPersonCashRefundDue: number;
}

/**
 * Portion of a terminal-rail cancel refund owed back on a Yoco machine: the in-person
 * candidate, capped at what was actually captured on Yoco for this booking.
 */
export function computeYocoTerminalRefundDue(
  bookingPayments: Array<{ payment_provider?: string | null; status?: string | null; amount?: number | string | null }>,
  candidateTerminal: number,
): number {
  const yocoCaptured = roundCurrency2(
    bookingPayments
      .filter(
        (p) =>
          String(p.payment_provider ?? "").toLowerCase() === "yoco" &&
          (p.status === "completed" || p.status === "partially_refunded"),
      )
      .reduce((sum, p) => addMoney(sum, Math.max(0, Number(p.amount ?? 0))), 0),
  );
  return roundCurrency2(Math.max(0, Math.min(candidateTerminal, yocoCaptured)));
}

export function computeEffectiveCollectedAmount(booking: BookingFinancialSnapshot): number {
  const totalPaid = roundCurrency2(Math.max(0, Number(booking.total_paid ?? 0)));
  const walletCollected = roundCurrency2(Math.max(0, Number(booking.wallet_amount ?? 0)));
  const giftCardCollected = roundCurrency2(Math.max(0, Number(booking.gift_card_amount ?? 0)));
  return roundCurrency2(
    Math.max(
      0,
      subtractMoney(Math.max(totalPaid, addMoney(walletCollected, giftCardCollected)), Number(booking.total_refunded ?? 0)),
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
  const intendsToRestoreGiftCard =
    params.voidGiftCardOnFullRefund !== false &&
    giftCardCollected > 0 &&
    policyRefundAmount + 0.01 >= bookingTotal;
  const willVoidGiftCard = intendsToRestoreGiftCard && params.giftCardRestored !== false;
  const refundableWithoutGift = roundCurrency2(
    Math.max(0, subtractMoney(effectiveCollected, willVoidGiftCard ? giftCardCollected : 0)),
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

/** Manual provider store_credit refunds: exclude the gift leg when a full refund voids redemption. */
export function walletStoreCreditAmountWhenVoidingGiftOnFullRefund(params: {
  refundAmount: number;
  giftCardCollected: number;
  totalRefundedBefore: number;
  totalCollectedAllSources: number;
  /**
   * Result of voiding the redemption before the credit.
   * Omit to assume the void restores the card.
   * `false` means the redemption is captured and cannot be undone, so the gift
   * stays in the wallet credit. `"unknown"` means the void call failed; the
   * hold may still be reserved, so the gift stays out of the wallet.
   */
  giftCardRestored?: boolean | "unknown";
}): number {
  const projectedTotalRefunded = addMoney(params.totalRefundedBefore, params.refundAmount);
  const willVoidGiftCardOnFullRefund =
    params.giftCardCollected > 0 &&
    projectedTotalRefunded + 0.01 >= params.totalCollectedAllSources;
  if (!willVoidGiftCardOnFullRefund) return params.refundAmount;
  if (params.giftCardRestored === false) return roundCurrency2(params.refundAmount);
  return Math.max(0, subtractMoney(params.refundAmount, params.giftCardCollected));
}

/** Customer wording after the gift return has answered. A restored card is not wallet money. */
export function customerStoreCreditRefundNotice(params: {
  walletAmount: number;
  giftReturned: boolean;
  bookingRef: string;
  formatAmount: (amount: number) => string;
}): { title: string; message: string } {
  const walletPaid = params.walletAmount > 0.009;
  const walletSentence = walletPaid
    ? `A refund of ${params.formatAmount(params.walletAmount)} for booking ${params.bookingRef} has been added to your wallet. Use it for your next booking.`
    : "";
  const giftSentence = params.giftReturned
    ? `The gift card used on booking ${params.bookingRef} was returned to the card.`
    : "";
  if (walletSentence && giftSentence) {
    return {
      title: "Refund added to wallet",
      message: `A refund of ${params.formatAmount(params.walletAmount)} for booking ${params.bookingRef} has been added to your wallet. The gift card used on this booking was returned to the card.`,
    };
  }
  if (giftSentence) return { title: "Gift card returned", message: giftSentence };
  return { title: "Refund added to wallet", message: walletSentence };
}

/** Staff wording for the same refund. Store credit is only the wallet amount. */
export function staffRefundIssuedNotice(params: {
  method: string;
  amount: number;
  walletAmount: number;
  giftReturned: boolean;
  bookingRef: string;
  formatAmount: (amount: number) => string;
}): { amount: number; message: string } {
  if (params.method === "store_credit") {
    const walletPaid = params.walletAmount > 0.009;
    if (params.giftReturned && !walletPaid) {
      return {
        amount: 0,
        message: `The gift card was returned to the customer for booking ${params.bookingRef}.`,
      };
    }
    const walletSentence = `A ${params.formatAmount(params.walletAmount)} store credit refund was issued for booking ${params.bookingRef}.`;
    if (params.giftReturned) {
      return {
        amount: params.walletAmount,
        message: `${walletSentence} The gift card was returned to the customer.`,
      };
    }
    return { amount: params.walletAmount, message: walletSentence };
  }
  const label = params.method.replace(/_/g, " ");
  return {
    amount: params.amount,
    message: `A ${params.formatAmount(params.amount)} ${label} refund was issued for booking ${params.bookingRef}.`,
  };
}

export function computeCancellationFeeForSettlement(
  params: SettleBookingCancellationParams,
): { cancellationFeeApplied: number; policyRefundAmount: number; isLate: boolean } {
  const grossTotal = Math.max(
    0,
    Number(params.refundBookingTotal ?? params.booking.total_amount ?? 0),
  );
  const tip = Math.min(grossTotal, Math.max(0, Number(params.booking.tip_amount ?? 0)));
  const basis = subtractMoney(grossTotal, tip);
  const collected = params.maxWalletCredit ?? computeEffectiveCollectedAmount(params.booking);
  // Tip is treated as paid last and is always returned; fees only apply to the non-tip basis.
  const tipPaid = roundCurrency2(Math.min(tip, Math.max(0, subtractMoney(collected, basis))));
  const isLate = params.isLateCancellation === true;

  const fromFee = (fee: number, late: boolean) => {
    const f = roundCurrency2(Math.min(basis, Math.max(0, fee)));
    return {
      cancellationFeeApplied: f,
      policyRefundAmount: addMoney(Math.max(0, subtractMoney(basis, f)), tipPaid),
      isLate: late,
    };
  };

  const explicit = params.explicitCancellationFee;
  if (explicit != null && Number.isFinite(Number(explicit))) {
    return fromFee(Number(explicit), params.cancelledBy === "no_show" ? false : isLate);
  }

  if (
    params.cancelledBy === "provider" ||
    params.cancelledBy === "admin" ||
    params.cancelledBy === "no_show"
  ) {
    return fromFee(0, false);
  }
  if (!params.policy) {
    return fromFee(0, isLate);
  }

  const refundOnBasis = computeCancellationRefundAmount(basis, params.policy, isLate);
  return fromFee(subtractMoney(basis, refundOnBasis), isLate);
}

export async function insertCancellationFeeLedgerIdempotent(
  admin: SupabaseClient,
  params: {
    bookingId: string;
    providerId: string;
    tenantId?: string | null;
    amount: number;
    description: string;
    /** Booking currency; falls back to the tenant default (migration 870 trigger mirrors this). */
    currency?: string | null;
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
  const currency = await resolveLedgerCurrency(admin, {
    currency: params.currency ?? null,
    tenantId: financeTenantId,
  });

  const { data: inserted, error } = await admin
    .from("finance_transactions")
    .insert({
      tenant_id: financeTenantId,
      booking_id: params.bookingId,
      provider_id: params.providerId,
      transaction_type: "cancellation_fee",
      amount: params.amount,
      fees: 0,
      commission: 0,
      net: params.amount,
      currency,
      description: params.description,
      created_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    console.error("[settleBookingCancellation] cancellation_fee insert failed:", error);
    return false;
  }

  if (inserted?.id) {
    try {
      await postCancellationFeeShareLines(admin, {
        providerId: params.providerId,
        bookingId: params.bookingId,
        financeTransactionId: inserted.id,
        providerEarningsAmount: params.amount,
        tenantId: financeTenantId,
      });
    } catch (shareErr) {
      console.error("[settleBookingCancellation] cancellation fee share failed:", shareErr);
    }
  }
  return true;
}

async function restoreRedeemedLoyalty(
  admin: SupabaseClient,
  booking: BookingFinancialSnapshot,
  reason: string,
): Promise<{ restored: boolean; failed: boolean }> {
  const customerId = booking.customer_id;
  if (!customerId) return { restored: false, failed: false };
  try {
    const { refundRedeemedLoyaltyPoints } = await import("@/lib/loyalty/refund-redeemed-points");
    const result = await refundRedeemedLoyaltyPoints(admin, {
      bookingId: booking.id,
      customerId,
      reason,
    });
    const failed = result.reason === "rpc_error" || result.reason === "lookup_failed";
    return { restored: result.refunded, failed };
  } catch (err) {
    console.error("[settleBookingCancellation] loyalty redeem restore failed:", err);
    return { restored: false, failed: true };
  }
}

async function clawBackEarnedLoyalty(
  admin: SupabaseClient,
  booking: BookingFinancialSnapshot,
): Promise<{ clawed: boolean; failed: boolean }> {
  const customerId = booking.customer_id;
  if (!customerId) return { clawed: false, failed: false };

  try {
    const { clawBackEarnedLoyaltyForBooking } = await import(
      "@/lib/loyalty/claw-back-earned-for-booking"
    );
    const clawed = await clawBackEarnedLoyaltyForBooking(admin, {
      bookingId: booking.id,
      customerId,
      bookingNumber: booking.booking_number,
    });
    return { clawed, failed: false };
  } catch (err) {
    console.error("[settleBookingCancellation] loyalty earn clawback failed:", err);
    return { clawed: false, failed: true };
  }
}

/** Money can be settled while these points are still outstanding. The settle cron retries them. */
export const LOYALTY_POINTS_STILL_DUE = "Loyalty points could not be returned";

/** Remember a gift card return that did not finish. Does not change a refund that is still open. */
export const GIFT_CARD_STILL_HELD = "Gift card could not be returned";

export {
  GIFT_VALUE_STILL_DUE,
  bookingGiftVoidOutcome,
  giftValueStillDueAmount,
  giftValueStillDueMessage,
  refundableExcludingGiftStillDue,
} from "@/lib/bookings/gift-value-still-due";

/** What to do with a gift value that was kept out of the wallet after the return is tried again. */
export function giftValueFollowUp(
  first: "restored" | "spent" | "unknown",
  second: "restored" | "spent" | "unknown",
): "none" | "mark" | "credit" {
  if (first !== "unknown") return "none";
  if (second === "unknown") return "mark";
  if (second === "spent") return "credit";
  return "none";
}

/**
 * A failed gift-card return stays on the visit. An open wallet refund stays
 * ahead of it. Once that refund is in, the gift mark is what the sweep retries.
 * Points that are still due are picked up after the card is returned.
 */
export function settlementMarkAfterGiftVoid(params: {
  refundPending: boolean;
  walletError: string;
  giftStillHeld: boolean;
  giftHeldOut: number;
  loyaltyStillDue: boolean;
}): { stampSettled: boolean; error: string | null } {
  const giftMark =
    params.giftHeldOut > 0.009 ? giftValueStillDueMessage(params.giftHeldOut) : GIFT_CARD_STILL_HELD;
  if (params.refundPending) {
    return {
      stampSettled: false,
      error: params.giftStillHeld ? `${giftMark}. ${params.walletError}` : params.walletError,
    };
  }
  if (params.giftStillHeld) {
    return { stampSettled: true, error: giftMark };
  }
  if (params.loyaltyStillDue) {
    return { stampSettled: true, error: LOYALTY_POINTS_STILL_DUE };
  }
  return { stampSettled: true, error: null };
}

export function settlementErrorAfterWalletCredit(priorError: string, loyaltyStillDue: boolean): string | null {
  const heldOut = giftValueStillDueAmount(priorError);
  if (heldOut != null) return giftValueStillDueMessage(heldOut);
  if (priorError.includes(GIFT_CARD_STILL_HELD)) return GIFT_CARD_STILL_HELD;
  if (loyaltyStillDue) return LOYALTY_POINTS_STILL_DUE;
  return null;
}

export async function markGiftCardStillHeld(
  admin: SupabaseClient,
  bookingId: string,
  stillHeld: boolean,
): Promise<void> {
  if (!stillHeld) return;
  try {
    const { error } = await admin
      .from("bookings")
      .update({ cancellation_settlement_error: GIFT_CARD_STILL_HELD })
      .eq("id", bookingId)
      .is("cancellation_settlement_error", null);
    if (error) {
      console.error("[gift card] could not mark the card still held", bookingId, error);
    }
  } catch (err) {
    console.error("[gift card] could not mark the card still held", bookingId, err);
  }
}

export async function markGiftCardValueStillDue(
  admin: SupabaseClient,
  bookingId: string,
  amount: number,
): Promise<void> {
  if (!(amount > 0.009)) return;
  try {
    const { error } = await admin
      .from("bookings")
      .update({ cancellation_settlement_error: giftValueStillDueMessage(amount) })
      .eq("id", bookingId)
      .is("cancellation_settlement_error", null);
    if (error) {
      console.error("[gift card] could not mark the value still due", bookingId, error);
    }
  } catch (err) {
    console.error("[gift card] could not mark the value still due", bookingId, err);
  }
}
export async function markLoyaltyStillDue(
  admin: SupabaseClient,
  bookingId: string,
  stillDue: boolean,
): Promise<void> {
  if (!stillDue) return;
  try {
    const { error } = await admin
      .from("bookings")
      .update({ cancellation_settlement_error: LOYALTY_POINTS_STILL_DUE })
      .eq("id", bookingId)
      .is("cancellation_settlement_error", null);
    if (error) {
      console.error("[loyalty] could not mark points still due", bookingId, error);
    }
  } catch (err) {
    console.error("[loyalty] could not mark points still due", bookingId, err);
  }
}

export async function finishCancellationLoyalty(
  admin: SupabaseClient,
  booking: Pick<BookingFinancialSnapshot, "id" | "customer_id" | "booking_number">,
  cancelledBy: CancellationSettledBy = "customer",
  reason?: string,
): Promise<{ redeemedRestored: boolean; earnClawed: boolean; stillDue: boolean }> {
  const loyaltyReason =
    reason ??
    (cancelledBy === "provider"
      ? "provider_cancel"
      : cancelledBy === "admin"
        ? "admin_cancel"
        : cancelledBy === "no_show"
          ? "no_show"
          : `${cancelledBy}_cancel`);
  const redeemed = await restoreRedeemedLoyalty(admin, booking as BookingFinancialSnapshot, loyaltyReason);
  const earned = await clawBackEarnedLoyalty(admin, booking as BookingFinancialSnapshot);
  return {
    redeemedRestored: redeemed.restored,
    earnClawed: earned.clawed,
    stillDue: redeemed.failed || earned.failed,
  };
}

type GiftCardVoidOutcome = "restored" | "spent" | "unknown";

async function markCancellationSettlementState(
  admin: SupabaseClient,
  bookingId: string,
  error: string | null,
): Promise<void> {
  const { error: updateErr } = await admin
    .from("bookings")
    .update(
      error
        ? { cancellation_settlement_error: error.slice(0, 500) }
        : { cancellation_settled_at: new Date().toISOString(), cancellation_settlement_error: null },
    )
    .eq("id", bookingId);
  if (updateErr) {
    console.error("[settleBookingCancellation] settlement state update failed:", updateErr);
  }
}

async function fetchPriorCancellationRefundsTotal(
  admin: SupabaseClient,
  bookingId: string,
): Promise<number> {
  const { data, error } = await admin
    .from("booking_refunds")
    .select("amount, refund_method, status, reason")
    .eq("booking_id", bookingId)
    .in("status", ["pending", "completed"]);
  if (error) throw new Error(`Could not load prior cancellation refunds: ${error.message}`);
  const rows = (data ?? []) as Array<{
    amount?: number | string | null;
    refund_method?: string | null;
    status?: string | null;
    reason?: string | null;
  }>;
  return roundCurrency2(
    rows
      .filter((row) => {
        const reason = String(row.reason ?? "");
        const leadCredit =
          row.refund_method === "store_credit" &&
          row.status === "completed" &&
          reason.startsWith("Cancellation refund");
        const guestShare =
          row.refund_method === "original" && reason.endsWith("cancelled — guest share returned");
        return leadCredit || guestShare;
      })
      .reduce((sum, row) => addMoney(sum, Math.max(0, Number(row.amount ?? 0))), 0),
  );
}

async function maybeVoidGiftCardRedemption(
  admin: SupabaseClient,
  bookingId: string,
  policyRefundAmount: number,
  bookingTotal: number,
): Promise<GiftCardVoidOutcome> {
  // A partial refund cannot split one redemption. Leave the card spent and
  // include its value in the wallet credit.
  if (policyRefundAmount + 0.01 < bookingTotal) return "spent";
  try {
    const { data, error } = await (admin.rpc as any)("void_gift_card_redemption", {
      p_booking_id: bookingId,
    });
    if (error) {
      console.warn("[settleBookingCancellation] gift card void failed:", error);
      return "unknown";
    }
    return bookingGiftVoidOutcome(data);
  } catch (err) {
    console.warn("[settleBookingCancellation] void_gift_card_redemption:", err);
    return "unknown";
  }
}

/**
 * Refund split-payment guest shares held on a cancelled booking to the guests' cards.
 * Returns the guest-paid amount that was still held (refunded now, or left in a failed
 * `booking_refunds` row for retry) so it can be excluded from the lead customer's credit.
 */
async function refundSplitGroupGuestSharesForCancellation(
  admin: SupabaseClient,
  params: SettleBookingCancellationParams,
): Promise<{ guestPaidNet: number; failed: number }> {
  try {
    const { refundGroupGuestSharePayments } = await import("@/lib/bookings/group-guest-refunds");
    const outcome = await refundGroupGuestSharePayments(admin, {
      bookingId: params.booking.id,
      currency: params.currency,
      tenantId: params.booking.tenant_id ?? null,
      reason: `Group booking ${params.booking.booking_number || params.booking.id} cancelled — guest share returned`,
    });
    if (outcome.failed > 0) {
      console.error("[settleBookingCancellation] guest share refunds need retry", {
        bookingId: params.booking.id,
        failed: outcome.failed,
      });
    }
    return { guestPaidNet: outcome.guestPaidNet, failed: outcome.failed };
  } catch (err) {
    console.error("[settleBookingCancellation] guest share lookup failed:", err);
    return { guestPaidNet: 0, failed: 0 };
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

  const { cancellationFeeApplied: theoreticalFee, policyRefundAmount, isLate } =
    computeCancellationFeeForSettlement(params);

  // Split-payment groups: guest shares recorded on this booking go back to each guest's
  // card in full and are excluded from the lead customer's credit; any fee is borne by
  // the lead customer's own funds.
  // A retried settlement must not refund the policy amount again: lead wallet
  // credits and guest card refunds from an earlier attempt count against it.
  // Read before this attempt writes any refund rows.
  let priorCancellationCredits: number;
  try {
    priorCancellationCredits = await fetchPriorCancellationRefundsTotal(admin, bookingId);
  } catch (err) {
    await markCancellationSettlementState(
      admin,
      bookingId,
      err instanceof Error ? err.message : "prior_refund_lookup_failed",
    );
    throw err;
  }
  const guestShareRefund = await refundSplitGroupGuestSharesForCancellation(admin, params);
  const guestSharesHeld = guestShareRefund.guestPaidNet;
  const guestShareRefundFailed = guestShareRefund.failed > 0.009;
  let giftStillDueError: string | null = null;
  try {
    const { data: mark } = await admin
      .from("bookings")
      .select("cancellation_settlement_error")
      .eq("id", bookingId)
      .maybeSingle();
    giftStillDueError =
      (mark as { cancellation_settlement_error?: string | null } | null)?.cancellation_settlement_error ??
      null;
  } catch (markErr) {
    console.warn("[settleBookingCancellation] gift still-due lookup failed:", markErr);
  }
  const collectedForSettlement = refundableExcludingGiftStillDue(
    params.maxWalletCredit ?? computeEffectiveCollectedAmount(booking),
    giftStillDueError,
    {
      giftCardAmount: Number(booking.gift_card_amount ?? 0),
      visitClosed: visitClosedForGiftReturn(booking.status),
    },
  );
  const effectiveCollected = roundCurrency2(
    Math.max(0, subtractMoney(collectedForSettlement, guestSharesHeld)),
  );
  const leadPolicyRefundAmount = roundCurrency2(
    Math.max(0, subtractMoney(subtractMoney(policyRefundAmount, guestSharesHeld), priorCancellationCredits)),
  );

  // On a full refund we also void the gift-card redemption (restoring balance
  // on the card). That gift leg must NOT also be credited to the wallet, or
  // the customer is refunded twice for the same money.
  const giftCardCollected = roundCurrency2(Math.max(0, Number(booking.gift_card_amount ?? 0)));
  const intendsToRestoreGiftCard =
    params.voidGiftCardOnFullRefund !== false &&
    giftCardCollected > 0 &&
    policyRefundAmount + 0.01 >= bookingTotal;
  const giftCardVoid: GiftCardVoidOutcome = intendsToRestoreGiftCard
    ? await maybeVoidGiftCardRedemption(admin, bookingId, policyRefundAmount, bookingTotal)
    : "spent";
  // "unknown" is excluded too: the hold may still be reserved, and a later void
  // would restore the card after this wallet credit.
  const excludeGiftFromWallet = giftCardVoid === "restored" || giftCardVoid === "unknown";
  const giftCardRestored = giftCardVoid === "restored";
  const refundableWithoutGift = roundCurrency2(
    Math.max(0, subtractMoney(effectiveCollected, excludeGiftFromWallet ? giftCardCollected : 0)),
  );

  const walletRefundTarget = roundCurrency2(
    Math.min(leadPolicyRefundAmount, refundableWithoutGift),
  );

  let terminalRefundDue = 0;
  let terminalRefundProvider: "paycloud" | "yoco" | undefined;
  let walletCreditTarget = walletRefundTarget;
  const wantsTerminalRail =
    params.refundRail === "terminal" &&
    (params.cancelledBy === "provider" || params.cancelledBy === "no_show");

  let bookingPaymentsForCap:
    | Awaited<ReturnType<typeof fetchBookingPaymentsForRefundCap>>
    | null = null;

  if (wantsTerminalRail && walletRefundTarget > 0) {
    bookingPaymentsForCap = await fetchBookingPaymentsForRefundCap(
      admin,
      bookingId,
      booking.tenant_id,
    );
    const bookingPayments = bookingPaymentsForCap;
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
        terminalRefundProvider = "paycloud";
        walletCreditTarget = Math.max(0, subtractMoney(walletRefundTarget, terminalRefundDue));
      } else {
        const yocoDue = computeYocoTerminalRefundDue(bookingPayments, candidateTerminal);
        if (yocoDue > 0.01) {
          terminalRefundDue = yocoDue;
          terminalRefundProvider = "yoco";
          walletCreditTarget = Math.max(0, subtractMoney(walletRefundTarget, terminalRefundDue));
        }
      }
    }
  }

  if (params.maxWalletCredit === undefined) {
    if (!bookingPaymentsForCap) {
      bookingPaymentsForCap = await fetchBookingPaymentsForRefundCap(
        admin,
        bookingId,
        booking.tenant_id,
      );
    }
    const nonTerminalInPerson = sumNonTerminalInPersonCollected(bookingPaymentsForCap);
    if (nonTerminalInPerson > 0.01) {
      walletCreditTarget = roundCurrency2(
        Math.max(0, subtractMoney(walletCreditTarget, nonTerminalInPerson)),
      );
    }
  }

  // Fee retained must reconcile with collected funds (deposit-only bookings).
  // Use the pre-gift-void collected amount so the retained fee still covers the
  // full non-refunded portion of what was actually taken.
  const cancellationFeeApplied = roundCurrency2(
    Math.max(0, Math.min(theoreticalFee, subtractMoney(subtractMoney(effectiveCollected, walletRefundTarget), giftCardRestored ? giftCardCollected : 0))),
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

  // T1.10: the refund above is already capped at collected − fee, so the
  // unrefunded sale components (earnings, platform fee, tax) sum to the
  // retained fee. Posting cancellation_fee for that same amount as well
  // leaves recognized revenue at twice the fee. Measured on the local audit
  // DB: a 333.33 sale, a 50.00 fee row, and a 283.33 refund retained 100.00.
  // The staff share is an earnings line on the existing sale, not a second revenue row.
  const refundSettled = walletRefundTarget <= 0.009 || refundResult.success === true;
  if (cancellationFeeApplied > 0.009 && refundSettled) {
    try {
      const { data: financeRows } = await admin
        .from("finance_transactions")
        .select("id, transaction_type, created_at")
        .eq("booking_id", bookingId)
        .order("created_at", { ascending: true });
      const rows = (financeRows ?? []) as Array<{ id?: string; transaction_type?: string }>;
      const source =
        rows.find((row) => row.transaction_type === "provider_earnings" && row.id) ??
        rows.find((row) => row.transaction_type !== "refund" && row.id);
      if (source?.id) {
        await postCancellationFeeShareLines(admin, {
          providerId: booking.provider_id,
          bookingId,
          financeTransactionId: source.id,
          providerEarningsAmount: cancellationFeeApplied,
          tenantId: booking.tenant_id,
        });
      }
    } catch (shareErr) {
      console.error("[settleBookingCancellation] cancellation fee share failed:", shareErr);
    }
  }
  const cancellationFeeLedgerPosted = false;

  const loyalty = await finishCancellationLoyalty(admin, booking, params.cancelledBy);
  const loyaltyRedeemedRestored = loyalty.redeemedRestored;
  const loyaltyEarnClawedBack = loyalty.earnClawed;

  const giftCardVoidAttempted = giftCardRestored;

  let inPersonCashRefundDue = 0;
  try {
    const cashObligation = await ensureCancellationCashRefundObligation(admin, {
      bookingId,
      tenantId: booking.tenant_id,
      providerId: booking.provider_id,
      customerId: booking.customer_id,
      bookingNumber: booking.booking_number,
      currency: params.currency,
      cancelledBy: params.cancelledBy,
      insert: true,
      createdBy: null,
    });
    inPersonCashRefundDue = cashObligation.inPersonCashRefundDue;
  } catch (cashErr) {
    console.error("[settleBookingCancellation] cash obligation failed:", cashErr);
  }

  // A failed wallet credit leaves a failed store_credit refund row that the
  // auto wallet credit cron (or finance staff) replays; the settle-pending
  // cancellations cron stamps the booking once that row completes.
  // Loyalty that did not finish stays on the booking after the money is settled
  // so that same cron can return the points without holding the refund.
  const refundPending = walletCreditTarget > 0.009 && refundResult.success === false;
  const giftStillHeld = giftCardVoid === "unknown";
  const giftHeldOut = giftStillHeld
    ? roundCurrency2(
        Math.max(
          0,
          subtractMoney(
            Math.min(leadPolicyRefundAmount, effectiveCollected),
            Math.min(leadPolicyRefundAmount, refundableWithoutGift),
          ),
        ),
      )
    : 0;
  const mark = settlementMarkAfterGiftVoid({
    refundPending,
    walletError: refundResult.error || "Cancellation refund could not be credited",
    giftStillHeld,
    giftHeldOut,
    loyaltyStillDue: loyalty.stillDue,
  });
  if (mark.stampSettled) {
    const { error: stateErr } = await admin
      .from("bookings")
      .update({
        cancellation_settled_at: new Date().toISOString(),
        cancellation_settlement_error: mark.error,
      })
      .eq("id", bookingId);
    if (stateErr) {
      console.error("[settleBookingCancellation] settlement state update failed:", stateErr);
    }
  } else {
    await markCancellationSettlementState(admin, bookingId, mark.error);
  }

  return {
    cancellationFeeApplied,
    policyRefundAmount,
    walletRefundAmount: walletCreditTarget,
    terminalRefundDue,
    terminalRefundProvider,
    refundResult,
    cancellationFeeLedgerPosted,
    loyaltyRedeemedRestored,
    loyaltyEarnClawedBack,
    giftCardVoidAttempted,
    giftCardRestored,
    giftValueStillDue: giftStillHeld && giftHeldOut > 0.009,
    guestShareRefundFailed,
    refundRail: params.refundRail,
    inPersonCashRefundDue,
  };
}

const BOOKING_FINANCIAL_SELECT =
  "id, provider_id, customer_id, booking_number, tenant_id, location_type, subtotal, discount_amount, tax_amount, service_fee_amount, travel_fee, tip_amount, total_amount, total_paid, total_refunded, wallet_amount, gift_card_amount, status, currency, loyalty_points_used, loyalty_points_redeemed, loyalty_points_earned";

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
  const refundTotal = Math.max(0, subtractMoney(bookingTotal, noShowFee));

  return settleBookingCancellation({
    booking: params.booking,
    cancelledBy: "no_show",
    currency: params.currency,
    policy: params.policy,
    explicitCancellationFee: noShowFee,
    refundBookingTotal: bookingTotal,
  });
}
