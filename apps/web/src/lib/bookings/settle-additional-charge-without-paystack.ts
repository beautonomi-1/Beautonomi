/**
 * Mark an additional charge paid when wallet/gift fully covers the amount (no Paystack leg).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";
import { resolveCommissionPercentageForBooking } from "@/lib/finance/resolve-commission-percentage-for-booking";
import { addMoney, percentOf, subtractMoney, roundCurrency } from "@beautonomi/utils";
import {
  completeWalletGiftSyntheticPayments,
} from "@/lib/bookings/ensure-wallet-gift-booking-payments";
import { additionalChargeAmountStillDue } from "@/lib/bookings/display-invariants";
import { syncBookingAfterPaystackSuccess } from "@/lib/bookings/sync-booking-after-paystack-success";

/** Ledger split for an extra charge paid partly from wallet or gift card and partly at the till. */
export function additionalChargeMixedTenderLedger(input: {
  held: number;
  remainder: number;
  commissionRatePercent: number;
}): {
  held: number;
  remainder: number;
  commission: number;
  providerEarnings: number;
  paymentAmount: number;
  paymentNet: number;
  walkInAmount: number;
  walkInNet: number;
} {
  const held = roundCurrency(Math.max(0, input.held));
  const remainder = roundCurrency(Math.max(0, input.remainder));
  const rate = Number(input.commissionRatePercent) || 0;
  const commission = rate > 0 ? percentOf(held, rate) : 0;
  const providerEarnings = subtractMoney(held, commission);
  return {
    held,
    remainder,
    commission,
    providerEarnings,
    paymentAmount: held,
    paymentNet: commission,
    walkInAmount: remainder,
    walkInNet: remainder,
  };
}

export async function settleAdditionalChargeWithoutPaystack(
  admin: SupabaseClient,
  input: {
    bookingId: string;
    chargeId: string;
    customerId: string;
    providerId: string;
    tenantId: string | null;
    bookingNumber: string;
    chargeAmount: number;
    walletAmountApplied: number;
    giftCardAmountApplied: number;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const {
    bookingId,
    chargeId,
    customerId,
    providerId,
    tenantId,
    bookingNumber,
    chargeAmount,
    walletAmountApplied,
    giftCardAmountApplied,
  } = input;

  const { data: charge } = await admin
    .from("additional_charges")
    .select("id, status, amount, description")
    .eq("id", chargeId)
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (!charge || (charge as { status?: string }).status === "paid") {
    return { ok: true };
  }

  const collectible = Math.max(0, Number(chargeAmount) || 0);
  const tenderTotal =
    addMoney(walletAmountApplied, giftCardAmountApplied);
  if (tenderTotal + 0.005 < collectible) {
    return { ok: false, error: "Tender amounts do not cover the charge." };
  }

  const reference = `addl_nogw_${chargeId}`;

  const { data: existingFinance } = await admin
    .from("finance_transactions")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("transaction_type", "provider_earnings")
    .ilike("description", `%${chargeId}%`)
    .limit(1);
  if (Array.isArray(existingFinance) && existingFinance.length > 0) {
    await completeWalletGiftSyntheticPayments(admin, bookingId, {
      paymentLegSuffix: `:additional:${chargeId}`,
    });
    if ((charge as { status?: string }).status !== "paid") {
      await admin.from("additional_charges").update({
        status: "paid",
        paid_at: new Date().toISOString(),
      }).eq("id", chargeId).eq("booking_id", bookingId);
    }
    return { ok: true };
  }

  if (giftCardAmountApplied > 0) {
    try {
      const { data: captured, error: captureError } = await (admin.rpc as any)(
        "capture_gift_card_redemption",
        { p_booking_id: bookingId },
      );
      if (captureError) throw captureError;
      if (captured !== true) {
        return { ok: false, error: "Gift card could not be captured." };
      }
    } catch (captureErr) {
      const message = captureErr instanceof Error ? captureErr.message : String(captureErr);
      return { ok: false, error: message || "Gift card could not be captured." };
    }
  }
  const heldSuffix = `:additional:${chargeId}`;
  const { data: heldTenderRows } = await admin
    .from("booking_payments")
    .select("id, payment_provider")
    .eq("booking_id", bookingId)
    .in("payment_provider", ["wallet", "gift_card"])
    .like("payment_provider_id", `%${heldSuffix}`);
  const walletTenderId =
    (heldTenderRows ?? []).find((row) => (row as { payment_provider?: string }).payment_provider === "wallet") as
      | { id?: string }
      | undefined;
  const giftTenderId =
    (heldTenderRows ?? []).find((row) => (row as { payment_provider?: string }).payment_provider === "gift_card") as
      | { id?: string }
      | undefined;
  const primaryTenderId = walletTenderId?.id
    ? String(walletTenderId.id)
    : giftTenderId?.id
      ? String(giftTenderId.id)
      : null;
  const giftOnlyTenderId = giftTenderId?.id ? String(giftTenderId.id) : null;

  const financeTenantId = await resolveTenantIdForFinanceLedger(admin, {
    tenant_id: tenantId,
    provider_id: providerId,
  });
  const commissionRate = await resolveCommissionPercentageForBooking(admin, {
    bookingId,
    tenantId: financeTenantId,
    providerId,
  });
  const platformCommission =
    commissionRate > 0 ? percentOf(collectible, commissionRate) : 0;
  const providerEarnings = subtractMoney(collectible, platformCommission);

  await admin.from("finance_transactions").insert({
    booking_id: bookingId,
    provider_id: providerId,
    tenant_id: financeTenantId,
    source_payment_id: primaryTenderId,
    transaction_type: "additional_charge_payment",
    amount: collectible,
    fees: 0,
    commission: platformCommission,
    net: platformCommission,
    description: `Additional charge (wallet/gift) for booking ${bookingNumber} (${chargeId})`,
    created_at: new Date().toISOString(),
  });

  await admin.from("finance_transactions").insert({
    booking_id: bookingId,
    provider_id: providerId,
    tenant_id: financeTenantId,
    source_payment_id: primaryTenderId,
    transaction_type: "provider_earnings",
    amount: providerEarnings,
    fees: 0,
    commission: 0,
    net: providerEarnings,
    description: `Provider earnings (additional charge, wallet/gift) for booking ${bookingNumber} (${chargeId})`,
    created_at: new Date().toISOString(),
  });
  if (giftCardAmountApplied > 0) {
    await admin.from("finance_transactions").insert({
      booking_id: bookingId,
      provider_id: providerId,
      tenant_id: financeTenantId,
      source_payment_id: giftOnlyTenderId,
      transaction_type: "gift_card_payment",
      amount: giftCardAmountApplied,
      fees: 0,
      commission: 0,
      net: giftCardAmountApplied,
      description: `Gift card (additional charge) for booking ${bookingNumber} (${chargeId})`,
      created_at: new Date().toISOString(),
    });
    await admin.from("finance_transactions").insert({
      booking_id: bookingId,
      provider_id: providerId,
      tenant_id: financeTenantId,
      transaction_type: "gift_card_liability_reduction",
      amount: giftCardAmountApplied,
      fees: 0,
      commission: 0,
      net: -giftCardAmountApplied,
      description: `Gift card liability reduction (additional charge) for booking ${bookingNumber} (${chargeId})`,
      created_at: new Date().toISOString(),
    });
  }
  await completeWalletGiftSyntheticPayments(admin, bookingId, {
    paymentLegSuffix: heldSuffix,
  });
  await syncBookingAfterPaystackSuccess(admin, bookingId, {
    paymentProvider: walletAmountApplied > 0 ? "wallet" : "gift_card",
  });

  await admin.from("additional_charges").update({
    status: "paid",
    paid_at: new Date().toISOString(),
  }).eq("id", chargeId).eq("booking_id", bookingId);

  const { data: bookingRow } = await admin
    .from("bookings")
    .select("total_amount")
    .eq("id", bookingId)
    .maybeSingle();
  await admin
    .from("bookings")
    .update({
      total_amount:
        addMoney(
          Number((bookingRow as { total_amount?: number } | null)?.total_amount ?? 0),
          collectible,
        ),
      updated_at: new Date().toISOString(),
    })
    .eq("id", bookingId);

  await admin.from("booking_events").insert({
    booking_id: bookingId,
    event_type: "additional_payment_paid",
    event_data: {
      charge_id: chargeId,
      reference,
      amount: collectible,
      wallet_amount: walletAmountApplied,
      gift_card_amount: giftCardAmountApplied,
    },
    created_by: customerId,
  });

  try {
    const { notifyAdditionalChargePaid } = await import(
      "@/lib/notifications/notify-additional-charge-paid"
    );
    await notifyAdditionalChargePaid(admin, chargeId);
  } catch (notifErr) {
    console.warn("[settle-additional-charge-without-paystack] notification failed:", notifErr);
  }

  try {
    const { trackAdditionalChargePaidServer } = await import(
      "@/lib/analytics/amplitude/track-additional-charge-paid-server"
    );
    await trackAdditionalChargePaidServer({
      reference,
      bookingId,
      chargeId,
      amount: collectible,
      customerId,
      paymentMethod: walletAmountApplied > 0 ? "wallet" : "gift_card",
      paymentProvider: "platform",
    });
  } catch (analyticsErr) {
    console.warn("[settle-additional-charge-without-paystack] analytics failed:", analyticsErr);
  }

  return { ok: true };
}

/**
 * Till collection when a wallet or gift card already holds part of an extra charge.
 * The card or cash row is only the remainder. The hold is completed, and the booking
 * total grows by the full charge once.
 */
export async function settleAdditionalChargeRemainderAfterHold(
  admin: SupabaseClient,
  input: {
    bookingId: string;
    chargeId: string;
    providerId: string;
    tenantId: string | null;
    chargeAmount: number;
    chargeDescription?: string | null;
    heldWallet: number;
    heldGift: number;
    remainderAmount: number;
    paymentProvider: string;
    paymentMethod: string;
    reference: string;
    createdBy?: string | null;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const stillDue = additionalChargeAmountStillDue(
    input.chargeAmount,
    addMoney(input.heldWallet, input.heldGift),
  );
  const remainder = roundCurrency(Math.max(0, input.remainderAmount));
  if (remainder > stillDue + 0.02) {
    return {
      ok: false,
      error: "Card amount is higher than the extra charge still owed after wallet and gift card.",
    };
  }
  if (Math.abs(remainder - stillDue) > 0.02) {
    return { ok: false, error: "Payment does not match the extra charge still owed." };
  }

  const description = `Walk-in additional charge ${input.chargeId}: ${input.chargeDescription?.trim() || "Add-on"}`;
  const { data: existingRecognition } = await admin
    .from("finance_transactions")
    .select("id")
    .eq("booking_id", input.bookingId)
    .eq("transaction_type", "walk_in_additional_charge")
    .eq("description", description)
    .limit(1);
  if (Array.isArray(existingRecognition) && existingRecognition.length > 0) {
    await admin
      .from("additional_charges")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", input.chargeId)
      .eq("booking_id", input.bookingId);
    return { ok: true };
  }

  let bookingPaymentId: string | null = null;
  if (remainder > 0.009) {
    const { data: existingRemainder } = await admin
      .from("booking_payments")
      .select("id")
      .eq("booking_id", input.bookingId)
      .eq("payment_provider_id", input.reference)
      .limit(1);
    const existingId = (existingRemainder?.[0] as { id?: string } | undefined)?.id;
    if (existingId) {
      bookingPaymentId = String(existingId);
    }
  }
  if (remainder > 0.009 && !bookingPaymentId) {
    const { data: inserted, error: payErr } = await admin
      .from("booking_payments")
      .insert({
        booking_id: input.bookingId,
        tenant_id: input.tenantId,
        amount: remainder,
        payment_method: input.paymentMethod,
        payment_provider: input.paymentProvider,
        payment_provider_id: input.reference,
        payment_provider_data: {
          additional_charge_id: input.chargeId,
          source: "walk_in",
        },
        status: "completed",
        notes: "Walk-in additional charge payment",
        created_by: input.createdBy ?? null,
      })
      .select("id")
      .single();
    if (payErr || !inserted) {
      return { ok: false, error: payErr?.message || "Failed to record the remaining extra-charge payment." };
    }
    bookingPaymentId = String((inserted as { id: string }).id);
  }

  const heldTotal = addMoney(input.heldWallet, input.heldGift);
  const commissionRate = await resolveCommissionPercentageForBooking(admin, {
    bookingId: input.bookingId,
    tenantId: input.tenantId,
    providerId: input.providerId,
  });
  const ledger = additionalChargeMixedTenderLedger({
    held: heldTotal,
    remainder,
    commissionRatePercent: commissionRate,
  });
  const now = new Date().toISOString();
  const { data: heldPayment } = await admin
    .from("booking_payments")
    .select("id, payment_provider")
    .eq("booking_id", input.bookingId)
    .in("payment_provider", ["wallet", "gift_card"])
    .like("payment_provider_id", `%:additional:${input.chargeId}`)
    .limit(1);
  const heldPaymentId = (heldPayment?.[0] as { id?: string } | undefined)?.id ?? null;
  const heldDescription = `Additional charge ${input.chargeId} wallet and gift card`;
  const { data: existingHeld } = await admin
    .from("finance_transactions")
    .select("id")
    .eq("booking_id", input.bookingId)
    .eq("transaction_type", "payment")
    .eq("description", heldDescription)
    .limit(1);
  if (!Array.isArray(existingHeld) || existingHeld.length === 0) {
    const { error: commissionErr } = await admin.from("finance_transactions").insert({
      booking_id: input.bookingId,
      provider_id: input.providerId,
      tenant_id: input.tenantId,
      source_payment_id: heldPaymentId,
      transaction_type: "payment",
      amount: ledger.paymentAmount,
      fees: 0,
      commission: ledger.commission,
      net: ledger.paymentNet,
      description: heldDescription,
      created_at: now,
    });
    if (commissionErr) return { ok: false, error: commissionErr.message };

    const { error: earningsErr } = await admin.from("finance_transactions").insert({
      booking_id: input.bookingId,
      provider_id: input.providerId,
      tenant_id: input.tenantId,
      source_payment_id: heldPaymentId,
      transaction_type: "provider_earnings",
      amount: ledger.providerEarnings,
      fees: 0,
      commission: 0,
      net: ledger.providerEarnings,
      description: `Provider earnings (additional charge, wallet/gift) (${input.chargeId})`,
      created_at: now,
    });
    if (earningsErr) return { ok: false, error: earningsErr.message };
  }

  await completeWalletGiftSyntheticPayments(admin, input.bookingId, {
    paymentLegSuffix: `:additional:${input.chargeId}`,
  });

  const { error: recognitionErr } = await admin.from("finance_transactions").insert({
    booking_id: input.bookingId,
    provider_id: input.providerId,
    tenant_id: input.tenantId,
    source_payment_id: bookingPaymentId,
    transaction_type: "walk_in_additional_charge",
    amount: ledger.walkInAmount,
    fees: 0,
    commission: 0,
    net: ledger.walkInNet,
    description,
    created_at: now,
  });
  if (recognitionErr) {
    return { ok: false, error: recognitionErr.message };
  }

  if (remainder > 0.009) {
    await admin.from("payment_transactions").insert({
      booking_id: input.bookingId,
      reference: input.reference,
      amount: remainder,
      fees: 0,
      net_amount: remainder,
      status: "success",
      provider: input.paymentProvider,
      transaction_type: "charge",
      metadata: {
        kind: "walk_in_additional_charge",
        additional_charge_id: input.chargeId,
        payment_method: input.paymentMethod,
        source: "provider_mark_paid",
        created_by: input.createdBy ?? null,
      },
      created_at: new Date().toISOString(),
    });
  }

  const { data: bookingRow } = await admin
    .from("bookings")
    .select("total_amount")
    .eq("id", input.bookingId)
    .maybeSingle();
  await admin
    .from("bookings")
    .update({
      total_amount:
        addMoney(
          Number((bookingRow as { total_amount?: number } | null)?.total_amount ?? 0),
          addMoney(ledger.held, ledger.remainder),
        ),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.bookingId);

  await admin
    .from("additional_charges")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", input.chargeId)
    .eq("booking_id", input.bookingId);

  return { ok: true };
}
