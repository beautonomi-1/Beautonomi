/**
 * Centralised admin wallet-refund flow.
 *
 * Used by:
 *   - POST /api/admin/refunds/[id]        (transaction-level refund)
 *   - PATCH /api/admin/disputes/[id]       (dispute resolution with refund)
 *
 * Flow:
 *  1. Validate amount > 0
 *  2. Fetch booking; resolve tenant + currency
 *  3. Check period lock (blocks backdated writes into closed accounting periods)
 *  4. Insert booking_refunds row (pending) — provides idempotency key
 *  5. Call wallet_credit_admin RPC (idempotent via refund-row id)
 *  6. Update the payment_transactions charge row to refunded/partially_refunded.
 *     Uses the explicit transactionId when supplied, otherwise resolves the
 *     booking's successful charge txn so a dispute refund keeps the charge in
 *     sync (prevents a second refund via the Refunds page).
 *  7. Finalize booking_refunds row (completed) — DB trigger writes ledger entry
 *  8. Restore gift card balance when full refund and booking used a gift card
 *  9. Send push notification to customer
 * 10. Check provider balance for negative post-payout risk
 * 11. Write audit log
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";
import { checkPeriodLock } from "@/lib/finance/period-lock";
import { writeAuditLog } from "@/lib/audit/audit";

export interface IssueAdminWalletRefundOptions {
  supabase: SupabaseClient;
  /** Tenant that owns the booking (used for period lock + ledger scope). */
  tenantId: string;
  bookingId: string;
  /** Amount to credit (must be > 0 and <= originalChargeAmount). */
  amount: number;
  /**
   * Gross collected amount for this booking (net charges minus completed refunds).
   * Used to determine full vs partial refund status and to cap gift-card restoration.
   * Pass the transaction amount for transaction-level refunds, or the result of
   * `getCollectedTotalForBooking` for dispute-level refunds.
   */
  originalChargeAmount: number;
  /**
   * Amount already refunded on this transaction (from `refund_amount`). Used to
   * accumulate further partial refunds and to size the atomic claim.
   */
  priorRefundAmount?: number;
  reason: string;
  actorUserId: string;
  actorRole?: string;
  notes?: string | null;
  /**
   * When set, this payment_transactions row is also updated to
   * `refunded` / `partially_refunded` after the wallet credit succeeds.
   */
  transactionId?: string;
}

export type IssueAdminWalletRefundSuccess = {
  success: true;
  refundId: string;
  amount: number;
  providerBalanceWarning: string | null;
};

export type IssueAdminWalletRefundFailure = {
  success: false;
  error: string;
  code: string;
  httpStatus: number;
};

export type IssueAdminWalletRefundOutcome =
  | IssueAdminWalletRefundSuccess
  | IssueAdminWalletRefundFailure;

type BookingRow = {
  customer_id: string;
  booking_number: string;
  currency?: string | null;
  tenant_id?: string | null;
  provider_id?: string | null;
  gift_card_amount?: number | null;
};

function err(
  error: string,
  code: string,
  httpStatus: number
): IssueAdminWalletRefundFailure {
  return { success: false, error, code, httpStatus };
}

export async function issueAdminWalletRefund(
  opts: IssueAdminWalletRefundOptions
): Promise<IssueAdminWalletRefundOutcome> {
  const {
    supabase,
    tenantId,
    bookingId,
    amount,
    originalChargeAmount,
    priorRefundAmount = 0,
    reason,
    actorUserId,
    actorRole = "superadmin",
    notes,
    transactionId,
  } = opts;

  // 1. Validate amount
  if (!amount || amount <= 0) {
    return err("Refund amount must be positive", "INVALID_AMOUNT", 400);
  }

  // 2. Fetch booking
  const { data: bookingData, error: bookingErr } = await supabase
    .from("bookings")
    .select(
      "customer_id, booking_number, currency, tenant_id, provider_id, gift_card_amount"
    )
    .eq("id", bookingId)
    .single();

  if (bookingErr || !bookingData) {
    return err("Booking not found", "BOOKING_NOT_FOUND", 404);
  }

  const booking = bookingData as BookingRow;
  const effectiveTenantId = booking.tenant_id ?? tenantId;
  const tenantRegion = effectiveTenantId
    ? await getTenantRegionConfig(effectiveTenantId)
    : null;
  const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;
  const currency = booking.currency || lastResortCurrency;
  const providerId = booking.provider_id ?? null;

  // Resolve which payment_transactions charge row to mark refunded.
  // When an explicit transactionId is supplied (transaction-level refund) we use it.
  // Otherwise (dispute refund) we locate the booking's successful charge so the
  // charge does not remain refundable on the Refunds page (avoids double refunds).
  let resolvedTransactionId: string | null = transactionId ?? null;
  if (!resolvedTransactionId) {
    try {
      const { data: chargeTxns } = await supabase
        .from("payment_transactions")
        .select("id, transaction_type, created_at")
        .eq("booking_id", bookingId)
        .eq("status", "success")
        .in("transaction_type", ["charge", "additional_charge"])
        .order("created_at", { ascending: false });
      const rows = (chargeTxns ?? []) as Array<{
        id: string;
        transaction_type?: string | null;
      }>;
      // Prefer a primary "charge" over "additional_charge" when both exist.
      const primary =
        rows.find((t) => t.transaction_type === "charge") ?? rows[0];
      resolvedTransactionId = primary?.id ?? null;
    } catch (lookupErr) {
      console.warn(
        "[issueAdminWalletRefund] charge transaction lookup failed:",
        lookupErr
      );
    }
  }

  const financeTenantId = await resolveTenantIdForFinanceLedger(supabase, {
    tenant_id: booking.tenant_id ?? tenantId,
    provider_id: providerId,
  });

  // 3. Period lock guard
  const lockResult = await checkPeriodLock(
    supabase,
    financeTenantId,
    new Date().toISOString()
  );
  if (lockResult.locked) {
    return err(
      "Refund blocked by an active financial period lock",
      "PERIOD_LOCKED",
      423
    );
  }

  // 4. Insert booking_refunds row (pending) — provides idempotency key for wallet credit.
  // When a full refund will also void the gift-card redemption, exclude that leg
  // from the wallet credit so the customer is not refunded twice for the same money
  // (custom-offer charge rows embed the gift leg in `amount`).
  const giftCardAmount = Number(booking.gift_card_amount ?? 0);
  const prior = Math.max(0, Number(priorRefundAmount ?? 0));
  const cumulativeRefundPreview = Math.round((prior + amount) * 100) / 100;
  const isFullRefundForGiftCard =
    originalChargeAmount > 0 && cumulativeRefundPreview + 0.001 >= originalChargeAmount;
  const willVoidGiftCard = isFullRefundForGiftCard && giftCardAmount > 0;
  // Only subtract the gift leg once — on the refund that completes the full amount.
  const giftOffset =
    willVoidGiftCard && prior < giftCardAmount
      ? Math.max(0, Math.round((giftCardAmount - prior) * 100) / 100)
      : 0;
  const walletCreditAmount = willVoidGiftCard
    ? Math.max(0, Math.round((amount - giftOffset) * 100) / 100)
    : amount;

  const { data: refundRecord, error: refundInsertErr } = await supabase
    .from("booking_refunds")
    .insert({
      booking_id: bookingId,
      amount: walletCreditAmount,
      reason,
      refund_method: "store_credit",
      status: "pending",
      created_by: actorUserId,
      notes: notes ?? null,
    })
    .select("id")
    .single();

  if (refundInsertErr || !refundRecord) {
    return err("Failed to create refund record", "REFUND_CREATE_ERROR", 500);
  }

  const refundId = (refundRecord as { id: string }).id;

  // 6. Atomically claim the payment_transactions charge row BEFORE crediting
  // the wallet so concurrent admin POSTs cannot both succeed. Accumulates
  // refund_amount across partial refunds and CAS on the expected prior amount.
  if (resolvedTransactionId) {
    const cumulativeRefund = Math.round((prior + amount) * 100) / 100;
    const isFullRefund =
      originalChargeAmount <= 0 || cumulativeRefund + 0.001 >= originalChargeAmount;
    const refundReference = `wallet_refund_${resolvedTransactionId}_${Date.now()}`;

    let claimQuery = supabase
      .from("payment_transactions")
      .update({
        refund_amount: cumulativeRefund,
        refund_reason: reason,
        refund_reference: refundReference,
        refunded_at: new Date().toISOString(),
        refunded_by: actorUserId,
        status: isFullRefund ? "refunded" : "partially_refunded",
      })
      .eq("id", resolvedTransactionId)
      .in("status", ["success", "partially_refunded"]);

    claimQuery =
      prior > 0
        ? claimQuery.eq("refund_amount", prior)
        : claimQuery.or("refund_amount.is.null,refund_amount.eq.0");

    const { data: claimedTxn, error: txnUpdateErr } = await claimQuery.select("id");

    if (txnUpdateErr) {
      console.error(
        "[issueAdminWalletRefund] failed to claim payment_transaction:",
        txnUpdateErr
      );
      await supabase.from("booking_refunds").delete().eq("id", refundId);
      return err("Failed to claim transaction for refund", "TXN_CLAIM_ERROR", 500);
    }
    if ((claimedTxn?.length ?? 0) === 0) {
      await supabase.from("booking_refunds").delete().eq("id", refundId);
      return err("Transaction already refunded", "INVALID_STATUS", 400);
    }
  }

  // 7. Wallet credit — idempotent via refund row id.
  // When this refund will also void the gift-card redemption, exclude that leg
  // from the wallet credit so the customer is not refunded twice for the same money
  // (custom-offer charge rows embed the gift leg in `amount`).
  type RpcFn = (
    name: string,
    args: Record<string, unknown>
  ) => Promise<{ error: unknown }>;
  const rpc = supabase.rpc.bind(supabase) as unknown as RpcFn;

  const { error: walletError } = await rpc("wallet_credit_admin", {
    p_user_id: booking.customer_id,
    p_amount: walletCreditAmount,
    p_currency: currency,
    p_description: `Refund for booking ${booking.booking_number}: ${reason}`,
    p_reference_id: resolvedTransactionId ?? bookingId,
    p_reference_type: "refund",
    p_tenant_id: financeTenantId,
    p_idempotency_key: `admin_payment_refund:${refundId}`,
  });

  if (walletError) {
    console.error("[issueAdminWalletRefund] wallet_credit_admin failed:", walletError);
    // Roll back the pending refund row and release the transaction claim.
    await supabase.from("booking_refunds").delete().eq("id", refundId);
    if (resolvedTransactionId) {
      await supabase
        .from("payment_transactions")
        .update({
          status: prior > 0 ? "partially_refunded" : "success",
          refund_amount: prior > 0 ? prior : null,
          refund_reason: null,
          refund_reference: null,
          refunded_at: null,
          refunded_by: null,
        })
        .eq("id", resolvedTransactionId);
    }
    return err("Failed to credit customer wallet", "WALLET_ERROR", 500);
  }

  // 8. Finalize booking_refunds row — DB trigger writes ledger entry on status=completed
  const { error: finalizeErr } = await supabase
    .from("booking_refunds")
    .update({ status: "completed" })
    .eq("id", refundId);

  if (finalizeErr) {
    // Wallet already credited — log only; the row can be manually completed
    console.error(
      "[issueAdminWalletRefund] failed to finalize booking_refunds row:",
      finalizeErr
    );
  }

  // 9. Restore gift card balance on full refund (best-effort)
  if (willVoidGiftCard) {
    try {
      const { error: gcError } = await rpc("void_gift_card_redemption", {
        p_booking_id: bookingId,
      });
      if (gcError) {
        console.warn("[issueAdminWalletRefund] gift card restoration failed:", gcError);
      }
    } catch (gcErr) {
      console.warn("[issueAdminWalletRefund] gift card restoration error:", gcErr);
    }
  }

  // 9. Push notification (best-effort)
  try {
    const { sendToUser } = await import("@/lib/notifications/onesignal");
    await sendToUser(
      booking.customer_id,
      {
        title: "Refund added to wallet",
        message: `A refund of ${currency} ${walletCreditAmount.toFixed(2)} for booking ${booking.booking_number} has been added to your wallet. Use it for your next booking or request a payout.`,
        data: {
          type: "refund_processed",
          booking_id: bookingId,
          ...(resolvedTransactionId
            ? { transaction_id: resolvedTransactionId }
            : {}),
        },
        url: "/account-settings/wallet",
      },
      ["push"],
      { appType: "customer" }
    );
  } catch (notifErr) {
    console.error("[issueAdminWalletRefund] push notification failed:", notifErr);
  }

  // 10. Check provider balance for negative post-payout risk (best-effort)
  let providerBalanceWarning: string | null = null;
  if (providerId) {
    try {
      const { getAvailablePayoutBalance } = await import(
        "@/lib/provider/available-payout-balance"
      );
      const { rawBalance } = await getAvailablePayoutBalance(supabase, providerId, {
        tenantId: effectiveTenantId,
      });
      if (rawBalance < -0.01) {
        providerBalanceWarning = `Provider balance is now negative (${rawBalance.toFixed(2)}). This refund was issued after a payout. Consider clawback from future earnings.`;
      }
    } catch (balErr) {
      console.warn("[issueAdminWalletRefund] provider balance check failed:", balErr);
    }
  }

  // 11. Audit log (best-effort)
  try {
    await writeAuditLog({
      actor_user_id: actorUserId,
      actor_role: actorRole,
      action: "admin.refund.process",
      entity_type: "booking",
      entity_id: bookingId,
      metadata: {
        refund_amount: amount,
        wallet_credit_amount: walletCreditAmount,
        gift_card_restored: willVoidGiftCard ? giftCardAmount : 0,
        refund_reason: reason,
        notes: notes ?? null,
        wallet_credit: true,
        refund_id: refundId,
        transaction_id: resolvedTransactionId ?? null,
        provider_balance_warning: providerBalanceWarning,
      },
    });
  } catch (auditErr) {
    console.warn("[issueAdminWalletRefund] audit log write failed:", auditErr);
  }

  void import("@/lib/integrations/slack/ops-triggers")
    .then(({ slackNotifyHighValueRefund }) =>
      slackNotifyHighValueRefund({
        tenantId,
        refundId,
        bookingId,
        amountMajor: amount,
        stage: "processed",
        actorUserId,
        reason,
      }),
    )
    .catch(() => undefined);

  return {
    success: true,
    refundId,
    amount: walletCreditAmount,
    providerBalanceWarning,
  };
}
