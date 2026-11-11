import type { SupabaseClient } from "@supabase/supabase-js";
import { recordReconciliationException } from "@/lib/finance/record-reconciliation-exception";

export type RevertWalletRefundCreditResult =
  | { reverted: true }
  | { reverted: false; error: string };

/**
 * F2-57 compensating action: a wallet refund credits the customer wallet first
 * and then flips `booking_refunds.status` to `completed`. If that finalize
 * step fails, the customer holds the money while the refund is still
 * `pending`; a retry would create a second refund row and credit the wallet
 * again. Undo the credit (idempotently) and mark the refund `failed` so the
 * provider can retry cleanly. If the undo itself fails, leave an open
 * reconciliation exception so finance can resolve it by hand.
 */
export async function revertWalletRefundCreditAfterFinalizeFailure(
  supabaseAdmin: SupabaseClient,
  params: {
    refundId: string;
    bookingId: string;
    customerId: string;
    amount: number;
    currency: string;
    tenantId: string | null;
    finalizeErrorMessage: string;
  },
): Promise<RevertWalletRefundCreditResult> {
  const { error: debitError } = await (supabaseAdmin.rpc as any)("wallet_debit_admin", {
    p_user_id: params.customerId,
    p_amount: params.amount,
    p_currency: params.currency,
    p_description: `Reversal of refund credit for booking refund ${params.refundId} (finalize failed)`,
    p_reference_id: params.bookingId,
    p_reference_type: "booking_refund_reversal",
    p_tenant_id: params.tenantId,
    p_idempotency_key: `provider_booking_refund_revert:${params.refundId}`,
  });

  if (!debitError) {
    await supabaseAdmin
      .from("booking_refunds")
      .update({
        status: "failed",
        notes: `Finalize failed after wallet credit (${params.finalizeErrorMessage}); wallet credit reverted.`,
      })
      .eq("id", params.refundId);
    return { reverted: true };
  }

  const debitMessage = String((debitError as { message?: string }).message ?? debitError);
  console.error("[refund] wallet credit revert failed after finalize failure:", debitError);

  await supabaseAdmin
    .from("booking_refunds")
    .update({
      notes: `Finalize failed after wallet credit (${params.finalizeErrorMessage}); wallet credit revert ALSO failed (${debitMessage}). Manual reconciliation required.`,
    })
    .eq("id", params.refundId);

  if (params.tenantId) {
    try {
      await recordReconciliationException({
        supabase: supabaseAdmin,
        tenantId: params.tenantId,
        currency: params.currency,
        psp: "wallet",
        mismatchReason: `Wallet credited ${params.amount} for booking refund ${params.refundId} but refund finalize and credit revert both failed`,
        externalId: params.refundId,
        internalId: params.bookingId,
        amount: params.amount,
        metadata: {
          kind: "wallet_refund_credit_unfinalised",
          refund_id: params.refundId,
          booking_id: params.bookingId,
          customer_id: params.customerId,
          finalize_error: params.finalizeErrorMessage,
          revert_error: debitMessage,
        },
      });
    } catch (recErr) {
      console.error("[refund] failed to record reconciliation exception:", recErr);
    }
  }

  return { reverted: false, error: debitMessage };
}
