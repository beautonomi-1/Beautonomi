import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

/**
 * When `create_booking_with_locking` succeeded but `processPayment` fails (missing Paystack key,
 * gateway error, saved-card decline, etc.), the booking still holds the staff slot. Conflict checks exclude
 * `cancelled`, so we mark the booking cancelled to release the slot for retry.
 *
 * **Also reverses side effects that may have happened inside `processPayment` before the failure:**
 * - Reserved gift card redemption (`void_gift_card_redemption`)
 * - Wallet debit applied toward the charge (`wallet_credit_admin` for the debited amount)
 */
export async function releaseBookingSlotAfterPaymentFailure(
  adminSupabase: SupabaseClient,
  bookingId: string,
  customerId: string
): Promise<void> {
  const { data: row, error: fetchErr } = await adminSupabase
    .from("bookings")
    .select("id, wallet_amount, gift_card_amount, currency, tenant_id, provider_id, customer_package_entitlement_id")
    .eq("id", bookingId)
    .eq("customer_id", customerId)
    .maybeSingle();

  const entitlementId = (row as { customer_package_entitlement_id?: string | null } | null)
    ?.customer_package_entitlement_id;
  if (entitlementId) {
    try {
      const { data: claimed } = await adminSupabase
        .from("bookings")
        .update({ customer_package_entitlement_id: null })
        .eq("id", bookingId)
        .eq("customer_package_entitlement_id", entitlementId)
        .select("id");
      if (claimed?.length) {
        await adminSupabase.rpc("restore_customer_package_entitlement", {
          p_entitlement_id: entitlementId,
          p_customer_id: customerId,
        });
      }
    } catch (e) {
      console.warn("[releaseBookingSlotAfterPaymentFailure] restore package session", bookingId, e);
    }
  }

  if (fetchErr || !row) {
    console.error(
      "[releaseBookingSlotAfterPaymentFailure] fetch booking",
      bookingId,
      fetchErr
    );
    return;
  }

  let giftCapturedNotRestored = false;
  try {
    const { data: voided, error: voidErr } = await (adminSupabase.rpc as any)("void_gift_card_redemption", {
      p_booking_id: bookingId,
    });
    // Credit the wallet only when the void answered and the card was not restored.
    // A void error leaves a reserved hold in place; crediting as well would pay twice.
    giftCapturedNotRestored = voided === false && !voidErr;
    if (voidErr) {
      console.warn(
        "[releaseBookingSlotAfterPaymentFailure] void_gift_card_redemption",
        bookingId,
        voidErr
      );
    }
  } catch (e) {
    console.warn("[releaseBookingSlotAfterPaymentFailure] void_gift_card_redemption", bookingId, e);
  }

  const giftHeld = Number((row as { gift_card_amount?: unknown }).gift_card_amount ?? 0);
  if (giftCapturedNotRestored && giftHeld > 0.009) {
    try {
      const currency = String((row as { currency?: string }).currency || LAST_RESORT_CURRENCY);
      const walletTenantId = await resolveTenantIdForFinanceLedger(adminSupabase, {
        tenant_id: (row as { tenant_id?: string | null }).tenant_id,
        provider_id: (row as { provider_id?: string | null }).provider_id,
      });
      const { error: giftCreditErr } = await (adminSupabase.rpc as any)("wallet_credit_admin", {
        p_user_id: customerId,
        p_amount: giftHeld,
        p_currency: currency,
        p_description: `Reversal: gift card could not be restored (${bookingId.slice(0, 8)})`,
        p_reference_id: bookingId,
        p_reference_type: "booking",
        p_tenant_id: walletTenantId,
        p_idempotency_key: `booking_payment_failure_gift:${bookingId}`,
      });
      if (giftCreditErr) {
        console.error(
          "[releaseBookingSlotAfterPaymentFailure] gift wallet credit",
          bookingId,
          giftCreditErr
        );
      }
    } catch (e) {
      console.error("[releaseBookingSlotAfterPaymentFailure] gift wallet credit", bookingId, e);
    }
  }

  try {
    const { refundRedeemedLoyaltyPoints } = await import("@/lib/loyalty/refund-redeemed-points");
    await refundRedeemedLoyaltyPoints(adminSupabase, {
      bookingId,
      customerId,
      reason: "payment_abandoned",
    });
  } catch (e) {
    console.warn("[releaseBookingSlotAfterPaymentFailure] loyalty restore", bookingId, e);
  }

  const wa = Number((row as { wallet_amount?: unknown }).wallet_amount ?? 0);
  if (wa > 0) {
    try {
      const currency = String((row as { currency?: string }).currency || LAST_RESORT_CURRENCY);
      const walletTenantId = await resolveTenantIdForFinanceLedger(adminSupabase, {
        tenant_id: (row as { tenant_id?: string | null }).tenant_id,
        provider_id: (row as { provider_id?: string | null }).provider_id,
      });
      const { error: credErr } = await (adminSupabase.rpc as any)("wallet_credit_admin", {
        p_user_id: customerId,
        p_amount: wa,
        p_currency: currency,
        p_description: `Reversal: online payment failed before completion (${bookingId.slice(0, 8)})`,
        p_reference_id: bookingId,
        p_reference_type: "booking",
        p_tenant_id: walletTenantId,
        p_idempotency_key: `booking_payment_failure_reversal:${bookingId}`,
      });
      if (credErr) {
        console.error(
          "[releaseBookingSlotAfterPaymentFailure] wallet_credit_admin",
          bookingId,
          credErr
        );
      }
    } catch (e) {
      console.error("[releaseBookingSlotAfterPaymentFailure] wallet reversal", bookingId, e);
    }
  }

  try {
    const { error: walletLedgerErr } = await adminSupabase
      .from("finance_transactions")
      .delete()
      .eq("booking_id", bookingId)
      .eq("transaction_type", "wallet_payment");
    if (walletLedgerErr) {
      console.warn(
        "[releaseBookingSlotAfterPaymentFailure] wallet_payment ledger cleanup",
        bookingId,
        walletLedgerErr
      );
    }
  } catch (e) {
    console.warn("[releaseBookingSlotAfterPaymentFailure] wallet_payment ledger cleanup", bookingId, e);
  }

  const now = new Date().toISOString();
  const { error } = await adminSupabase
    .from("bookings")
    .update({
      status: "cancelled",
      cancelled_at: now,
      cancelled_by: customerId,
      cancellation_reason: "Payment could not be started — slot released so you can try again",
      updated_at: now,
      wallet_amount: 0,
      gift_card_id: null,
      gift_card_amount: 0,
      customer_package_entitlement_id: null,
    })
    .eq("id", bookingId)
    .eq("customer_id", customerId);

  if (error) {
    console.error(
      "[releaseBookingSlotAfterPaymentFailure] failed to cancel orphan booking",
      bookingId,
      error
    );
  }
}
