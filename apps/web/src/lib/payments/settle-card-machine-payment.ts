import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  restoreSaleGiftCard,
  saleCardAmountStillDueForSale,
  settleReservedSaleGiftCard,
} from "@/lib/gift-cards/sale-gift-card";
import { recordProductOrderPayment } from "@/lib/orders/record-product-order-payment";
import {
  computeInPersonCollectibleAmount,
  computeProductOrderCancelWalletCredit,
  isProviderCollectedProductMethod,
  productOrderCancelIncludesGiftInWallet,
  productOrderTenderSplit,
  roundProductOrderMoney,
} from "@/lib/orders/product-order-tender";
import { normalizePaycloudMajorAmount } from "@/lib/payments/paycloud-cloud-amount";
import { resolveSaleEntityTarget } from "@/lib/provider-sales/resolve-sale-entity-target";
import {
  clearUncollectedProviderPortalPlatformFeeIfNeeded,
  type BookingFeeClearRow,
} from "@/lib/bookings/provider-booking-platform-fee";
import { sumPendingWalletGiftBookingPayments, sumAdditionalChargeTenderLegs } from "@/lib/bookings/ensure-wallet-gift-booking-payments";
import { additionalChargeAmountStillDue } from "@/lib/bookings/display-invariants";
import {
  settleAdditionalChargeRemainderAfterHold,
  settleAdditionalChargeWithoutPaystack,
} from "@/lib/bookings/settle-additional-charge-without-paystack";
import { rollbackCollectibleSplitLeg } from "@/lib/bookings/rollback-collectible-split-leg";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { notifyTerminalCaptureOnAlreadyPaidBooking } from "@/lib/payments/terminal-capture-on-paid-notify";

/** Provider-collected card-machine rails that share settle/reverse semantics. */
export type CardMachinePaymentProvider = "paycloud" | "yoco";

export type CardMachineEntityType =
  | "booking"
  | "group_booking"
  | "sale"
  | "product_order"
  | "additional_charge";

export interface SettleCardMachinePaymentInput {
  paymentProvider: CardMachinePaymentProvider;
  paymentId: string;
  providerId: string;
  entityType: CardMachineEntityType;
  entityId: string;
  /** Captured amount in major units (may include tip + cashback extras). */
  amount: number;
  /** Stable gateway payment id used as booking_payments.payment_provider_id base. */
  providerPaymentId: string;
  /** Human/merchant reference for payment_provider_data (PayCloud merchant_order_no, etc.). */
  merchantReference?: string | null;
  processedBy?: string | null;
  currency?: string;
  tipAmount?: number | null;
  /** PayCloud cashback (cash-out). Not used for Yoco. Does not bump booking totals. */
  cashbackAmount?: number | null;
  /** PayCloud expected base charge (excludes tip/cashback) for capture allocation. */
  expectedBaseAmount?: number | null;
}

export interface ReverseCardMachineSettlementInput {
  paymentProvider: CardMachinePaymentProvider;
  entityType: CardMachineEntityType;
  entityId: string;
  providerId: string;
  origProviderPaymentId: string;
  voidReference: string;
  processedBy?: string | null;
  /** When set, records a partial reversal (terminal REFUND) instead of full void. */
  refundAmount?: number | null;
  reversalKind?: "void" | "refund";
}

type AdditionalChargeRow = {
  id: string;
  amount?: number | null;
  status?: string | null;
  description?: string | null;
  currency?: string | null;
};

const PROVIDER_LABEL: Record<CardMachinePaymentProvider, string> = {
  paycloud: "Beautonomi card machine",
  yoco: "Yoco card machine",
};

function computeBaseRemaining(
  booking: {
    total_amount?: number | null;
    total_paid?: number | null;
    total_refunded?: number | null;
    wallet_amount?: number | null;
    gift_card_amount?: number | null;
  },
  pendingWalletGift = 0,
): number {
  const bookingTotal = Number(booking.total_amount ?? 0);
  const totalPaid = Number(booking.total_paid ?? 0);
  const totalRefunded = Number(booking.total_refunded ?? 0);
  const walletAmount = Number(booking.wallet_amount ?? 0);
  const giftCardAmount = Number(booking.gift_card_amount ?? 0);
  const effectivePaid = Math.max(0, totalPaid - totalRefunded);
  const walletGiftCoverage = walletAmount + giftCardAmount;
  const pending = Math.max(0, pendingWalletGift);
  const coverage = Math.max(effectivePaid + pending, walletGiftCoverage);
  return Math.max(0, bookingTotal - coverage);
}

async function baseRemainingForBooking(
  supabase: SupabaseClient,
  booking: { id?: string | null } & Parameters<typeof computeBaseRemaining>[0],
): Promise<number> {
  const bookingId = String(booking.id ?? "");
  const pending = bookingId ? await sumPendingWalletGiftBookingPayments(supabase, bookingId) : 0;
  return computeBaseRemaining(booking, pending);
}

/**
 * Split PayCloud captured total into base vs tip/cashback for booking ledger rows.
 * PayCloud may report paid_amount as base-only or base+extras; never double-count tips.
 */
export function allocateBaseFromCapture(params: {
  captured: number;
  baseRemaining: number;
  tip: number;
  cashback: number;
  /** Initiated base charge (excludes tip/cashback) from provider_paycloud_payments.expected_amount. */
  expectedBase?: number | null;
}): number {
  const captured = Math.max(0, Number(params.captured) || 0);
  const baseRemaining = Math.max(0, Number(params.baseRemaining) || 0);
  const tip = Math.max(0, Number(params.tip) || 0);
  const cashback = Math.max(0, Number(params.cashback) || 0);
  const extras = tip + cashback;
  const expectedBase =
    params.expectedBase != null && params.expectedBase > 0.01
      ? normalizePaycloudMajorAmount(params.expectedBase)
      : null;

  if (extras <= 0.01) {
    return Math.min(captured, baseRemaining);
  }

  if (
    expectedBase != null &&
    Math.abs(captured - (expectedBase + extras)) < 0.02
  ) {
    return Math.min(baseRemaining, expectedBase);
  }

  if (Math.abs(captured - (baseRemaining + extras)) < 0.02) {
    return Math.min(baseRemaining, Math.max(0, captured - extras));
  }

  if (captured > baseRemaining + 0.01) {
    return Math.min(baseRemaining, Math.max(0, captured - extras));
  }

  return Math.min(captured, baseRemaining);
}

/** True when the capture still has enough left, after the booking balance and tip, to pay these add-ons. */
export function capturedFundsCoverCharges(input: {
  captured: number;
  baseApplied: number;
  tip: number;
  cashback: number;
  chargesTotal: number;
}): boolean {
  const charges = Math.max(0, Number(input.chargesTotal) || 0);
  if (charges <= 0.01) return false;
  const leftover =
    Math.max(0, Number(input.captured) || 0) -
    Math.max(0, Number(input.baseApplied) || 0) -
    Math.max(0, Number(input.tip) || 0) -
    Math.max(0, Number(input.cashback) || 0);
  return leftover + 0.01 >= charges;
}

function unpaidChargeRows(booking: { additional_charges?: AdditionalChargeRow[] | null }): AdditionalChargeRow[] {
  if (!Array.isArray(booking.additional_charges)) return [];
  return booking.additional_charges.filter(
    (c) => c?.status !== "paid" && c?.status !== "rejected" && Boolean(c?.id),
  );
}

/** Exported for reversal-order unit tests (base → tip → cashback). */
export function paymentSuffixRank(providerPaymentId: string): number {
  const id = String(providerPaymentId ?? "");
  if (id.endsWith(":cashback")) return 2;
  if (id.endsWith(":tip")) return 1;
  return 0;
}

async function settleCardMachineTip(
  supabase: SupabaseClient,
  params: {
    paymentProvider: CardMachinePaymentProvider;
    bookingId: string;
    tenantId: string | null;
    tip: number;
    providerPaymentId: string;
    merchantReference?: string | null;
    paymentId: string;
    processedBy?: string | null;
  },
): Promise<void> {
  const tip = Math.round(params.tip * 100) / 100;
  if (tip <= 0) return;

  const { error } = await supabase.from("booking_payments").insert({
    booking_id: params.bookingId,
    tenant_id: params.tenantId,
    amount: tip,
    payment_method: "card",
    payment_provider: params.paymentProvider,
    payment_provider_id: `${params.providerPaymentId}:tip`,
    payment_provider_data: {
      [`${params.paymentProvider}_payment_id`]: params.providerPaymentId,
      merchant_reference: params.merchantReference ?? null,
      ...(params.paymentProvider === "paycloud"
        ? { merchant_order_no: params.merchantReference ?? null }
        : {}),
      payment_id: params.paymentId,
      tip: true,
    },
    status: "completed",
    notes: `${PROVIDER_LABEL[params.paymentProvider]} tip - ${params.providerPaymentId}`,
    created_by: params.processedBy ?? null,
  });
  if (error) {
    if (error.code === "23505") return;
    throw error;
  }

  const { incrementBookingTipAmount } = await import("@/lib/bookings/increment-booking-tip");
  await incrementBookingTipAmount(supabase, params.bookingId, tip);
}

/**
 * Record card-machine cashback as its own payment + finance_transactions.cashback row.
 * Cashback is a cash-out wash — do NOT bump bookings.total_amount / tip_amount.
 */
async function settleCardMachineCashback(
  supabase: SupabaseClient,
  params: {
    paymentProvider: CardMachinePaymentProvider;
    bookingId: string;
    tenantId: string | null;
    cashback: number;
    providerPaymentId: string;
    merchantReference?: string | null;
    paymentId: string;
    processedBy?: string | null;
  },
): Promise<void> {
  const cashback = Math.round(params.cashback * 100) / 100;
  if (cashback <= 0) return;
  // Yoco has no cashback rail today.
  if (params.paymentProvider !== "paycloud") return;

  const { error } = await supabase.from("booking_payments").insert({
    booking_id: params.bookingId,
    tenant_id: params.tenantId,
    amount: cashback,
    payment_method: "card",
    payment_provider: params.paymentProvider,
    payment_provider_id: `${params.providerPaymentId}:cashback`,
    payment_provider_data: {
      paycloud_payment_id: params.providerPaymentId,
      merchant_reference: params.merchantReference ?? null,
      merchant_order_no: params.merchantReference ?? null,
      payment_id: params.paymentId,
      cashback: true,
    },
    status: "completed",
    notes: `${PROVIDER_LABEL[params.paymentProvider]} cashback - ${params.providerPaymentId}`,
    created_by: params.processedBy ?? null,
  });
  if (error) {
    if (error.code === "23505") return;
    throw error;
  }
}

async function notifyCardMachineAdditionalChargePaid(
  admin: ReturnType<typeof getSupabaseAdmin>,
  chargeId: string,
): Promise<void> {
  try {
    const { notifyAdditionalChargePaid } = await import(
      "@/lib/notifications/notify-additional-charge-paid"
    );
    await notifyAdditionalChargePaid(admin, chargeId);
  } catch (notifErr) {
    console.warn("[settle-card-machine] additional charge notify failed:", notifErr);
  }
}

async function settleUnpaidAdditionalCharges(
  paymentProvider: CardMachinePaymentProvider,
  bookingId: string,
  providerId: string,
  tenantId: string | null,
  charges: AdditionalChargeRow[],
  providerPaymentId: string,
  processedBy: string | null | undefined,
): Promise<void> {
  if (!charges.length) return;
  const admin = getSupabaseAdmin();
  for (const charge of charges) {
    if (!charge.id) continue;
    const chargeRef = `${providerPaymentId}:charge:${charge.id}`;
    const { error } = await admin.rpc("record_walk_in_additional_charge_payment", {
      p_booking_id: bookingId,
      p_charge_id: charge.id,
      p_provider_id: providerId,
      p_tenant_id: tenantId,
      p_payment_provider: paymentProvider,
      p_payment_method: "card",
      p_reference: chargeRef,
      p_created_by: processedBy ?? null,
    });
    if (error) {
      throw new Error(error.message || `Failed to settle additional charge ${charge.id}`);
    }
    await notifyCardMachineAdditionalChargePaid(admin, charge.id);
  }
}

/**
 * Settle a successful card-machine capture into Beautonomi finance records.
 * Relies on DB triggers for finance_transactions — never inserts FT here.
 */
export async function settleCardMachinePayment(
  supabase: SupabaseClient,
  input: SettleCardMachinePaymentInput,
): Promise<{ settled: boolean; reason?: string; bookingId?: string }> {
  const providerPaymentId = input.providerPaymentId;
  let entityType = input.entityType;
  let entityId = input.entityId;
  if (entityType === "sale") {
    const admin = getSupabaseAdmin();
    const resolved = await resolveSaleEntityTarget(
      admin,
      input.providerId,
      entityType,
      entityId,
    );
    entityType = resolved.entityType as CardMachineEntityType;
    entityId = resolved.entityId;
  }
  const resolvedInput: SettleCardMachinePaymentInput = { ...input, entityType, entityId };

  switch (resolvedInput.entityType) {
    case "booking":
      return settleBookingPayment(supabase, resolvedInput, providerPaymentId);
    case "group_booking":
      return settleGroupBookingPayment(supabase, resolvedInput, providerPaymentId);
    case "sale":
      return settleSalePayment(supabase, resolvedInput, providerPaymentId);
    case "product_order":
      return settleProductOrderPayment(supabase, resolvedInput, providerPaymentId);
    case "additional_charge":
      return settleAdditionalChargePayment(supabase, resolvedInput, providerPaymentId);
    default:
      return { settled: false, reason: `Unsupported entity type: ${input.entityType}` };
  }
}

async function settleExtrasAfterBase(
  supabase: SupabaseClient,
  input: SettleCardMachinePaymentInput,
  params: {
    bookingId: string;
    tenantId: string | null;
    providerPaymentId: string;
    baseFullySettled: boolean;
  },
): Promise<void> {
  if (!params.baseFullySettled) return;

  const tip = Math.max(0, Number(input.tipAmount ?? 0));
  if (tip > 0) {
    await settleCardMachineTip(supabase, {
      paymentProvider: input.paymentProvider,
      bookingId: params.bookingId,
      tenantId: params.tenantId,
      tip,
      providerPaymentId: params.providerPaymentId,
      merchantReference: input.merchantReference,
      paymentId: input.paymentId,
      processedBy: input.processedBy,
    });
  }

  const cashback = Math.max(0, Number(input.cashbackAmount ?? 0));
  if (cashback > 0) {
    await settleCardMachineCashback(supabase, {
      paymentProvider: input.paymentProvider,
      bookingId: params.bookingId,
      tenantId: params.tenantId,
      cashback,
      providerPaymentId: params.providerPaymentId,
      merchantReference: input.merchantReference,
      paymentId: input.paymentId,
      processedBy: input.processedBy,
    });
  }
}

async function settleBookingPayment(
  supabase: SupabaseClient,
  input: SettleCardMachinePaymentInput,
  providerPaymentId: string,
): Promise<{ settled: boolean; reason?: string; bookingId?: string }> {
  const bookingId = input.entityId;

  const { data: existing } = await supabase
    .from("booking_payments")
    .select("id")
    .eq("payment_provider", input.paymentProvider)
    .eq("payment_provider_id", providerPaymentId)
    .maybeSingle();
  if (existing) {
    return { settled: true, reason: "already_settled", bookingId };
  }

  const { data: bookingLoaded } = await supabase
    .from("bookings")
    .select(
      "id, booking_number, booking_source, payment_status, payment_reference, tenant_id, status, total_amount, total_paid, total_refunded, wallet_amount, gift_card_amount, platform_fee_amount, service_fee_amount, platform_fee_percentage, service_fee_percentage, platform_fee_paid_by, service_fee_paid_by, deposit_amount, additional_charges(id, amount, status, description, currency)",
    )
    .eq("id", bookingId)
    .eq("provider_id", input.providerId)
    .maybeSingle();

  if (!bookingLoaded) return { settled: false, reason: "booking_not_found" };

  const feeClear = await clearUncollectedProviderPortalPlatformFeeIfNeeded(
    supabase,
    bookingLoaded as BookingFeeClearRow,
  );
  const booking = feeClear.cleared
    ? (feeClear.booking as typeof bookingLoaded)
    : bookingLoaded;

  if (booking.status === "cancelled" || booking.status === "no_show") {
    return { settled: false, reason: "booking_not_collectible" };
  }

  const baseRemaining = await baseRemainingForBooking(supabase, booking);
  const chargeRows = unpaidChargeRows(booking as { additional_charges?: AdditionalChargeRow[] });

  if (baseRemaining <= 0 && chargeRows.length === 0) {
    await notifyTerminalCaptureOnAlreadyPaidBooking(supabase, input, providerPaymentId, bookingId);
    return { settled: true, reason: "already_paid", bookingId };
  }

  const tip = Math.max(0, Number(input.tipAmount ?? 0));
  const cashback = Math.max(0, Number(input.cashbackAmount ?? 0));

  let basePaymentInserted = false;
  let basePaymentAmount = 0;
  if (baseRemaining > 0) {
    const paymentAmount = allocateBaseFromCapture({
      captured: input.amount,
      baseRemaining,
      tip,
      cashback,
      expectedBase: input.expectedBaseAmount,
    });
    basePaymentAmount = paymentAmount;
    const { error } = await supabase.from("booking_payments").insert({
      booking_id: bookingId,
      tenant_id: booking.tenant_id,
      amount: paymentAmount,
      payment_method: "card",
      payment_provider: input.paymentProvider,
      payment_provider_id: providerPaymentId,
      payment_provider_data: {
        [`${input.paymentProvider}_payment_id`]: providerPaymentId,
        merchant_reference: input.merchantReference ?? null,
        ...(input.paymentProvider === "paycloud"
          ? { merchant_order_no: input.merchantReference ?? null }
          : {}),
        payment_id: input.paymentId,
      },
      status: "completed",
      notes: `${PROVIDER_LABEL[input.paymentProvider]} payment - ${providerPaymentId}`,
      created_by: input.processedBy ?? null,
    });

    if (error) {
      if (error.code === "23505") return { settled: true, reason: "concurrent_insert", bookingId };
      throw error;
    }
    basePaymentInserted = true;
  }

  const baseFullySettled =
    baseRemaining <= 0 ||
    (basePaymentInserted && basePaymentAmount >= baseRemaining - 0.01);

  const chargesTotal = chargeRows.reduce((sum, charge) => sum + Number(charge?.amount || 0), 0);
  if (
    baseFullySettled &&
    capturedFundsCoverCharges({
      captured: input.amount,
      baseApplied: basePaymentAmount,
      tip,
      cashback,
      chargesTotal,
    })
  ) {
    await settleUnpaidAdditionalCharges(
      input.paymentProvider,
      bookingId,
      input.providerId,
      booking.tenant_id,
      chargeRows,
      providerPaymentId,
      input.processedBy,
    );
  }

  await settleExtrasAfterBase(supabase, input, {
    bookingId,
    tenantId: booking.tenant_id,
    providerPaymentId,
    baseFullySettled,
  });

  return { settled: true, bookingId };
}

async function settleGroupBookingPayment(
  supabase: SupabaseClient,
  input: SettleCardMachinePaymentInput,
  providerPaymentId: string,
): Promise<{ settled: boolean; reason?: string }> {
  const groupId = input.entityId;

  const { data: bookingsRaw } = await supabase
    .from("bookings")
    .select(
      "id, tenant_id, created_at, total_amount, total_paid, total_refunded, wallet_amount, gift_card_amount, status, additional_charges(id, amount, status, description, currency)",
    )
    .eq("group_booking_id", groupId)
    .eq("provider_id", input.providerId)
    .not("status", "in", "(cancelled,no_show)")
    .order("created_at", { ascending: true });

  const bookings = bookingsRaw ?? [];
  if (!bookings.length) return { settled: false, reason: "no_child_bookings" };

  const { data: groupParticipants, error: groupParticipantsError } = await supabase
    .from("booking_participants")
    .select("booking_id, is_primary_contact")
    .eq("group_booking_id", groupId);
  if (groupParticipantsError) {
    console.error("[settle-card-machine-payment] booking_participants lookup failed", groupParticipantsError);
  }

  const primaryParticipantBookingId =
    (groupParticipants ?? []).find(
      (p) => p.is_primary_contact && typeof p.booking_id === "string" && p.booking_id,
    )?.booking_id ?? null;
  const tipTargetBooking =
    bookings.find((b) => b.id === primaryParticipantBookingId) ?? bookings[0];

  const tip = Math.max(0, Number(input.tipAmount ?? 0));
  const cashback = Math.max(0, Number(input.cashbackAmount ?? 0));
  const baseBudget = Math.max(0, input.amount - tip - cashback);
  let totalBaseOwed = 0;
  const baseRemainingById = new Map<string, number>();
  for (const booking of bookings) {
    const remaining = await baseRemainingForBooking(supabase, booking);
    baseRemainingById.set(String(booking.id ?? ""), remaining);
    totalBaseOwed += remaining;
  }

  const rows: Record<string, unknown>[] = [];
  const addonSettlements: {
    bookingId: string;
    tenantId: string | null;
    charges: AdditionalChargeRow[];
  }[] = [];

  let remainingBudget = baseBudget;

  for (const booking of bookings) {
    const baseRemaining = baseRemainingById.get(String(booking.id ?? "")) ?? 0;
    const chargeRows = unpaidChargeRows(booking as { additional_charges?: AdditionalChargeRow[] });

    if (baseRemaining > 0 && remainingBudget > 0) {
      const alloc = Math.min(baseRemaining, remainingBudget);
      rows.push({
        booking_id: booking.id,
        tenant_id: booking.tenant_id,
        amount: alloc,
        payment_method: "card",
        payment_provider: input.paymentProvider,
        payment_provider_id: `${providerPaymentId}:${booking.id}`,
        payment_provider_data: {
          [`${input.paymentProvider}_payment_id`]: providerPaymentId,
          merchant_reference: input.merchantReference ?? null,
          group_booking_id: groupId,
        },
        status: "completed",
        notes: `${PROVIDER_LABEL[input.paymentProvider]} group payment - ${providerPaymentId}`,
        created_by: input.processedBy ?? null,
      });
      remainingBudget = Math.round((remainingBudget - alloc) * 100) / 100;

      if (chargeRows.length > 0 && alloc >= baseRemaining - 0.01) {
        addonSettlements.push({
          bookingId: booking.id,
          tenantId: booking.tenant_id,
          charges: chargeRows,
        });
      }
    } else if (chargeRows.length > 0 && baseRemaining <= 0) {
      addonSettlements.push({
        bookingId: booking.id,
        tenantId: booking.tenant_id,
        charges: chargeRows,
      });
    }
  }

  if (!rows.length && !addonSettlements.length) {
    const { data: priorLegs } = await supabase
      .from("booking_payments")
      .select("id")
      .eq("payment_provider", input.paymentProvider)
      .like("payment_provider_id", `${providerPaymentId}:%`)
      .limit(1);
    if ((priorLegs ?? []).length > 0) {
      return { settled: true, reason: "already_settled" };
    }
    await notifyTerminalCaptureOnAlreadyPaidBooking(
      supabase,
      input,
      providerPaymentId,
      tipTargetBooking?.id ?? null,
    );
    return { settled: true, reason: "group_already_paid" };
  }

  if (rows.length) {
    const { error } = await supabase.from("booking_payments").insert(rows);
    if (error) {
      if (error.code === "23505") return { settled: true, reason: "concurrent_insert" };
      throw error;
    }
  }

  const groupChargesTotal = addonSettlements.reduce(
    (sum, item) => sum + item.charges.reduce((inner, charge) => inner + Number(charge?.amount || 0), 0),
    0,
  );
  if (groupChargesTotal > 0.01 && remainingBudget + 0.01 < groupChargesTotal) {
    addonSettlements.length = 0;
  }

  for (const item of addonSettlements) {
    await settleUnpaidAdditionalCharges(
      input.paymentProvider,
      item.bookingId,
      input.providerId,
      item.tenantId,
      item.charges,
      providerPaymentId,
      input.processedBy,
    );
  }

  const totalBaseAllocated = Math.round((baseBudget - remainingBudget) * 100) / 100;
  const baseFullyCovered =
    totalBaseOwed <= 0.01 || totalBaseAllocated + 0.01 >= totalBaseOwed;
  if (tipTargetBooking && baseFullyCovered && totalBaseOwed > 0.01) {
    await settleExtrasAfterBase(supabase, input, {
      bookingId: tipTargetBooking.id,
      tenantId: tipTargetBooking.tenant_id,
      providerPaymentId,
      baseFullySettled: true,
    });
  }

  return { settled: true };
}

async function settleSalePayment(
  supabase: SupabaseClient,
  input: SettleCardMachinePaymentInput,
  providerPaymentId: string,
): Promise<{ settled: boolean; reason?: string }> {
  const admin = getSupabaseAdmin();
  const { data: saleRow, error: saleRowError } = await admin
    .from("sales")
    .select("payment_status")
    .eq("id", input.entityId)
    .eq("provider_id", input.providerId)
    .maybeSingle();
  if (saleRowError) throw new Error(saleRowError.message);
  if (!saleRow) return { settled: false, reason: "sale_not_found" };
  if (String((saleRow as { payment_status?: string }).payment_status ?? "") === "completed") {
    return { settled: true };
  }
  const due = await saleCardAmountStillDueForSale(admin, input.providerId, input.entityId);
  if (due == null || due > 0.02) return { settled: false, reason: "amount_mismatch" };
  const gift = await settleReservedSaleGiftCard(getSupabaseAdmin(), input.entityId, {
    cardAmount: input.amount,
    cardAmountAlreadyRecorded: true,
  });
  if (!gift.ok) return { settled: false, reason: "gift_card_not_captured" };

  const { error } = await supabase
    .from("sales")
    .update({
      payment_status: "completed",
      payment_provider: input.paymentProvider,
      payment_provider_id: providerPaymentId,
      payment_method: input.paymentProvider === "yoco" ? "yoco" : "card",
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.entityId)
    .eq("provider_id", input.providerId);

  if (error) throw error;
  return { settled: true };
}

async function settleProductOrderPayment(
  supabase: SupabaseClient,
  input: SettleCardMachinePaymentInput,
  providerPaymentId: string,
): Promise<{ settled: boolean; reason?: string }> {
  const admin = getSupabaseAdmin();
  const tip = Math.max(0, Number(input.tipAmount ?? 0));
  const cashback = Math.max(0, Number(input.cashbackAmount ?? 0));
  const base = Math.round(Math.max(0, Number(input.amount) - tip - cashback) * 100) / 100;
  const { productOrderCardAmountStillDue } = await import(
    "@/lib/payments/resolve-paystack-initialize-amount"
  );
  const due = await productOrderCardAmountStillDue(admin, input.entityId, providerPaymentId);
  if (due.ok === false) return { settled: false, reason: "payment_lookup_failed" };
  const baseCoversDue = Math.abs(base - due.due) <= 0.02;
  if (base > due.due + 0.02) return { settled: false, reason: "amount_mismatch" };

  const result = await recordProductOrderPayment({
    supabase: admin,
    productOrderId: input.entityId,
    reference: providerPaymentId,
    amountMajor: base,
    source: input.paymentProvider === "yoco" ? "yoco_terminal" : "paycloud_terminal",
    provider: input.paymentProvider,
    platformHeld: false,
  });
  if (!result.ok) return { settled: false, reason: "product_order_record_failed" };
  if (!baseCoversDue || !result.transitionedToPaid) {
    return { settled: false, reason: "payment_not_settled" };
  }

  const { data: order } = await (admin.from("product_orders") as any)
    .select("id, order_source, status, provider_id")
    .eq("id", input.entityId)
    .maybeSingle();
  if (
    order &&
    String(order.order_source ?? "") === "walk_in" &&
    String(order.status ?? "") !== "delivered"
  ) {
    const { fulfillWalkInProductOrderDelivery } = await import(
      "@/lib/provider-sales/fulfill-walk-in-product-order-delivery"
    );
    const delivery = await fulfillWalkInProductOrderDelivery({
      supabase: admin,
      providerId: String(order.provider_id ?? input.providerId),
      orderId: input.entityId,
    });
    if (delivery.ok === false) {
      console.error("[settle-card-machine] walk-in delivery failed:", delivery.reason);
    }
  }

  return { settled: true };
}

async function settleAdditionalChargePayment(
  supabase: SupabaseClient,
  input: SettleCardMachinePaymentInput,
  providerPaymentId: string,
): Promise<{ settled: boolean; reason?: string; bookingId?: string }> {
  const admin = getSupabaseAdmin();
  const { data: charge } = await admin
    .from("additional_charges")
    .select("id, booking_id, amount, status, description, bookings!inner(provider_id, tenant_id, booking_number, ref_number, customer_id, currency)")
    .eq("id", input.entityId)
    .maybeSingle();

  if (!charge) return { settled: false, reason: "charge_not_found" };
  const booking = (charge as { bookings?: { provider_id?: string; tenant_id?: string | null } }).bookings;
  if (!booking || booking.provider_id !== input.providerId) {
    return { settled: false, reason: "charge_not_found" };
  }
  if (charge.status === "paid" || charge.status === "rejected") {
    return { settled: true, reason: "already_paid", bookingId: charge.booking_id };
  }

  const chargeRef = `${providerPaymentId}:charge:${charge.id}`;
  const { data: existing } = await supabase
    .from("booking_payments")
    .select("id")
    .eq("payment_provider", input.paymentProvider)
    .eq("payment_provider_id", chargeRef)
    .maybeSingle();
  if (existing) return { settled: true, reason: "already_settled", bookingId: charge.booking_id };

  const held = await sumAdditionalChargeTenderLegs(admin, charge.booking_id, charge.id);
  const heldTotal = held.wallet + held.gift;
  if (heldTotal > 0.009) {
    const chargeAmount = Number(charge.amount ?? 0);
    const stillDue = additionalChargeAmountStillDue(chargeAmount, heldTotal);
    const tip = Math.max(0, Number(input.tipAmount ?? 0));
    const cashback = Math.max(0, Number(input.cashbackAmount ?? 0));
    const capturedBase =
      input.expectedBaseAmount != null
        ? Number(input.expectedBaseAmount)
        : Math.max(0, Number(input.amount) - tip - cashback);
    const bookingJoin = booking as {
      provider_id?: string;
      tenant_id?: string | null;
      booking_number?: string | null;
      ref_number?: string | null;
      customer_id?: string | null;
      currency?: string | null;
    };
    if (stillDue <= 0.009) {
      if (capturedBase > 0.02) {
        return { settled: false, reason: "charge_already_covered", bookingId: charge.booking_id };
      }
      const covered = await settleAdditionalChargeWithoutPaystack(admin, {
        bookingId: charge.booking_id,
        chargeId: charge.id,
        customerId: String(bookingJoin.customer_id ?? input.processedBy ?? input.providerId),
        providerId: input.providerId,
        tenantId: booking.tenant_id ?? null,
        bookingNumber: String(bookingJoin.booking_number ?? bookingJoin.ref_number ?? charge.booking_id),
        chargeAmount,
        walletAmountApplied: held.wallet,
        giftCardAmountApplied: held.gift,
      });
      if (covered.ok === false) {
        await rollbackCollectibleSplitLeg(admin, {
          bookingId: charge.booking_id,
          customerId: String(bookingJoin.customer_id ?? input.processedBy ?? input.providerId),
          currency: String(bookingJoin.currency ?? LAST_RESORT_CURRENCY),
          tenantId: booking.tenant_id ?? null,
          providerId: input.providerId,
          walletAmountToReverse: held.wallet,
          giftCardAmountToReverse: held.gift,
          paymentLegSuffix: `:additional:${charge.id}`,
          idempotencyKey: `additional_charge_card_machine_rollback:${charge.id}`,
        });
        return { settled: false, reason: covered.error, bookingId: charge.booking_id };
      }
      return { settled: true, bookingId: charge.booking_id };
    }
    const remainder = await settleAdditionalChargeRemainderAfterHold(admin, {
      bookingId: charge.booking_id,
      chargeId: charge.id,
      providerId: input.providerId,
      tenantId: booking.tenant_id ?? null,
      chargeAmount,
      chargeDescription: (charge as { description?: string | null }).description ?? null,
      heldWallet: held.wallet,
      heldGift: held.gift,
      remainderAmount: capturedBase,
      paymentProvider: input.paymentProvider,
      paymentMethod: "card",
      reference: chargeRef,
      createdBy: input.processedBy ?? null,
    });
    if (remainder.ok === false) {
      return { settled: false, reason: remainder.error, bookingId: charge.booking_id };
    }
    await notifyCardMachineAdditionalChargePaid(admin, charge.id);
    return { settled: true, bookingId: charge.booking_id };
  }

  const { error } = await admin.rpc("record_walk_in_additional_charge_payment", {
    p_booking_id: charge.booking_id,
    p_charge_id: charge.id,
    p_provider_id: input.providerId,
    p_tenant_id: booking.tenant_id ?? null,
    p_payment_provider: input.paymentProvider,
    p_payment_method: "card",
    p_reference: chargeRef,
    p_created_by: input.processedBy ?? null,
  });

  if (error) throw new Error(error.message || "Failed to settle additional charge");

  await notifyCardMachineAdditionalChargePaid(admin, charge.id);

  await settleExtrasAfterBase(supabase, input, {
    bookingId: charge.booking_id,
    tenantId: booking.tenant_id ?? null,
    providerPaymentId,
    baseFullySettled: true,
  });

  return { settled: true, bookingId: charge.booking_id };
}

/**
 * Reverse a previously-settled card-machine capture after void/refund.
 * Never settles a void as income.
 */
export async function reverseCardMachineSettlement(
  supabase: SupabaseClient,
  input: ReverseCardMachineSettlementInput,
): Promise<{ reversed: boolean; reason?: string }> {
  let entityType = input.entityType;
  let entityId = input.entityId;
  if (entityType === "sale") {
    const admin = getSupabaseAdmin();
    const resolved = await resolveSaleEntityTarget(
      admin,
      input.providerId,
      entityType,
      entityId,
    );
    entityType = resolved.entityType as CardMachineEntityType;
    entityId = resolved.entityId;
  }
  const resolvedInput: ReverseCardMachineSettlementInput = { ...input, entityType, entityId };

  switch (resolvedInput.entityType) {
    case "booking":
    case "group_booking":
    case "additional_charge":
      return reverseBookingCardMachinePayments(supabase, resolvedInput);
    case "sale":
      return reverseSaleCardMachinePayment(supabase, resolvedInput);
    case "product_order":
      return reverseProductOrderCardMachinePayment(supabase, resolvedInput);
    default:
      return { reversed: false, reason: `unsupported_${resolvedInput.entityType}` };
  }
}

async function reverseBookingCardMachinePayments(
  supabase: SupabaseClient,
  input: ReverseCardMachineSettlementInput,
): Promise<{ reversed: boolean; reason?: string }> {
  if (!input.origProviderPaymentId) return { reversed: false, reason: "missing_original_reference" };

  const { data: payments } = await supabase
    .from("booking_payments")
    .select("id, booking_id, amount, status, payment_provider_id, payment_provider_data")
    .eq("payment_provider", input.paymentProvider)
    .like("payment_provider_id", `${input.origProviderPaymentId}%`);

  const rows = (payments ?? []).filter(
    (p) => p.status === "completed" || p.status === "partially_refunded",
  );
  if (!rows.length) return { reversed: false, reason: "no_original_payment" };

  const sortedRows = [...rows].sort((a, b) => {
    const aRank = paymentSuffixRank(String((a as { payment_provider_id?: string }).payment_provider_id ?? ""));
    const bRank = paymentSuffixRank(String((b as { payment_provider_id?: string }).payment_provider_id ?? ""));
    return aRank - bRank;
  });

  const tipRowsToUnbump: Array<{ bookingId: string; amount: number }> = [];
  const reversalKind = input.reversalKind ?? "void";
  const partialCap =
    input.refundAmount != null && input.refundAmount > 0 ? Number(input.refundAmount) : null;

  for (const p of sortedRows) {
    const providerPaymentId = String((p as { payment_provider_id?: string }).payment_provider_id ?? "");
    const isTipRow = providerPaymentId.endsWith(":tip");
    const isCashbackRow = providerPaymentId.endsWith(":cashback");
    if (partialCap != null && (isTipRow || isCashbackRow)) continue;

    const { data: existingRefund } = await supabase
      .from("booking_refunds")
      .select("id")
      .eq("payment_id", p.id)
      .eq("refund_provider_id", input.voidReference)
      .maybeSingle();
    if (existingRefund) continue;

    const rowAmount = Number(p.amount ?? 0);
    const refundInsertAmount =
      partialCap != null ? Math.min(rowAmount, partialCap) : rowAmount;
    if (refundInsertAmount <= 0) continue;

    const { error } = await supabase.from("booking_refunds").insert({
      booking_id: p.booking_id,
      payment_id: p.id,
      amount: refundInsertAmount,
      reason:
        reversalKind === "refund"
          ? `${input.paymentProvider}_refund`
          : `${input.paymentProvider}_void`,
      refund_method: "original",
      refund_provider_id: input.voidReference,
      status: "completed",
      notes: `${PROVIDER_LABEL[input.paymentProvider]} ${reversalKind} of ${input.origProviderPaymentId}`,
      created_by: input.processedBy ?? null,
    });
    if (error && error.code !== "23505") throw error;

    if (!error) {
      const nextStatus =
        partialCap != null && refundInsertAmount + 0.01 < rowAmount
          ? "partially_refunded"
          : "refunded";
      await supabase
        .from("booking_payments")
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq("id", p.id);
    }

    if (isTipRow && !error) {
      tipRowsToUnbump.push({
        bookingId: p.booking_id,
        amount: Number(p.amount ?? 0),
      });
    }

    if (partialCap != null) break;
  }

  for (const tip of tipRowsToUnbump) {
    const { data: booking } = await supabase
      .from("bookings")
      .select("tip_amount, total_amount")
      .eq("id", tip.bookingId)
      .maybeSingle();
    if (booking) {
      await supabase
        .from("bookings")
        .update({
          tip_amount: Math.max(0, Number(booking.tip_amount ?? 0) - tip.amount),
          total_amount: Math.max(0, Number(booking.total_amount ?? 0) - tip.amount),
          updated_at: new Date().toISOString(),
        })
        .eq("id", tip.bookingId);
    }
  }

  const syncedBookings = new Set(
    sortedRows.map((p) => String((p as { booking_id?: string }).booking_id ?? "")).filter(Boolean),
  );
  try {
    const { syncBookingRefundTransactions } = await import(
      "@/lib/finance/sync-booking-refund-transactions"
    );
    for (const bookingId of syncedBookings) {
      await syncBookingRefundTransactions(
        supabase,
        bookingId,
        `${input.paymentProvider}_${reversalKind}`,
        input.processedBy ?? null,
      );
    }
  } catch (syncErr) {
    console.warn("Failed to sync payment transactions after card-machine reversal:", syncErr);
  }

  return { reversed: true };
}

async function reverseProductOrderCardMachinePayment(
  supabase: SupabaseClient,
  input: ReverseCardMachineSettlementInput,
): Promise<{ reversed: boolean; reason?: string }> {
  if (!input.origProviderPaymentId) {
    return { reversed: false, reason: "missing_original_reference" };
  }

  const admin = getSupabaseAdmin();
  const { data: order } = await admin
    .from("product_orders")
    .select(
      "id, payment_status, payment_reference, payment_method, provider_id, customer_id, tenant_id, currency, order_number, total_amount, wallet_amount, gift_card_amount, status",
    )
    .eq("id", input.entityId)
    .eq("provider_id", input.providerId)
    .maybeSingle();

  if (!order) return { reversed: false, reason: "order_not_found" };
  if (order.payment_status !== "paid" && order.payment_status !== "partially_refunded") {
    return { reversed: true, reason: "already_unpaid" };
  }

  if (
    order.payment_reference &&
    order.payment_reference !== input.origProviderPaymentId
  ) {
    return { reversed: false, reason: "reference_mismatch" };
  }

  const { data: paymentTx } = await admin
    .from("payment_transactions")
    .select("amount, status")
    .eq("provider", input.paymentProvider)
    .eq("reference", input.origProviderPaymentId)
    .maybeSingle();

  const collectibleTotal = computeInPersonCollectibleAmount(order);
  const paidAmount = Math.max(0, Number(paymentTx?.amount ?? collectibleTotal));
  const refundAmount =
    input.refundAmount != null && input.refundAmount > 0 ? Number(input.refundAmount) : paidAmount;
  const isFullRefund = refundAmount + 0.01 >= paidAmount;

  let giftReturned = false;
  let giftVoidResult: "restored" | "missing" | "failed" | null = null;
  if (isFullRefund && isProviderCollectedProductMethod(String(order.payment_method ?? ""))) {
    const split = productOrderTenderSplit(order);
    let walletCredit = computeProductOrderCancelWalletCredit(order, 0);
    if (split.gift > 0.009) {
      const { voidProductOrderGiftCard } = await import("@/lib/ecommerce/product-order-gift-card");
      const voided = await voidProductOrderGiftCard(admin, input.entityId);
      giftVoidResult = voided;
      if (voided === "failed") return { reversed: false, reason: "gift_card_not_restored" };
      giftReturned = true;
      if (productOrderCancelIncludesGiftInWallet(voided)) {
        walletCredit = roundProductOrderMoney(walletCredit + split.gift);
      }
    }
    const customerId = (order as { customer_id?: string | null }).customer_id;
    if (walletCredit > 0.009 && customerId) {
      const { error: walletError } = await (admin.rpc as any)("wallet_credit_admin", {
        p_user_id: customerId,
        p_amount: walletCredit,
        p_currency: (order as { currency?: string | null }).currency || LAST_RESORT_CURRENCY,
        p_description: `Refund for order ${(order as { order_number?: string | null }).order_number || input.entityId.slice(0, 8)}`,
        p_reference_id: input.entityId,
        p_reference_type: "product_order_refund",
        p_tenant_id: (order as { tenant_id?: string | null }).tenant_id ?? null,
        p_idempotency_key: `product_order_cancel_refund:${input.entityId}`,
      });
      if (walletError) return { reversed: false, reason: "wallet_credit_failed" };
    }
    // Wallet and gift were platform-held. Earnings for that slice are net of
    // the platform fee, so the payout is reduced by the posted earnings, not
    // by the gross amount returned to the customer. The card refund already
    // left the provider's till and is not clawed again.
    if (giftVoidResult != null || walletCredit > 0.009) {
      const clawKey = `product_order_card_refund:${input.entityId}`;
      const description = `Card refund returned platform-held tender (${clawKey})`;
      const { data: heldRows, error: heldError } = await admin
        .from("finance_transactions")
        .select("transaction_type, net, amount, description")
        .eq("product_order_id", input.entityId)
        .in("transaction_type", ["provider_earnings", "platform_fee", "refund"]);
      if (heldError) throw new Error(heldError.message);
      const rows = (heldRows ?? []) as Array<{
        transaction_type?: string;
        net?: number | string | null;
        amount?: number | string | null;
        description?: string | null;
      }>;
      const alreadyClawed = rows.some(
        (row) => row.transaction_type === "refund" && String(row.description ?? "") === description,
      );
      if (!alreadyClawed) {
        const sumNet = (type: string) =>
          roundProductOrderMoney(
            rows
              .filter((row) => row.transaction_type === type)
              .reduce((sum, row) => sum + Number(row.net ?? row.amount ?? 0), 0),
          );
        const earnings = sumNet("provider_earnings");
        const fee = sumNet("platform_fee");
        const currency = (order as { currency?: string | null }).currency || LAST_RESORT_CURRENCY;
        const tenantId = (order as { tenant_id?: string | null }).tenant_id ?? null;
        const refundRows: Record<string, unknown>[] = [];
        if (earnings > 0.009) {
          refundRows.push({
            booking_id: null,
            product_order_id: input.entityId,
            provider_id: input.providerId,
            tenant_id: tenantId,
            transaction_type: "refund",
            refund_component: "provider_earnings",
            amount: earnings,
            fees: 0,
            commission: 0,
            net: -earnings,
            currency,
            description,
            created_at: new Date().toISOString(),
          });
        }
        if (fee > 0.009) {
          refundRows.push({
            booking_id: null,
            product_order_id: input.entityId,
            provider_id: input.providerId,
            tenant_id: tenantId,
            transaction_type: "refund",
            refund_component: "platform_fee",
            amount: fee,
            fees: 0,
            commission: 0,
            net: -fee,
            currency,
            description,
            created_at: new Date().toISOString(),
          });
        }
        if (refundRows.length > 0) {
          const { error: refundError } = await admin.from("finance_transactions").insert(refundRows);
          if (refundError) throw new Error(refundError.message);
        }
      }
    }
  }

  const orderUpdate: Record<string, unknown> = {
    payment_status: isFullRefund ? "refunded" : "partially_refunded",
    updated_at: new Date().toISOString(),
  };
  if (giftReturned) {
    orderUpdate.gift_card_amount = 0;
    orderUpdate.gift_card_id = null;
  }
  if (isFullRefund) {
    orderUpdate.status = "refunded";
  }

  const { error: orderErr } = await admin
    .from("product_orders")
    .update(orderUpdate)
    .eq("id", input.entityId)
    .eq("provider_id", input.providerId);

  if (orderErr) throw orderErr;

  await admin
    .from("payment_transactions")
    .update({
      status: isFullRefund ? "refunded" : "partially_refunded",
      updated_at: new Date().toISOString(),
    })
    .eq("provider", input.paymentProvider)
    .eq("reference", input.origProviderPaymentId);

  return { reversed: true };
}

async function reverseSaleCardMachinePayment(
  supabase: SupabaseClient,
  input: ReverseCardMachineSettlementInput,
): Promise<{ reversed: boolean; reason?: string }> {
  const { data: refunded, error } = await supabase
    .from("sales")
    .update({
      payment_status: "refunded",
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.entityId)
    .eq("provider_id", input.providerId)
    .eq("payment_provider", input.paymentProvider)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!refunded) return { reversed: false, reason: "sale_not_refunded" };
  await restoreSaleGiftCard(getSupabaseAdmin(), input.entityId);
  return { reversed: true };
}
