/**
 * Apply gift-card reservation + wallet debit against a booking collectible (follow-up payments).
 * Does not initialize Paystack — callers charge `paystackAmount` separately.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isGiftCardsEnabledForTenant, isWalletEnabledForTenant } from "@/lib/subscriptions/entitlements";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";
import {
  completeWalletGiftSyntheticPayments,
  ensureWalletGiftBookingPayments,
} from "@/lib/bookings/ensure-wallet-gift-booking-payments";
import { computeCollectibleSplits } from "@/lib/bookings/compute-collectible-splits";
import { syncBookingAfterPaystackSuccess } from "@/lib/bookings/sync-booking-after-paystack-success";

export type ApplyCollectibleGiftWalletInput = {
  supabase: SupabaseClient;
  admin: SupabaseClient;
  customerId: string;
  bookingId: string;
  bookingNumber: string;
  providerId: string;
  tenantId: string | null;
  currency: string;
  collectibleAmount: number;
  useWallet?: boolean;
  giftCardCode?: string | null;
  walletDescription: string;
  /** Unique leg for booking_payments idempotency (e.g. `:remaining:ref` or `:additional:chargeId`). */
  paymentLegSuffix?: string;
  /**
   * When true, caller completes settlement (e.g. additional charge row + finance).
   * Skips gift capture, synthetic completion, and booking sync here.
   */
  deferFullSettlement?: boolean;
};

export type ApplyCollectibleGiftWalletResult =
  | {
      ok: true;
      walletAmountApplied: number;
      giftCardAmountApplied: number;
      giftCardId: string | null;
      paystackAmount: number;
      warnings: string[];
      /** True when collectible is fully covered (no Paystack leg required). */
      fullySettled: boolean;
    }
  | { ok: false; error: string; code?: string };

export async function applyCollectibleGiftAndWallet(
  input: ApplyCollectibleGiftWalletInput,
): Promise<ApplyCollectibleGiftWalletResult> {
  const {
    supabase,
    admin,
    customerId,
    bookingId,
    bookingNumber,
    providerId,
    tenantId,
    currency,
    collectibleAmount,
    useWallet,
    giftCardCode,
    walletDescription,
    paymentLegSuffix = "",
    deferFullSettlement = false,
  } = input;

  const flagTenantId = tenantId ?? undefined;
  const giftCode = (giftCardCode || "").trim().toUpperCase();

  if (giftCode) {
    const giftEnabled = await isGiftCardsEnabledForTenant(flagTenantId);
    if (!giftEnabled) {
      return { ok: false, error: "Gift cards are currently unavailable.", code: "FEATURE_DISABLED" };
    }
  }
  if (useWallet) {
    const walletEnabled = await isWalletEnabledForTenant(flagTenantId);
    if (!walletEnabled) {
      return { ok: false, error: "Wallet payments are currently unavailable.", code: "FEATURE_DISABLED" };
    }
  }

  const splits = await computeCollectibleSplits(supabase, {
    collectibleAmount,
    customerId,
    currency,
    useWallet: Boolean(useWallet),
    giftCardCode: giftCode || null,
  });
  if (splits.ok === false) {
    return { ok: false, error: splits.error, code: splits.code };
  }

  const { walletAmount, giftCardAmount, giftCardId, paystackAmount, warnings } = splits.result;
  let giftCardAmountApplied = 0;
  let walletAmountApplied = 0;
  let resolvedGiftCardId: string | null = null;

  const ledgerTenantId = await resolveTenantIdForFinanceLedger(admin, {
    tenant_id: tenantId,
    provider_id: providerId,
  });

  if (giftCode && giftCardAmount > 0) {
    const { data: reserved, error: reserveError } = await (supabase.rpc as any)(
      "reserve_gift_card_redemption",
      {
        p_code: giftCode,
        p_amount: giftCardAmount,
        p_booking_id: bookingId,
        p_currency: currency,
      },
    );
    if (reserveError) {
      return {
        ok: false,
        error: reserveError.message || "Invalid gift card",
        code: "GIFT_CARD_INVALID",
      };
    }
    const row = Array.isArray(reserved) ? reserved[0] : reserved;
    resolvedGiftCardId = row?.gift_card_id ?? giftCardId;
    giftCardAmountApplied = giftCardAmount;

    const { data: bookingRow } = await admin
      .from("bookings")
      .select("gift_card_amount, gift_card_id")
      .eq("id", bookingId)
      .maybeSingle();
    const prevGift = Number((bookingRow as { gift_card_amount?: number } | null)?.gift_card_amount ?? 0);
    await admin
      .from("bookings")
      .update({
        gift_card_id: resolvedGiftCardId ?? (bookingRow as { gift_card_id?: string } | null)?.gift_card_id,
        gift_card_amount: Math.round((prevGift + giftCardAmountApplied) * 100) / 100,
      })
      .eq("id", bookingId);
  }

  if (useWallet && walletAmount > 0) {
    const { data: debitResult, error: walletErr } = await (supabase.rpc as any)("wallet_debit_self", {
      p_amount: walletAmount,
      p_description: walletDescription || `Wallet spend for booking ${bookingNumber}`,
      p_reference_id: bookingId,
      p_reference_type: "booking",
      p_tenant_id: ledgerTenantId,
    });
    if (walletErr || !debitResult) {
      if (giftCardAmountApplied > 0) {
        await (admin.rpc as any)("release_gift_card_redemption", { p_booking_id: bookingId }).catch(() => {});
      }
      return {
        ok: false,
        error: walletErr?.message || "We could not debit your wallet. Please try again.",
        code: "WALLET_ERROR",
      };
    }
    walletAmountApplied = walletAmount;

    const { data: bookingRow } = await admin
      .from("bookings")
      .select("wallet_amount")
      .eq("id", bookingId)
      .maybeSingle();
    const prevWallet = Number((bookingRow as { wallet_amount?: number } | null)?.wallet_amount ?? 0);
    await admin
      .from("bookings")
      .update({
        wallet_amount: Math.round((prevWallet + walletAmountApplied) * 100) / 100,
      })
      .eq("id", bookingId);
  }

  const cardLegPending = paystackAmount > 0.005;
  await ensureWalletGiftBookingPayments(admin, {
    bookingId,
    tenantId,
    walletAmount: walletAmountApplied,
    giftCardAmount: giftCardAmountApplied,
    initialStatus: cardLegPending ? "pending" : "completed",
    paymentLegSuffix,
  });

  if (!deferFullSettlement && giftCardAmountApplied > 0 && !cardLegPending) {
    await (admin.rpc as any)("capture_gift_card_redemption", { p_booking_id: bookingId });
  }

  if (!deferFullSettlement && !cardLegPending) {
    await completeWalletGiftSyntheticPayments(admin, bookingId);
    await syncBookingAfterPaystackSuccess(admin, bookingId, {
      paymentProvider: walletAmountApplied > 0 ? "wallet" : "gift_card",
    });
  }

  return {
    ok: true,
    walletAmountApplied,
    giftCardAmountApplied,
    giftCardId: resolvedGiftCardId,
    paystackAmount: Math.max(0, paystackAmount),
    warnings,
    fullySettled: !cardLegPending,
  };
}
