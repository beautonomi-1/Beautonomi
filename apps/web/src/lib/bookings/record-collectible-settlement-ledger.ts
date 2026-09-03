/**
 * Finance ledger for a collectible settled without Paystack (wallet/gift follow-up payments).
 * Idempotent per `idempotencyReference` (e.g. pay-remaining ref or additional-charge id).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";
import { resolveCommissionPercentageForProvider } from "@/lib/finance/resolve-commission-percentage";
import { percentOf, subtractMoney } from "@beautonomi/utils";
import { fetchBookingCommissionContext } from "./fetch-booking-commission-context";
import {
  resolveCommissionBaseForBookingPayment,
  sumPendingBookingLevelCatchUpNet,
} from "./resolve-commission-base-for-booking-payment";

export async function recordCollectibleSettlementLedger(
  admin: SupabaseClient,
  input: {
    bookingId: string;
    providerId: string;
    tenantId: string | null;
    bookingNumber: string;
    bookingTotal: number;
    tipAmount?: number;
    taxAmount?: number;
    travelFee?: number;
    serviceFeeAmount?: number;
    collectibleAmount: number;
    walletAmountApplied: number;
    giftCardAmountApplied: number;
    idempotencyReference: string;
    settlementLabel: string;
    /** When true, defer tip/tax/travel/platform_fee until full settlement. */
    isDeposit?: boolean;
  },
): Promise<void> {
  const {
    bookingId,
    providerId,
    tenantId,
    bookingNumber,
    bookingTotal,
    tipAmount = 0,
    taxAmount = 0,
    travelFee = 0,
    serviceFeeAmount = 0,
    collectibleAmount,
    walletAmountApplied,
    giftCardAmountApplied,
    idempotencyReference,
    settlementLabel,
    isDeposit = false,
  } = input;

  const financeTenantId = await resolveTenantIdForFinanceLedger(admin, {
    tenant_id: tenantId,
    provider_id: providerId,
  });

  const internalRef = `collectible_settlement:${idempotencyReference}`;
  const { data: existingTx } = await admin
    .from("payment_transactions")
    .select("id")
    .eq("reference", internalRef)
    .maybeSingle();
  if (existingTx) return;

  const amountCollected = Math.max(0, collectibleAmount);
  const totalCollectedForCommission =
    amountCollected + Math.max(0, walletAmountApplied) + Math.max(0, giftCardAmountApplied);

  const commissionContext = await fetchBookingCommissionContext(admin, bookingId, {
    chargeAmount: totalCollectedForCommission,
    excludeReference: internalRef,
  });

  const postBookingLevelFees =
    !isDeposit && !commissionContext.bookingLevelItemsAlreadyPosted;
  const pendingCatchUpNet = postBookingLevelFees
    ? sumPendingBookingLevelCatchUpNet({
        tipAmount,
        travelFee,
        platformFee: serviceFeeAmount,
        existingTypes: commissionContext.existingBookingLevelTypes,
      })
    : 0;
  const postedLegsForResidual =
    commissionContext.postedLegsSum +
    (commissionContext.bookingLevelItemsAlreadyPosted ? pendingCatchUpNet : 0);

  const commissionBase = resolveCommissionBaseForBookingPayment({
    paymentAmount: totalCollectedForCommission,
    bookingTotal,
    platformFee: serviceFeeAmount,
    tip: tipAmount,
    tax: taxAmount,
    travel: travelFee,
    postedLegsSum: postedLegsForResidual,
    cumulativePaid: commissionContext.cumulativePaid,
    bookingLevelItemsAlreadyPosted: commissionContext.bookingLevelItemsAlreadyPosted,
  });

  const commissionRate = await resolveCommissionPercentageForProvider(admin, {
    tenantId: financeTenantId,
    providerId,
  });
  const platformCommission =
    commissionRate > 0 ? percentOf(commissionBase, commissionRate) : 0;
  const providerEarnings = subtractMoney(commissionBase, platformCommission);

  const now = new Date().toISOString();

  await admin.from("payment_transactions").insert({
    booking_id: bookingId,
    reference: internalRef,
    amount: amountCollected,
    fees: 0,
    net_amount: amountCollected,
    status: "success",
    provider: walletAmountApplied > 0 ? "wallet" : "gift_card",
    transaction_type: "charge",
    metadata: {
      kind: "collectible_settlement",
      wallet_amount_applied: walletAmountApplied,
      gift_card_amount_applied: giftCardAmountApplied,
      settlement_label: settlementLabel,
    },
    created_at: now,
  });

  const financeRows: Array<Record<string, unknown>> = [
    {
      booking_id: bookingId,
      provider_id: providerId,
      tenant_id: financeTenantId,
      transaction_type: "payment",
      amount: commissionBase,
      fees: 0,
      commission: platformCommission,
      net: platformCommission,
      description: `${settlementLabel} for booking ${bookingNumber}`,
      created_at: now,
    },
    {
      booking_id: bookingId,
      provider_id: providerId,
      tenant_id: financeTenantId,
      transaction_type: "provider_earnings",
      amount: providerEarnings,
      fees: 0,
      commission: 0,
      net: providerEarnings,
      description: `Provider earnings (${settlementLabel}) for booking ${bookingNumber}`,
      created_at: now,
    },
  ];

  if (postBookingLevelFees) {
    if (serviceFeeAmount > 0 && !commissionContext.existingBookingLevelTypes.has("platform_fee")) {
      financeRows.push({
        booking_id: bookingId,
        provider_id: providerId,
        tenant_id: financeTenantId,
        transaction_type: "platform_fee",
        amount: serviceFeeAmount,
        fees: 0,
        commission: 0,
        net: serviceFeeAmount,
        description: `Platform fee for booking ${bookingNumber}`,
        created_at: now,
      });
    }
    if (tipAmount > 0 && !commissionContext.existingBookingLevelTypes.has("tip")) {
      financeRows.push({
        booking_id: bookingId,
        provider_id: providerId,
        tenant_id: financeTenantId,
        transaction_type: "tip",
        amount: tipAmount,
        fees: 0,
        commission: 0,
        net: tipAmount,
        description: `Tip for booking ${bookingNumber}`,
        created_at: now,
      });
    }
    if (taxAmount > 0 && !commissionContext.existingBookingLevelTypes.has("tax")) {
      financeRows.push({
        booking_id: bookingId,
        provider_id: providerId,
        tenant_id: financeTenantId,
        transaction_type: "tax",
        amount: taxAmount,
        fees: 0,
        commission: 0,
        net: 0,
        description: `Tax for booking ${bookingNumber}`,
        created_at: now,
      });
    }
    if (travelFee > 0 && !commissionContext.existingBookingLevelTypes.has("travel_fee")) {
      financeRows.push({
        booking_id: bookingId,
        provider_id: providerId,
        tenant_id: financeTenantId,
        transaction_type: "travel_fee",
        amount: travelFee,
        fees: 0,
        commission: 0,
        net: travelFee,
        description: `Travel fee for booking ${bookingNumber}`,
        created_at: now,
      });
    }
  }

  await admin.from("finance_transactions").insert(financeRows);

  if (walletAmountApplied > 0) {
    const { data: existingWallet } = await admin
      .from("finance_transactions")
      .select("id")
      .eq("booking_id", bookingId)
      .eq("transaction_type", "wallet_payment")
      .ilike("description", `%${idempotencyReference}%`)
      .maybeSingle();
    if (!existingWallet) {
      await admin.from("finance_transactions").insert({
        booking_id: bookingId,
        provider_id: providerId,
        tenant_id: financeTenantId,
        transaction_type: "wallet_payment",
        amount: walletAmountApplied,
        fees: 0,
        commission: 0,
        net: walletAmountApplied,
        description: `Wallet payment (${settlementLabel}) ref ${idempotencyReference} booking ${bookingNumber}`,
        created_at: now,
      });
    }
  }

  if (giftCardAmountApplied > 0) {
    const { data: existingGc } = await admin
      .from("finance_transactions")
      .select("id")
      .eq("booking_id", bookingId)
      .eq("transaction_type", "gift_card_payment")
      .ilike("description", `%${idempotencyReference}%`)
      .maybeSingle();
    if (!existingGc) {
      await admin.from("finance_transactions").insert({
        booking_id: bookingId,
        provider_id: providerId,
        tenant_id: financeTenantId,
        transaction_type: "gift_card_payment",
        amount: giftCardAmountApplied,
        fees: 0,
        commission: 0,
        net: giftCardAmountApplied,
        description: `Gift card payment (${settlementLabel}) ref ${idempotencyReference} booking ${bookingNumber}`,
        created_at: now,
      });
    }
    const { data: existingGcLiab } = await admin
      .from("finance_transactions")
      .select("id")
      .eq("booking_id", bookingId)
      .eq("transaction_type", "gift_card_liability_reduction")
      .ilike("description", `%${idempotencyReference}%`)
      .maybeSingle();
    if (!existingGcLiab) {
      await admin.from("finance_transactions").insert({
        booking_id: bookingId,
        provider_id: providerId,
        tenant_id: financeTenantId,
        transaction_type: "gift_card_liability_reduction",
        amount: giftCardAmountApplied,
        fees: 0,
        commission: 0,
        net: -giftCardAmountApplied,
        description: `Gift card liability reduction (${settlementLabel}) ref ${idempotencyReference} booking ${bookingNumber}`,
        created_at: now,
      });
    }
  }

  if (tipAmount > 0) {
    void import("@/lib/notifications/notify-staff-event")
      .then(({ notifyStaffTipReceivedForBooking }) =>
        notifyStaffTipReceivedForBooking(admin, bookingId),
      )
      .catch(() => undefined);
  }
}
