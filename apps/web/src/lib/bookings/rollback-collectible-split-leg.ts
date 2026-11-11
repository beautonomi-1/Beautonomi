/**
 * Reverse wallet/gift legs applied during a follow-up collectible payment when Paystack init fails.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { buildSyntheticWalletGiftProviderId } from "@/lib/bookings/ensure-wallet-gift-booking-payments";
import { subtractMoney } from "@beautonomi/utils";

export async function rollbackCollectibleSplitLeg(
  admin: SupabaseClient,
  input: {
    bookingId: string;
    customerId: string;
    currency: string;
    tenantId: string | null;
    providerId: string;
    walletAmountToReverse: number;
    giftCardAmountToReverse: number;
    paymentLegSuffix: string;
    idempotencyKey: string;
  },
): Promise<void> {
  const {
    bookingId,
    customerId,
    currency,
    tenantId,
    providerId,
    walletAmountToReverse,
    giftCardAmountToReverse,
    paymentLegSuffix,
    idempotencyKey,
  } = input;

  let giftRestoredOrCompensated = giftCardAmountToReverse <= 0;
  if (giftCardAmountToReverse > 0) {
    try {
      const { data: voided, error: voidErr } = await (admin.rpc as any)("void_gift_card_redemption", {
        p_booking_id: bookingId,
      });
      if (voidErr) {
        console.warn("[rollbackCollectibleSplitLeg] void_gift_card_redemption", bookingId, voidErr);
      } else if (voided === true) {
        giftRestoredOrCompensated = true;
      } else if (voided === false) {
        const walletTenantId = await resolveTenantIdForFinanceLedger(admin, {
          tenant_id: tenantId,
          provider_id: providerId,
        });
        const { error: giftCreditErr } = await (admin.rpc as any)("wallet_credit_admin", {
          p_user_id: customerId,
          p_amount: giftCardAmountToReverse,
          p_currency: currency || LAST_RESORT_CURRENCY,
          p_description: `Reversal: captured gift card could not be restored (${bookingId.slice(0, 8)})`,
          p_reference_id: bookingId,
          p_reference_type: "booking",
          p_tenant_id: walletTenantId,
          p_idempotency_key: `${idempotencyKey}:gift`,
        });
        if (giftCreditErr) {
          console.error("[rollbackCollectibleSplitLeg] gift wallet credit", bookingId, giftCreditErr);
        } else {
          giftRestoredOrCompensated = true;
        }
      }
    } catch (e) {
      console.warn("[rollbackCollectibleSplitLeg] void_gift_card_redemption", bookingId, e);
    }
  }

  if (walletAmountToReverse > 0) {
    try {
      const walletTenantId = await resolveTenantIdForFinanceLedger(admin, {
        tenant_id: tenantId,
        provider_id: providerId,
      });
      await (admin.rpc as any)("wallet_credit_admin", {
        p_user_id: customerId,
        p_amount: walletAmountToReverse,
        p_currency: currency || LAST_RESORT_CURRENCY,
        p_description: `Reversal: follow-up payment not completed (${bookingId.slice(0, 8)})`,
        p_reference_id: bookingId,
        p_reference_type: "booking",
        p_tenant_id: walletTenantId,
        p_idempotency_key: idempotencyKey,
      });
    } catch (e) {
      console.error("[rollbackCollectibleSplitLeg] wallet_credit_admin", bookingId, e);
    }
  }

  const walletProviderId = buildSyntheticWalletGiftProviderId("wallet", bookingId, paymentLegSuffix);
  const giftProviderId = buildSyntheticWalletGiftProviderId("gift_card", bookingId, paymentLegSuffix);

  await admin
    .from("booking_payments")
    .delete()
    .eq("booking_id", bookingId)
    .in("payment_provider_id", [walletProviderId, giftProviderId])
    .eq("status", "pending");

  const { data: bookingRow } = await admin
    .from("bookings")
    .select("wallet_amount, gift_card_amount")
    .eq("id", bookingId)
    .maybeSingle();
  if (bookingRow) {
    const prevWallet = Number((bookingRow as { wallet_amount?: number }).wallet_amount ?? 0);
    const prevGift = Number((bookingRow as { gift_card_amount?: number }).gift_card_amount ?? 0);
    await admin
      .from("bookings")
      .update({
        wallet_amount: Math.max(0, subtractMoney(prevWallet, walletAmountToReverse)),
        gift_card_amount: giftRestoredOrCompensated
          ? Math.max(0, subtractMoney(prevGift, giftCardAmountToReverse))
          : prevGift,
      })
      .eq("id", bookingId);
  }
}
