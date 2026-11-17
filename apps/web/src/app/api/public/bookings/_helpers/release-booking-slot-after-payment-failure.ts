import type { SupabaseClient } from "@supabase/supabase-js";
import { addMoney, computeVat, percentOf, roundCurrency, subtractMoney, sumMoney } from "@beautonomi/utils";
import {
  lineUpBookingStockWithSavedStatus,
  restoreBookingRetailStock,
} from "@/lib/bookings/deduct-booking-retail-stock";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

/** Appended when the visit was released but the wallet or gift card refund did not finish. */
export const PAYMENT_FAILURE_REFUND_STILL_DUE = " — refund still due";

/**
 * The stored total already excludes the loyalty discount, and tax and a
 * percentage fee were calculated on that smaller base. Once the points are
 * back, the open visit's bill uses the base before that discount.
 */
export function billAfterLoyaltyReturned(
  row: {
    loyalty_discount_amount?: number | null;
    total_amount?: number | null;
    tax_amount?: number | null;
    tax_rate?: number | null;
    tax_inclusive?: boolean | null;
    tip_amount?: number | null;
    platform_fee_amount?: number | null;
    service_fee_amount?: number | null;
    service_fee_percentage?: number | null;
    platform_fee_percentage?: number | null;
  },
  currency: string,
): {
  total_amount: number;
  tax_amount: number;
  platform_fee_amount: number;
  service_fee_amount: number;
} | null {
  const loyalty = Number(row.loyalty_discount_amount ?? 0);
  if (loyalty <= 0.009 || row.total_amount == null || !Number.isFinite(Number(row.total_amount))) {
    return null;
  }
  const total = Number(row.total_amount);
  const tip = Number(row.tip_amount ?? 0);
  const fee = Number(row.platform_fee_amount ?? row.service_fee_amount ?? 0);
  const feePct = Number(
    row.service_fee_percentage != null ? row.service_fee_percentage : (row.platform_fee_percentage ?? 0),
  );
  const tax = Number(row.tax_amount ?? 0);
  const taxRate = Number(row.tax_rate ?? 0);
  const inclusive = row.tax_inclusive !== false;
  if (taxRate <= 0 && feePct <= 0) {
    return {
      total_amount: addMoney(total, loyalty, currency),
      tax_amount: tax,
      platform_fee_amount: fee,
      service_fee_amount: fee,
    };
  }
  const afterTip = subtractMoney(total, tip, currency);
  const afterFee = subtractMoney(afterTip, fee, currency);
  const oldBase = Math.max(0, inclusive ? afterFee : subtractMoney(afterFee, tax, currency));
  const newBase = addMoney(oldBase, loyalty, currency);
  const newTax =
    taxRate > 0 ? computeVat({ baseAmount: newBase, ratePercent: taxRate, inclusive, currency }).taxAmount : tax;
  const newFee = feePct > 0 ? percentOf(newBase, feePct, currency) : fee;
  const newTotal = inclusive
    ? sumMoney(currency, newBase, tip, newFee)
    : sumMoney(currency, newBase, tip, newTax, newFee);
  return {
    total_amount: newTotal,
    tax_amount: newTax,
    platform_fee_amount: newFee,
    service_fee_amount: newFee,
  };
}

/** The booking insert still holds this discount inside discount_amount until the loyalty columns are saved. */
async function unsavedLoyaltyDiscountAmount(
  adminSupabase: SupabaseClient,
  points: number,
  currency: string,
): Promise<number | null> {
  try {
    const { data, error } = await adminSupabase
      .from("loyalty_point_config")
      .select("redemption_rate")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    const rate = Number((data as { redemption_rate?: number }).redemption_rate) || 10;
    if (rate <= 0) return null;
    return roundCurrency(points / rate, currency);
  } catch (e) {
    console.warn("[releaseBookingSlotAfterPaymentFailure] loyalty redemption rate", e);
    return null;
  }
}

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
  customerId: string,
  cancellationReason = "Payment could not be started — slot released so you can try again",
): Promise<boolean> {
  const { data: row, error: fetchErr } = await adminSupabase
    .from("bookings")
    .select(
      "id, status, wallet_amount, gift_card_amount, currency, tenant_id, provider_id, customer_package_entitlement_id, loyalty_points_used, loyalty_points_redeemed, loyalty_points_earned, loyalty_discount_amount, discount_amount, total_amount, tax_amount, tax_rate, tax_inclusive, tip_amount, platform_fee_amount, service_fee_amount, service_fee_percentage, platform_fee_percentage",
    )
    .eq("id", bookingId)
    .eq("customer_id", customerId)
    .maybeSingle();

  const entitlementId = (row as { customer_package_entitlement_id?: string | null } | null)
    ?.customer_package_entitlement_id;
  let sessionReturned = !entitlementId;
  if (entitlementId) {
    let claimedSession = false;
    try {
      const { data: claimed } = await adminSupabase
        .from("bookings")
        .update({ customer_package_entitlement_id: null })
        .eq("id", bookingId)
        .eq("customer_package_entitlement_id", entitlementId)
        .select("id");
      if (claimed?.length) {
        claimedSession = true;
        const { data: restored, error } = await adminSupabase.rpc("restore_customer_package_entitlement", {
          p_entitlement_id: entitlementId,
          p_customer_id: customerId,
        });
        if (error || restored !== true) throw error ?? new Error("package session was not returned");
        sessionReturned = true;
      }
    } catch (e) {
      console.warn("[releaseBookingSlotAfterPaymentFailure] restore package session", bookingId, e);
      if (claimedSession) {
        await adminSupabase
          .from("bookings")
          .update({ customer_package_entitlement_id: entitlementId })
          .eq("id", bookingId)
          .is("customer_package_entitlement_id", null);
      }
    }
  }

  if (fetchErr || !row) {
    console.error(
      "[releaseBookingSlotAfterPaymentFailure] fetch booking",
      bookingId,
      fetchErr
    );
    return false;
  }

  let voided: boolean | null = null;
  let voidFailed = false;
  try {
    const { data: voidResult, error: voidErr } = await (adminSupabase.rpc as any)("void_gift_card_redemption", {
      p_booking_id: bookingId,
    });
    if (voidErr) voidFailed = true;
    else if (voidResult === false) voided = false;
    else if (voidResult === true) voided = true;
    else voidFailed = true;
    if (voidFailed) {
      console.warn(
        "[releaseBookingSlotAfterPaymentFailure] void_gift_card_redemption",
        bookingId,
        voidErr
      );
    }
  } catch (e) {
    voidFailed = true;
    console.warn("[releaseBookingSlotAfterPaymentFailure] void_gift_card_redemption", bookingId, e);
  }

  const giftHeld = Number((row as { gift_card_amount?: unknown }).gift_card_amount ?? 0);
  let giftReturned = giftHeld <= 0.009;
  if (giftHeld > 0.009) {
    if (voidFailed || voided == null) {
      giftReturned = false;
    } else if (voided === false) {
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
        giftReturned = !giftCreditErr;
        if (giftCreditErr) {
          console.error(
            "[releaseBookingSlotAfterPaymentFailure] gift wallet credit",
            bookingId,
            giftCreditErr
          );
        }
      } catch (e) {
        giftReturned = false;
        console.error("[releaseBookingSlotAfterPaymentFailure] gift wallet credit", bookingId, e);
      }
    } else {
      giftReturned = true;
    }
  }

  let redeemReturned = true;
  let earnReturned = true;
  let loyaltyPointsReturned = 0;
  try {
    const { refundRedeemedLoyaltyPoints } = await import("@/lib/loyalty/refund-redeemed-points");
    const loyalty = await refundRedeemedLoyaltyPoints(adminSupabase, {
      bookingId,
      customerId,
      reason: "payment_abandoned",
    });
    if (loyalty?.reason === "rpc_error" || loyalty?.reason === "lookup_failed") {
      redeemReturned = false;
    } else if (loyalty?.refunded && Number(loyalty.points) > 0) {
      loyaltyPointsReturned = Number(loyalty.points);
    }
  } catch (e) {
    redeemReturned = false;
    console.warn("[releaseBookingSlotAfterPaymentFailure] loyalty restore", bookingId, e);
  }

  try {
    const { clawBackEarnedLoyaltyForBooking } = await import(
      "@/lib/loyalty/claw-back-earned-for-booking"
    );
    await clawBackEarnedLoyaltyForBooking(adminSupabase, {
      bookingId,
      customerId,
    });
  } catch (e) {
    earnReturned = false;
    console.warn("[releaseBookingSlotAfterPaymentFailure] loyalty earn clawback", bookingId, e);
  }
  const loyaltyReturned = redeemReturned && earnReturned;

  const wa = Number((row as { wallet_amount?: unknown }).wallet_amount ?? 0);
  let walletReturned = wa <= 0.009;
  if (wa > 0.009) {
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
      walletReturned = !credErr;
      if (credErr) {
        console.error(
          "[releaseBookingSlotAfterPaymentFailure] wallet_credit_admin",
          bookingId,
          credErr
        );
      }
    } catch (e) {
      walletReturned = false;
      console.error("[releaseBookingSlotAfterPaymentFailure] wallet reversal", bookingId, e);
    }
  }

  if (walletReturned) {
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
  }

  // Products were taken when the visit was created. Put them back before the
  // visit is cancelled, so a retry does not take the same units again.
  const stockReturned = (await restoreBookingRetailStock(adminSupabase, bookingId)) ?? [];

  const now = new Date().toISOString();
  const moneyStillDue = !walletReturned || !giftReturned || !loyaltyReturned;
  const baseReason = cancellationReason.endsWith(PAYMENT_FAILURE_REFUND_STILL_DUE)
    ? cancellationReason.slice(0, -PAYMENT_FAILURE_REFUND_STILL_DUE.length)
    : cancellationReason;
  const alreadyCancelled = (row as { status?: string | null }).status === "cancelled";
  const loyaltyRow = row as {
    loyalty_points_used?: number | null;
    loyalty_points_redeemed?: number | null;
    loyalty_points_earned?: number | null;
    loyalty_discount_amount?: number | null;
    discount_amount?: number | null;
    total_amount?: number | null;
    tax_amount?: number | null;
    tax_rate?: number | null;
    tax_inclusive?: boolean | null;
    tip_amount?: number | null;
    platform_fee_amount?: number | null;
    service_fee_amount?: number | null;
    service_fee_percentage?: number | null;
    platform_fee_percentage?: number | null;
  };
  const currency = String((row as { currency?: string }).currency || LAST_RESORT_CURRENCY);
  const loyaltyBill: {
    loyalty_points_used?: number;
    loyalty_points_redeemed?: number;
    loyalty_points_earned?: number;
    loyalty_discount_amount?: number;
    discount_amount?: number;
    total_amount?: number;
    tax_amount?: number;
    platform_fee_amount?: number;
    service_fee_amount?: number;
  } = {};
  let loyaltyDiscount = Number(loyaltyRow.loyalty_discount_amount ?? 0);
  let discountStillIncludesLoyalty = false;
  if (redeemReturned && loyaltyDiscount <= 0.009 && loyaltyPointsReturned > 0) {
    const computed = await unsavedLoyaltyDiscountAmount(adminSupabase, loyaltyPointsReturned, currency);
    if (computed != null && computed > 0.009) {
      loyaltyDiscount = computed;
      discountStillIncludesLoyalty = true;
    }
  }
  const discountCounted =
    Number(loyaltyRow.loyalty_points_used ?? loyaltyRow.loyalty_points_redeemed ?? 0) > 0 ||
    loyaltyDiscount > 0.009;
  const earnedCounted = Number(loyaltyRow.loyalty_points_earned ?? 0) > 0;
  if (redeemReturned && discountCounted) {
    loyaltyBill.loyalty_points_used = 0;
    loyaltyBill.loyalty_points_redeemed = 0;
    loyaltyBill.loyalty_discount_amount = 0;
    const restoredBill = billAfterLoyaltyReturned(
      { ...loyaltyRow, loyalty_discount_amount: loyaltyDiscount },
      currency,
    );
    if (restoredBill) Object.assign(loyaltyBill, restoredBill);
    if (discountStillIncludesLoyalty) {
      loyaltyBill.discount_amount = Math.max(
        0,
        subtractMoney(Number(loyaltyRow.discount_amount ?? 0), loyaltyDiscount, currency),
      );
    }
  }
  if (earnReturned && earnedCounted) {
    loyaltyBill.loyalty_points_earned = 0;
  }
  const { data: cancelledRows, error } = await adminSupabase
    .from("bookings")
    .update({
      ...(alreadyCancelled
        ? {}
        : {
            status: "cancelled",
            cancelled_at: now,
            cancelled_by: customerId,
          }),
      cancellation_reason: moneyStillDue
        ? `${baseReason}${PAYMENT_FAILURE_REFUND_STILL_DUE}`
        : baseReason,
      updated_at: now,
      ...(walletReturned ? { wallet_amount: 0 } : {}),
      ...(giftReturned ? { gift_card_id: null, gift_card_amount: 0 } : {}),
      ...(sessionReturned ? { customer_package_entitlement_id: null } : {}),
      ...loyaltyBill,
    })
    .eq("id", bookingId)
    .eq("customer_id", customerId)
    .select("id");

  if (error || !cancelledRows?.length) {
    console.error(
      "[releaseBookingSlotAfterPaymentFailure] failed to cancel orphan booking",
      bookingId,
      error
    );
    try {
      await lineUpBookingStockWithSavedStatus(adminSupabase, bookingId, [], stockReturned);
    } catch (undoErr) {
      console.error(
        "[releaseBookingSlotAfterPaymentFailure] stock could not be lined up",
        bookingId,
        undoErr,
      );
    }
    const returnedTender: {
      wallet_amount?: number;
      gift_card_id?: null;
      gift_card_amount?: number;
      loyalty_points_used?: number;
      loyalty_points_redeemed?: number;
      loyalty_points_earned?: number;
      loyalty_discount_amount?: number;
      discount_amount?: number;
      total_amount?: number;
      tax_amount?: number;
      platform_fee_amount?: number;
      service_fee_amount?: number;
    } = {};
    if (walletReturned && wa > 0.009) returnedTender.wallet_amount = 0;
    if (giftReturned && giftHeld > 0.009) {
      returnedTender.gift_card_id = null;
      returnedTender.gift_card_amount = 0;
    }
    Object.assign(returnedTender, loyaltyBill);
    if (Object.keys(returnedTender).length > 0) {
      const { error: tenderErr } = await adminSupabase
        .from("bookings")
        .update(returnedTender)
        .eq("id", bookingId)
        .eq("customer_id", customerId);
      if (tenderErr) {
        console.error(
          "[releaseBookingSlotAfterPaymentFailure] returned tender could not be cleared",
          bookingId,
          tenderErr,
        );
      }
    }
    if (!alreadyCancelled && sessionReturned && entitlementId) {
      const { data: relinked, error: restoreLinkErr } = await adminSupabase
        .from("bookings")
        .update({ customer_package_entitlement_id: entitlementId })
        .eq("id", bookingId)
        .eq("customer_id", customerId)
        .is("customer_package_entitlement_id", null)
        .select("id");
      if (restoreLinkErr) {
        console.error(
          "[releaseBookingSlotAfterPaymentFailure] prepaid session could not be put back on the visit",
          bookingId,
          restoreLinkErr,
        );
      } else if (relinked?.length) {
        const { data: redeemed, error: redeemErr } = await adminSupabase.rpc("redeem_customer_package_entitlement", {
          p_entitlement_id: entitlementId,
          p_customer_id: customerId,
        });
        if (redeemErr || redeemed !== true) {
          console.error(
            "[releaseBookingSlotAfterPaymentFailure] prepaid session could not be held on the open visit",
            bookingId,
            redeemErr ?? "package session was not held",
          );
          await adminSupabase
            .from("bookings")
            .update({ customer_package_entitlement_id: null })
            .eq("id", bookingId)
            .eq("customer_package_entitlement_id", entitlementId);
        }
      }
    }
    return false;
  }
  return !moneyStillDue;
}
